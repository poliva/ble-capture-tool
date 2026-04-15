/**
 * Monkey-patches Web Bluetooth prototypes to intercept all GATT traffic.
 * Used in fixture mode to capture raw BLE traffic while the library operates normally.
 */
import type { BleRecorder } from './ble-recorder.ts';

type AnyFn = (...args: unknown[]) => unknown;

interface Originals {
    charReadValue: AnyFn;
    charWriteWithResponse: AnyFn;
    charWriteWithoutResponse: AnyFn;
    charStartNotifications: AnyFn;
    charAddEventListener: AnyFn;
    serverGetPrimaryService: AnyFn;
    serverGetPrimaryServices: AnyFn;
    serviceGetCharacteristic: AnyFn;
    serviceGetCharacteristics: AnyFn;
}

let originals: Originals | null = null;

// Web Bluetooth globals are interface types in @types/web-bluetooth, not constructors.
// Access prototypes via window to avoid TS "only refers to a type" errors.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCharProto(): any { return w.BluetoothRemoteGATTCharacteristic?.prototype; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getServerProto(): any { return w.BluetoothRemoteGATTServer?.prototype; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getServiceProto(): any { return w.BluetoothRemoteGATTService?.prototype; }

function copyBuffer(value: BufferSource): ArrayBuffer {
    if (value instanceof ArrayBuffer) return value.slice(0);
    const dv = value as DataView;
    return dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength) as ArrayBuffer;
}

function getServiceUuid(char: BluetoothRemoteGATTCharacteristic): string {
    try {
        return char.service?.uuid ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

const wrapperMap = new WeakMap<AnyFn, AnyFn>();

export function installInterceptors(recorder: BleRecorder): void {
    if (originals !== null) return;

    const charProto = getCharProto();
    const serverProto = getServerProto();
    const serviceProto = getServiceProto();

    if (!charProto || !serverProto || !serviceProto) {
        console.warn('Web Bluetooth prototypes not available — interception disabled.');
        return;
    }

    originals = {
        charReadValue: charProto.readValue,
        charWriteWithResponse: charProto.writeValueWithResponse,
        charWriteWithoutResponse: charProto.writeValueWithoutResponse,
        charStartNotifications: charProto.startNotifications,
        charAddEventListener: charProto.addEventListener,
        serverGetPrimaryService: serverProto.getPrimaryService,
        serverGetPrimaryServices: serverProto.getPrimaryServices,
        serviceGetCharacteristic: serviceProto.getCharacteristic,
        serviceGetCharacteristics: serviceProto.getCharacteristics,
    };

    charProto.readValue = async function (this: BluetoothRemoteGATTCharacteristic, ...args: unknown[]) {
        const result = await originals!.charReadValue.apply(this, args) as DataView;
        const copy = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
        recorder.addTrafficEntry('read', getServiceUuid(this), this.uuid, copy);
        return result;
    };

    charProto.writeValueWithResponse = async function (this: BluetoothRemoteGATTCharacteristic, value: BufferSource, ...rest: unknown[]) {
        recorder.addTrafficEntry('write', getServiceUuid(this), this.uuid, copyBuffer(value));
        return originals!.charWriteWithResponse.apply(this, [value, ...rest]);
    };

    charProto.writeValueWithoutResponse = async function (this: BluetoothRemoteGATTCharacteristic, value: BufferSource, ...rest: unknown[]) {
        recorder.addTrafficEntry('write', getServiceUuid(this), this.uuid, copyBuffer(value));
        return originals!.charWriteWithoutResponse.apply(this, [value, ...rest]);
    };

    charProto.startNotifications = async function (this: BluetoothRemoteGATTCharacteristic, ...args: unknown[]) {
        return originals!.charStartNotifications.apply(this, args);
    };

    charProto.addEventListener = function (
        this: BluetoothRemoteGATTCharacteristic,
        type: string,
        listener: unknown,
        options?: unknown,
    ) {
        if (type === 'characteristicvaluechanged' && typeof listener === 'function') {
            const serviceUuid = getServiceUuid(this);
            const charUuid = this.uuid;
            const original = listener as (ev: Event) => void;
            const wrapped = (ev: Event): void => {
                const char = ev.target as BluetoothRemoteGATTCharacteristic;
                if (char.value) {
                    const copy = char.value.buffer.slice(
                        char.value.byteOffset,
                        char.value.byteOffset + char.value.byteLength,
                    ) as ArrayBuffer;
                    recorder.addTrafficEntry('notify', serviceUuid, charUuid, copy);
                }
                original(ev);
            };
            wrapperMap.set(original as AnyFn, wrapped as AnyFn);
            return originals!.charAddEventListener.call(this, type, wrapped, options);
        }
        return originals!.charAddEventListener.apply(this, [type, listener, options]);
    };

    serverProto.getPrimaryService = async function (this: BluetoothRemoteGATTServer, service: BluetoothServiceUUID, ...rest: unknown[]) {
        const result = await originals!.serverGetPrimaryService.apply(this, [service, ...rest]);
        recorder.addTrafficEntry('discover-service', String(service), undefined, undefined);
        return result;
    };

    serverProto.getPrimaryServices = async function (this: BluetoothRemoteGATTServer, ...args: unknown[]) {
        const results = await originals!.serverGetPrimaryServices.apply(this, args) as BluetoothRemoteGATTService[];
        for (const svc of results) {
            recorder.addTrafficEntry('discover-service', svc.uuid, undefined, undefined);
        }
        return results;
    };

    serviceProto.getCharacteristic = async function (this: BluetoothRemoteGATTService, char: BluetoothCharacteristicUUID, ...rest: unknown[]) {
        const result = await originals!.serviceGetCharacteristic.apply(this, [char, ...rest]) as BluetoothRemoteGATTCharacteristic;
        recorder.addTrafficEntry('discover-char', this.uuid, result.uuid, undefined);
        return result;
    };

    serviceProto.getCharacteristics = async function (this: BluetoothRemoteGATTService, ...args: unknown[]) {
        const results = await originals!.serviceGetCharacteristics.apply(this, args) as BluetoothRemoteGATTCharacteristic[];
        for (const c of results) {
            recorder.addTrafficEntry('discover-char', this.uuid, c.uuid, undefined);
        }
        return results;
    };
}

export function removeInterceptors(): void {
    if (!originals) return;

    const charProto = getCharProto();
    const serverProto = getServerProto();
    const serviceProto = getServiceProto();

    if (charProto) {
        charProto.readValue = originals.charReadValue;
        charProto.writeValueWithResponse = originals.charWriteWithResponse;
        charProto.writeValueWithoutResponse = originals.charWriteWithoutResponse;
        charProto.startNotifications = originals.charStartNotifications;
        charProto.addEventListener = originals.charAddEventListener;
    }
    if (serverProto) {
        serverProto.getPrimaryService = originals.serverGetPrimaryService;
        serverProto.getPrimaryServices = originals.serverGetPrimaryServices;
    }
    if (serviceProto) {
        serviceProto.getCharacteristic = originals.serviceGetCharacteristic;
        serviceProto.getCharacteristics = originals.serviceGetCharacteristics;
    }

    originals = null;
}
