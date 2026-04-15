import type { BleRecorder } from './ble-recorder.ts';
import type { GattServiceSnapshot, CaptureSession, DeviceInfo } from './types.ts';
import { renderGattExplorer } from './gatt-explorer.ts';

// Known smartcube service UUIDs from supported protocols (full 128-bit format required by Chrome)
const KNOWN_SERVICES = [
    // GAN Gen1/2/3
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000fff1-0000-1000-8000-00805f9b34fb',
    '0000fff2-0000-1000-8000-00805f9b34fb',
    // GAN Gen4 / GoCube / Rubik's Connected (UART)
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    // Giiker
    '0000aadb-0000-1000-8000-00805f9b34fb',
    '0000aaaa-0000-1000-8000-00805f9b34fb',
    // MoYu
    '00001000-0000-1000-8000-00805f9b34fb',
    '0783b03e-8535-b5a0-7140-a304d2495cb7',
    // QiYi
    '0000fff0-0000-1000-8000-00805f9b34fb',
    // Generic BLE standard services
    '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
    '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
    '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
    '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
    '0000fee7-0000-1000-8000-00805f9b34fb',
];

export interface CaptureModeResult {
    device: BluetoothDevice;
    services: GattServiceSnapshot[];
}

export interface CaptureModeCallbacks {
    onConnected: (device: BluetoothDevice) => void;
    onDisconnected: () => void;
    onStatus: (msg: string) => void;
    recorder: BleRecorder;
}

export async function connectCaptureMode(
    extraServiceInput: string,
    callbacks: CaptureModeCallbacks,
): Promise<CaptureModeResult | null> {
    const { recorder, onConnected, onDisconnected, onStatus } = callbacks;

    // Build service list
    const extraServices = extraServiceInput
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    const optionalServices = Array.from(new Set([...KNOWN_SERVICES, ...extraServices]));

    onStatus('Select your Bluetooth device…');

    let device: BluetoothDevice;
    try {
        device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices,
        });
    } catch (e) {
        if (e instanceof DOMException && e.name === 'NotFoundError') {
            onStatus('No device selected.');
        } else {
            onStatus(`Connection error: ${e instanceof Error ? e.message : String(e)}`);
        }
        return null;
    }

    onStatus('Connecting to GATT server…');
    try {
        await device.gatt!.connect();
    } catch (e) {
        onStatus(`GATT connect failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }

    device.addEventListener('gattserverdisconnected', () => {
        onDisconnected();
    });

    onStatus(`Connected to "${device.name ?? device.id}"`);
    onConnected(device);

    // Discover services and render explorer
    const gattTree = document.getElementById('gatt-tree')!;
    let capturedServices: GattServiceSnapshot[] = [];

    try {
        capturedServices = await renderGattExplorer(gattTree, device, {
            recorder,
            onSnapshot: (s) => { capturedServices = s; },
        });
    } catch (e) {
        onStatus(`GATT exploration error: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { device, services: capturedServices };
}

export function buildCaptureSession(
    device: BluetoothDevice,
    services: GattServiceSnapshot[],
    recorder: BleRecorder,
): CaptureSession {
    const info: DeviceInfo = {
        name: device.name ?? device.id,
        id: device.id,
    };
    return {
        format: 'ble-capture',
        version: 1,
        capturedAt: new Date().toISOString(),
        device: info,
        services,
        traffic: recorder.getTraffic(),
    };
}
