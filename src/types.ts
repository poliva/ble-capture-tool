export type TrafficOp =
    | 'read'
    | 'write'
    | 'notify'
    | 'discover-service'
    | 'discover-char'
    | 'marker';

export interface TrafficEntry {
    /** Milliseconds since recording started */
    t: number;
    op: TrafficOp;
    service: string;
    characteristic?: string;
    /** Hex-encoded bytes */
    data?: string;
}

export interface CharacteristicProperties {
    read: boolean;
    write: boolean;
    writeWithoutResponse: boolean;
    notify: boolean;
    indicate: boolean;
}

export interface GattCharacteristicSnapshot {
    uuid: string;
    properties: CharacteristicProperties;
}

export interface GattServiceSnapshot {
    uuid: string;
    characteristics: GattCharacteristicSnapshot[];
}

export interface DeviceInfo {
    name: string;
    id: string;
    mac?: string;
}

export interface CaptureSession {
    format: 'ble-capture';
    version: 1;
    capturedAt: string;
    device: DeviceInfo;
    services: GattServiceSnapshot[];
    traffic: TrafficEntry[];
}

export interface FixtureEvent {
    /** Milliseconds since recording started */
    t: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: Record<string, any>;
}

export interface FixtureSession {
    format: 'smartcube-fixture';
    version: 1;
    capturedAt: string;
    device: DeviceInfo;
    protocol: { id: string; name: string };
    scenario?: string;
    notes?: string;
    services: GattServiceSnapshot[];
    traffic: TrafficEntry[];
    events: FixtureEvent[];
}
