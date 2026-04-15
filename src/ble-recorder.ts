import type { TrafficEntry, TrafficOp, FixtureEvent } from './types.ts';

export type RecorderListener = (entry: TrafficEntry) => void;
export type EventListener = (entry: FixtureEvent) => void;

export function bufToHex(buf: ArrayBuffer | DataView): string {
    const bytes = buf instanceof DataView
        ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        : new Uint8Array(buf);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

export class BleRecorder {
    private traffic: TrafficEntry[] = [];
    private cubeEvents: FixtureEvent[] = [];
    private startTime: number | null = null;
    private recording = false;
    private trafficListeners: RecorderListener[] = [];
    private eventListeners: EventListener[] = [];

    get isRecording(): boolean {
        return this.recording;
    }

    startRecording(): void {
        this.startTime = performance.now();
        this.recording = true;
    }

    stopRecording(): void {
        this.recording = false;
    }

    private elapsed(): number {
        if (this.startTime === null) return 0;
        return Math.round(performance.now() - this.startTime);
    }

    addTrafficEntry(op: TrafficOp, service: string, characteristic?: string, data?: ArrayBuffer | DataView | string): void {
        if (!this.recording) return;
        const entry: TrafficEntry = {
            t: this.elapsed(),
            op,
            service,
            ...(characteristic !== undefined && { characteristic }),
            ...(data !== undefined && {
                data: typeof data === 'string' ? data : bufToHex(data),
            }),
        };
        this.traffic.push(entry);
        this.trafficListeners.forEach(l => l(entry));
    }

    addMarker(label: string): void {
        this.addTrafficEntry('marker', 'marker', undefined, label);
    }

    addCubeEvent(event: Record<string, unknown>): void {
        if (!this.recording) return;
        const entry: FixtureEvent = { t: this.elapsed(), event };
        this.cubeEvents.push(entry);
        this.eventListeners.forEach(l => l(entry));
    }

    getTraffic(): TrafficEntry[] {
        return this.traffic;
    }

    getCubeEvents(): FixtureEvent[] {
        return this.cubeEvents;
    }

    clear(): void {
        this.traffic = [];
        this.cubeEvents = [];
        this.startTime = null;
    }

    onTraffic(listener: RecorderListener): () => void {
        this.trafficListeners.push(listener);
        return () => { this.trafficListeners = this.trafficListeners.filter(l => l !== listener); };
    }

    onEvent(listener: EventListener): () => void {
        this.eventListeners.push(listener);
        return () => { this.eventListeners = this.eventListeners.filter(l => l !== listener); };
    }
}
