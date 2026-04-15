import type { TrafficEntry, FixtureEvent } from './types.ts';

const MAX_DISPLAY = 500;

function padTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const millis = ms % 1000;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function shortUuid(uuid: string): string {
    const m = uuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);
    if (m) return m[1].toUpperCase();
    // Return last 4 chars of first segment
    return uuid.slice(0, 8).toUpperCase();
}

const OP_COLORS: Record<string, string> = {
    read: 'op-read',
    write: 'op-write',
    notify: 'op-notify',
    'discover-service': 'op-discover',
    'discover-char': 'op-discover',
    marker: 'op-other',
};

export class TrafficLog {
    private container: HTMLElement;
    private entries: HTMLElement[] = [];
    private autoScroll = true;

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = this.container;
            this.autoScroll = scrollHeight - scrollTop - clientHeight < 40;
        });
    }

    clear(): void {
        this.container.innerHTML = '';
        this.entries = [];
    }

    addTrafficEntry(entry: TrafficEntry): void {
        if (this.entries.length === 0) {
            this.container.innerHTML = '';
        }
        if (this.entries.length >= MAX_DISPLAY) {
            const oldest = this.entries.shift()!;
            oldest.remove();
        }

        const row = document.createElement('div');
        row.className = 'log-row';

        const opClass = OP_COLORS[entry.op] ?? 'op-other';
        const charShort = entry.characteristic ? shortUuid(entry.characteristic) : '';
        const dataTrunc = entry.data
            ? (entry.data.length > 64 ? entry.data.slice(0, 64) + '…' : entry.data)
            : '';

        row.innerHTML = `
            <span class="log-time">${padTime(entry.t)}</span>
            <span class="log-op ${opClass}">${entry.op.toUpperCase()}</span>
            <span class="log-char">${charShort}</span>
            <span class="log-data">${dataTrunc}</span>
        `;

        this.container.appendChild(row);
        this.entries.push(row);

        if (this.autoScroll) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }

    addEventEntry(entry: FixtureEvent): void {
        // Rendered in events-log, not here
        void entry;
    }
}

export class EventsLog {
    private container: HTMLElement;
    private entries: HTMLElement[] = [];

    constructor(container: HTMLElement) {
        this.container = container;
    }

    clear(): void {
        this.container.innerHTML = '';
        this.entries = [];
    }

    addEntry(entry: FixtureEvent): void {
        if (this.entries.length === 0) {
            this.container.innerHTML = '';
        }
        if (this.entries.length >= MAX_DISPLAY) {
            const oldest = this.entries.shift()!;
            oldest.remove();
        }

        const ev = entry.event;
        const type = String(ev['type'] ?? 'UNKNOWN');

        let detail = '';
        if (type === 'MOVE') {
            detail = String(ev['move'] ?? '');
        } else if (type === 'FACELETS') {
            const f = String(ev['facelets'] ?? '');
            detail = f.length > 30 ? f.slice(0, 30) + '…' : f;
        } else if (type === 'BATTERY') {
            detail = `${ev['batteryLevel']}%`;
        } else if (type === 'GYRO') {
            const q = ev['quaternion'] as Record<string, number> | undefined;
            detail = q ? `x:${q.x.toFixed(2)} y:${q.y.toFixed(2)} z:${q.z.toFixed(2)} w:${q.w.toFixed(2)}` : '';
        } else if (type === 'HARDWARE') {
            detail = [ev['hardwareName'], ev['softwareVersion']].filter(Boolean).join(' / ');
        }

        const row = document.createElement('div');
        row.className = 'log-row';
        row.innerHTML = `
            <span class="log-time">${padTime(entry.t)}</span>
            <span class="log-op op-event">${type}</span>
            <span class="log-data">${detail}</span>
        `;
        this.container.appendChild(row);
        this.entries.push(row);
        this.container.scrollTop = this.container.scrollHeight;
    }
}
