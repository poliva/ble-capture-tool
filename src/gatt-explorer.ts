import type { BleRecorder } from './ble-recorder.ts';
import type { GattServiceSnapshot, GattCharacteristicSnapshot } from './types.ts';
import { bufToHex } from './ble-recorder.ts';

export interface GattExplorerOptions {
    recorder: BleRecorder;
    onSnapshot: (services: GattServiceSnapshot[]) => void;
}

const UUID_DEVICE_INFO_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
const DEVICE_INFO_CHARS: Array<{ label: string; uuid: string }> = [
    { label: 'Manufacturer', uuid: '00002a29-0000-1000-8000-00805f9b34fb' },
    { label: 'Model', uuid: '00002a24-0000-1000-8000-00805f9b34fb' },
    { label: 'Serial', uuid: '00002a25-0000-1000-8000-00805f9b34fb' },
    { label: 'HW', uuid: '00002a27-0000-1000-8000-00805f9b34fb' },
    { label: 'FW', uuid: '00002a26-0000-1000-8000-00805f9b34fb' },
    { label: 'SW', uuid: '00002a28-0000-1000-8000-00805f9b34fb' },
];

function propBadges(props: BluetoothCharacteristicProperties): string {
    const badges: string[] = [];
    if (props.read) badges.push('<span class="badge badge-r">R</span>');
    if (props.write || props.writeWithoutResponse) badges.push('<span class="badge badge-w">W</span>');
    if (props.notify) badges.push('<span class="badge badge-n">N</span>');
    if (props.indicate) badges.push('<span class="badge badge-i">I</span>');
    return badges.join(' ');
}

function shortUuid(uuid: string): string {
    // Show short form for 16-bit Bluetooth UUIDs
    const m = uuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);
    return m ? `0x${m[1].toUpperCase()}` : uuid;
}

async function readChar(char: BluetoothRemoteGATTCharacteristic): Promise<string> {
    try {
        const val = await char.readValue();
        return bufToHex(val);
    } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
}

function ensureRecording(recorder: BleRecorder, label: string): void {
    if (!recorder.isRecording) {
        recorder.startRecording();
        recorder.addMarker(`auto-start:${label}`);
    }
}

export async function renderGattExplorer(
    container: HTMLElement,
    device: BluetoothDevice,
    opts: GattExplorerOptions,
): Promise<GattServiceSnapshot[]> {
    container.innerHTML = '<span class="muted">Discovering services…</span>';

    const gatt = device.gatt!;
    if (!gatt.connected) {
        await gatt.connect();
    }

    let services: BluetoothRemoteGATTService[];
    try {
        services = await gatt.getPrimaryServices();
    } catch {
        // Some browsers require requesting specific services; fall back
        services = [];
    }

    if (services.length === 0) {
        container.innerHTML = '<span class="muted">No services accessible. Try adding service UUIDs above.</span>';
        return [];
    }

    const snapshots: GattServiceSnapshot[] = [];
    container.innerHTML = '';

    for (const service of services) {
        const serviceEl = document.createElement('div');
        serviceEl.className = 'service-entry';

        const serviceHeader = document.createElement('div');
        serviceHeader.className = 'service-header';
        serviceHeader.innerHTML = `<span class="uuid">${service.uuid}</span>`;
        serviceEl.appendChild(serviceHeader);

        const charsEl = document.createElement('div');
        charsEl.className = 'char-list';

        let chars: BluetoothRemoteGATTCharacteristic[] = [];
        try {
            chars = await service.getCharacteristics();
        } catch {
            charsEl.innerHTML = '<span class="muted">Could not read characteristics.</span>';
        }

        if (service.uuid.toLowerCase() === UUID_DEVICE_INFO_SERVICE) {
            const quickRow = document.createElement('div');
            quickRow.className = 'char-actions';
            const title = document.createElement('span');
            title.className = 'uuid';
            title.textContent = 'Device Info quick reads:';
            quickRow.appendChild(title);

            for (const di of DEVICE_INFO_CHARS) {
                const btn = document.createElement('button');
                btn.textContent = di.label;
                btn.className = 'secondary small';
                btn.addEventListener('click', async () => {
                    ensureRecording(opts.recorder, `device-info:${di.label.toLowerCase()}`);
                    opts.recorder.addMarker(`device-info:${di.label.toLowerCase()}`);
                    btn.disabled = true;
                    try {
                        const ch = await service.getCharacteristic(di.uuid);
                        // best-effort: value is shown as hex in the characteristic row too; this is just a quick action
                        await readChar(ch);
                    } catch (e) {
                        alert(`Device info read error (${di.label}): ${e instanceof Error ? e.message : String(e)}`);
                    } finally {
                        btn.disabled = false;
                    }
                });
                quickRow.appendChild(btn);
            }

            serviceHeader.appendChild(quickRow);
        }

        const charSnapshots: GattCharacteristicSnapshot[] = [];

        for (const char of chars) {
            charSnapshots.push({
                uuid: char.uuid,
                properties: {
                    read: char.properties.read,
                    write: char.properties.write,
                    writeWithoutResponse: char.properties.writeWithoutResponse,
                    notify: char.properties.notify,
                    indicate: char.properties.indicate,
                },
            });

            const charEl = document.createElement('div');
            charEl.className = 'char-entry';

            const charInfo = document.createElement('div');
            charInfo.className = 'char-info';
            charInfo.innerHTML = `
                <span class="uuid char-uuid">${shortUuid(char.uuid)}</span>
                <span class="badges">${propBadges(char.properties)}</span>
            `;
            charEl.appendChild(charInfo);

            const charActions = document.createElement('div');
            charActions.className = 'char-actions';

            if (char.properties.read) {
                const btn = document.createElement('button');
                btn.textContent = 'Read';
                btn.className = 'secondary small';
                const valueEl = document.createElement('span');
                valueEl.className = 'read-value muted';
                btn.addEventListener('click', async () => {
                    ensureRecording(opts.recorder, `gatt:read:${shortUuid(char.uuid)}`);
                    opts.recorder.addMarker(`gatt:read:${shortUuid(char.uuid)}`);
                    btn.disabled = true;
                    valueEl.textContent = '…';
                    const hex = await readChar(char);
                    valueEl.textContent = hex;
                    btn.disabled = false;
                });
                charActions.appendChild(btn);
                charActions.appendChild(valueEl);
            }

            if (char.properties.notify || char.properties.indicate) {
                const btn = document.createElement('button');
                btn.textContent = 'Subscribe';
                btn.className = 'secondary small';
                let subscribed = false;
                const notifHandler = (): void => { /* handled by interceptor or recorder */ };
                btn.addEventListener('click', async () => {
                    if (!subscribed) {
                        try {
                            await char.startNotifications();
                            char.addEventListener('characteristicvaluechanged', notifHandler);
                            btn.textContent = 'Unsubscribe';
                            btn.classList.add('active');
                            subscribed = true;
                        } catch (e) {
                            alert(`Subscribe error: ${e instanceof Error ? e.message : String(e)}`);
                        }
                    } else {
                        try {
                            await char.stopNotifications();
                            char.removeEventListener('characteristicvaluechanged', notifHandler);
                            btn.textContent = 'Subscribe';
                            btn.classList.remove('active');
                            subscribed = false;
                        } catch {
                            // ignore
                        }
                    }
                });
                charActions.appendChild(btn);
            }

            if (char.properties.write || char.properties.writeWithoutResponse) {
                const writeRow = document.createElement('div');
                writeRow.className = 'write-row';
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = 'Hex bytes (e.g. A1 B2 C3)';
                input.className = 'write-input';
                const btn = document.createElement('button');
                btn.textContent = 'Write';
                btn.className = 'secondary small';
                btn.addEventListener('click', async () => {
                    const hex = input.value.replace(/\s+/g, '');
                    if (hex.length === 0 || hex.length % 2 !== 0) {
                        alert('Enter an even number of hex digits.');
                        return;
                    }
                    const bytes = new Uint8Array(hex.length / 2);
                    for (let i = 0; i < bytes.length; i++) {
                        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
                    }
                    btn.disabled = true;
                    try {
                        if (char.properties.write) {
                            await char.writeValueWithResponse(bytes);
                        } else {
                            await char.writeValueWithoutResponse(bytes);
                        }
                        input.value = '';
                    } catch (e) {
                        alert(`Write error: ${e instanceof Error ? e.message : String(e)}`);
                    } finally {
                        btn.disabled = false;
                    }
                });
                writeRow.appendChild(input);
                writeRow.appendChild(btn);
                charActions.appendChild(writeRow);
            }

            charEl.appendChild(charActions);
            charsEl.appendChild(charEl);
        }

        serviceEl.appendChild(charsEl);
        container.appendChild(serviceEl);
        snapshots.push({ uuid: service.uuid, characteristics: charSnapshots });
    }

    opts.onSnapshot(snapshots);
    return snapshots;
}
