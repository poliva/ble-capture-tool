import type { CaptureSession, FixtureSession } from './types.ts';

function triggerDownload(json: string, filename: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function safeDeviceName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

function timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function exportCapture(session: CaptureSession): void {
    const json = JSON.stringify(session, null, 2);
    const name = safeDeviceName(session.device.name || 'unknown');
    triggerDownload(json, `ble-capture_${name}_${timestamp()}.json`);
}

export function exportFixture(session: FixtureSession): void {
    const json = JSON.stringify(session, null, 2);
    const name = safeDeviceName(session.device.name || 'unknown');
    const proto = safeDeviceName(session.protocol.id || 'unknown');
    triggerDownload(json, `fixture_${name}_${proto}_${timestamp()}.json`);
}
