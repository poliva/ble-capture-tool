import type { BleRecorder } from './ble-recorder.ts';
import type { GattServiceSnapshot, FixtureSession, DeviceInfo } from './types.ts';
import { installInterceptors, removeInterceptors } from './ble-interceptor.ts';
import {
    connectSmartCube,
    getCachedMacForDevice,
    getRegisteredProtocols,
    type MacAddressProvider,
    type SmartCubeConnection,
} from 'smartcube-web-bluetooth';

export interface FixtureModeCallbacks {
    onConnected: (conn: SmartCubeConnection) => void;
    onDisconnected: () => void;
    onStatus: (msg: string) => void;
    recorder: BleRecorder;
    anyMode: boolean;
    recordFromConnect?: boolean;
}

export async function connectFixtureMode(
    callbacks: FixtureModeCallbacks,
): Promise<SmartCubeConnection | null> {
    const { recorder, onConnected, onDisconnected, onStatus, anyMode, recordFromConnect } = callbacks;

    // Install interceptors before the library uses Web Bluetooth
    installInterceptors(recorder);

    onStatus('Select your smartcube…');

    // Mirror cubedex's macAddressProvider: only prompt on fallback call so
    // advertisement-based discovery (GAN, MoYu32, QiYi) works automatically.
    const macAddressProvider: MacAddressProvider = async (device, isFallbackCall) => {
        if (!isFallbackCall) return null;
        const cached = getCachedMacForDevice(device) ?? '';
        const hint = typeof device.watchAdvertisements !== 'function'
            ? '\n\nTip: enable chrome://flags/#enable-experimental-web-platform-features for automatic MAC detection.'
            : '';
        return window.prompt(
            `Unable to detect cube MAC address automatically.\nEnter it manually (format AA:BB:CC:DD:EE:FF):${hint}`,
            cached,
        );
    };

    if (recordFromConnect && !recorder.isRecording) {
        recorder.startRecording();
    }

    let conn: SmartCubeConnection;
    try {
        conn = await connectSmartCube({
            deviceSelection: anyMode ? 'any' : 'filtered',
            macAddressProvider,
            enableAddressSearch: true,
            onStatus,
        });
    } catch (e) {
        if (recordFromConnect && recorder.isRecording) {
            recorder.stopRecording();
        }
        removeInterceptors();
        if (e instanceof DOMException && e.name === 'NotFoundError') {
            onStatus('No device selected.');
        } else {
            onStatus(`Connection error: ${e instanceof Error ? e.message : String(e)}`);
        }
        return null;
    }

    onStatus(`Connected to "${conn.deviceName}" via ${conn.protocol.name}`);
    onConnected(conn);

    // Forward decoded events to recorder
    const sub = conn.events$.subscribe({
        next: (ev) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recorder.addCubeEvent(ev as unknown as Record<string, unknown>);
            if (ev.type === 'DISCONNECT') {
                sub.unsubscribe();
                removeInterceptors();
                onDisconnected();
            }
        },
        error: () => {
            sub.unsubscribe();
            removeInterceptors();
            onDisconnected();
        },
    });

    return conn;
}

export function buildFixtureSession(
    conn: SmartCubeConnection,
    services: GattServiceSnapshot[],
    recorder: BleRecorder,
    meta?: { scenario?: string; notes?: string },
): FixtureSession {
    // If no services were explicitly discovered (library handles it internally),
    // return an empty array — the raw traffic still shows service discovery ops.
    const info: DeviceInfo = {
        name: conn.deviceName,
        id: '',
        mac: conn.deviceMAC || undefined,
    };
    return {
        format: 'smartcube-fixture',
        version: 1,
        capturedAt: new Date().toISOString(),
        device: info,
        protocol: conn.protocol,
        ...(meta?.scenario ? { scenario: meta.scenario } : {}),
        ...(meta?.notes ? { notes: meta.notes } : {}),
        services,
        traffic: recorder.getTraffic(),
        events: recorder.getCubeEvents(),
    };
}

export function getKnownProtocolNames(): string[] {
    return getRegisteredProtocols().map(p => {
        const filters = p.nameFilters.map(f => 'namePrefix' in f ? f.namePrefix : f.name).join(', ');
        return filters;
    });
}
