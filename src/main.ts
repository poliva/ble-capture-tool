import './style.css';
import { BleRecorder } from './ble-recorder.ts';
import { TrafficLog, EventsLog } from './traffic-log.ts';
import { connectCaptureMode, buildCaptureSession } from './capture-mode.ts';
import { connectFixtureMode, buildFixtureSession } from './fixture-mode.ts';
import { exportCapture, exportFixture } from './export.ts';
import type { GattServiceSnapshot } from './types.ts';
import type { SmartCubeConnection } from 'smartcube-web-bluetooth';

// ─── State ───────────────────────────────────────────────────────────────────
type Mode = 'capture' | 'fixture';
let mode: Mode = 'capture';
const recorder = new BleRecorder();

let captureDevice: BluetoothDevice | null = null;
let captureServices: GattServiceSnapshot[] = [];
let fixtureConn: SmartCubeConnection | null = null;
let fixtureServices: GattServiceSnapshot[] = [];

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const tabCapture = document.getElementById('tab-capture') as HTMLButtonElement;
const tabFixture = document.getElementById('tab-fixture') as HTMLButtonElement;
const connectionStatus = document.getElementById('connection-status')!;
const captureOptions = document.getElementById('capture-options')!;
const fixtureOptions = document.getElementById('fixture-options')!;
const extraServicesInput = document.getElementById('extra-services') as HTMLInputElement;
const fixtureAnyMode = document.getElementById('fixture-any-mode') as HTMLInputElement;
const fixtureRecordFromConnect = document.getElementById('fixture-record-from-connect') as HTMLInputElement;
const fixtureScenario = document.getElementById('fixture-scenario') as HTMLInputElement;
const fixtureNotes = document.getElementById('fixture-notes') as HTMLTextAreaElement;
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement;
const statusMessage = document.getElementById('status-message')!;
const gattPanel = document.getElementById('gatt-panel')!;
const eventsPanel = document.getElementById('events-panel')!;
const fixtureProbesPanel = document.getElementById('fixture-probes-panel')!;
const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
const btnClearTraffic = document.getElementById('btn-clear-traffic') as HTMLButtonElement;
const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
const btnClearEvents = document.getElementById('btn-clear-events') as HTMLButtonElement;
const trafficLogEl = document.getElementById('traffic-log')!;
const eventsLogEl = document.getElementById('events-log')!;

const btnProbeBattery = document.getElementById('btn-probe-battery') as HTMLButtonElement;
const btnProbeHardware = document.getElementById('btn-probe-hardware') as HTMLButtonElement;
const btnProbeFacelets = document.getElementById('btn-probe-facelets') as HTMLButtonElement;

const trafficLog = new TrafficLog(trafficLogEl);
const eventsLog = new EventsLog(eventsLogEl);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setStatus(msg: string): void {
    statusMessage.textContent = msg;
    statusMessage.classList.toggle('hidden', msg.length === 0);
}

function setConnected(name: string): void {
    connectionStatus.textContent = `Connected: ${name}`;
    connectionStatus.className = 'status connected';
    btnConnect.classList.add('hidden');
    btnDisconnect.classList.remove('hidden');
    btnExport.disabled = false;
}

function setDisconnected(): void {
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'status disconnected';
    btnConnect.classList.remove('hidden');
    btnDisconnect.classList.add('hidden');
    captureDevice = null;
    fixtureConn = null;
    if (recorder.isRecording) {
        recorder.stopRecording();
        updateRecordBtn();
    }
    btnProbeBattery.disabled = true;
    btnProbeHardware.disabled = true;
    btnProbeFacelets.disabled = true;
}

function updateRecordBtn(): void {
    if (recorder.isRecording) {
        btnRecord.textContent = '◼ Stop';
        btnRecord.classList.add('recording');
    } else {
        btnRecord.textContent = '● Record';
        btnRecord.classList.remove('recording');
    }
}

function applyMode(): void {
    if (mode === 'capture') {
        tabCapture.classList.add('active');
        tabFixture.classList.remove('active');
        captureOptions.classList.remove('hidden');
        fixtureOptions.classList.add('hidden');
        gattPanel.classList.remove('hidden');
        eventsPanel.classList.add('hidden');
        fixtureProbesPanel.classList.add('hidden');
    } else {
        tabCapture.classList.remove('active');
        tabFixture.classList.add('active');
        captureOptions.classList.add('hidden');
        fixtureOptions.classList.remove('hidden');
        gattPanel.classList.add('hidden');
        eventsPanel.classList.remove('hidden');
        fixtureProbesPanel.classList.remove('hidden');
    }
}

function ensureRecordingForFixtureAction(actionLabel: string): void {
    if (!recorder.isRecording) {
        recorder.startRecording();
        recorder.addMarker(`auto-start:${actionLabel}`);
        updateRecordBtn();
    }
}

function updateProbeButtons(): void {
    const c = fixtureConn?.capabilities;
    btnProbeBattery.disabled = !fixtureConn || !c?.battery;
    btnProbeHardware.disabled = !fixtureConn || !c?.hardware;
    btnProbeFacelets.disabled = !fixtureConn || !c?.facelets;
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
tabCapture.addEventListener('click', () => {
    if (mode !== 'capture') {
        mode = 'capture';
        applyMode();
    }
});

tabFixture.addEventListener('click', () => {
    if (mode !== 'fixture') {
        mode = 'fixture';
        applyMode();
    }
});

btnConnect.addEventListener('click', async () => {
    if (!navigator.bluetooth) {
        setStatus('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
        return;
    }
    btnConnect.disabled = true;
    setStatus('');
    try {
        if (mode === 'capture') {
            const result = await connectCaptureMode(extraServicesInput.value, {
                recorder,
                onConnected: (device) => {
                    captureDevice = device;
                    captureServices = [];
                    setConnected(device.name ?? device.id);
                },
                onDisconnected: () => {
                    setDisconnected();
                    setStatus('Device disconnected.');
                },
                onStatus: setStatus,
            });
            if (result) {
                captureServices = result.services;
            }
        } else {
            await connectFixtureMode({
                recorder,
                anyMode: fixtureAnyMode.checked,
                recordFromConnect: fixtureRecordFromConnect.checked,
                onConnected: (conn) => {
                    fixtureConn = conn;
                    fixtureServices = [];
                    setConnected(conn.deviceName);
                    updateProbeButtons();
                    if (fixtureRecordFromConnect.checked) {
                        updateRecordBtn();
                        recorder.addMarker('connected');
                    }
                },
                onDisconnected: () => {
                    setDisconnected();
                    setStatus('Device disconnected.');
                },
                onStatus: setStatus,
            });
        }
    } finally {
        btnConnect.disabled = false;
    }
});

btnDisconnect.addEventListener('click', async () => {
    recorder.stopRecording();
    updateRecordBtn();
    try {
        if (captureDevice?.gatt?.connected) {
            captureDevice.gatt.disconnect();
        }
        if (fixtureConn) {
            await fixtureConn.disconnect();
        }
    } catch {
        // ignore
    }
    setDisconnected();
    setStatus('Disconnected.');
});

btnRecord.addEventListener('click', () => {
    if (recorder.isRecording) {
        recorder.stopRecording();
    } else {
        recorder.startRecording();
    }
    updateRecordBtn();
});

btnClearTraffic.addEventListener('click', () => {
    recorder.clear();
    trafficLog.clear();
    eventsLog.clear();
    btnExport.disabled = !captureDevice && !fixtureConn;
});

btnClearEvents.addEventListener('click', () => {
    eventsLog.clear();
});

btnExport.addEventListener('click', () => {
    if (mode === 'capture' && captureDevice) {
        const session = buildCaptureSession(captureDevice, captureServices, recorder);
        exportCapture(session);
    } else if (mode === 'fixture' && fixtureConn) {
        const traffic = recorder.getTraffic();
        const events = recorder.getCubeEvents();

        const notifyCount = traffic.filter(t => t.op === 'notify').length;
        const durationMs = traffic.length > 0 ? traffic[traffic.length - 1]!.t : 0;
        const approxNotifyRate = durationMs > 0 ? (notifyCount / (durationMs / 1000)) : 0;

        const warnings: string[] = [];
        if (notifyCount > 20 && events.length === 0) {
            warnings.push('Traffic contains many NOTIFY frames but decoded events are empty (wrong protocol/MAC/crypto?)');
        }
        if (durationMs > 60_000 && approxNotifyRate > 20) {
            warnings.push('This looks like a long high-volume capture (gyro spam?). Consider stopping sooner to keep fixtures small.');
        }

        if (warnings.length > 0) {
            const ok = window.confirm(`Export fixture anyway?\n\nWarnings:\n- ${warnings.join('\n- ')}`);
            if (!ok) return;
        }

        const session = buildFixtureSession(fixtureConn, fixtureServices, recorder, {
            scenario: fixtureScenario.value.trim() || undefined,
            notes: fixtureNotes.value.trim() || undefined,
        });
        exportFixture(session);
    } else {
        // Export whatever we have even if disconnected
        setStatus('Connect to a device first to export session data.');
    }
});

btnProbeBattery.addEventListener('click', async () => {
    if (!fixtureConn) return;
    ensureRecordingForFixtureAction('probe:battery');
    recorder.addMarker('probe:battery');
    try {
        await fixtureConn.sendCommand({ type: 'REQUEST_BATTERY' });
    } catch (e) {
        setStatus(`Battery probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }
});

btnProbeHardware.addEventListener('click', async () => {
    if (!fixtureConn) return;
    ensureRecordingForFixtureAction('probe:hardware');
    recorder.addMarker('probe:hardware');
    try {
        await fixtureConn.sendCommand({ type: 'REQUEST_HARDWARE' });
    } catch (e) {
        setStatus(`Hardware probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }
});

btnProbeFacelets.addEventListener('click', async () => {
    if (!fixtureConn) return;
    ensureRecordingForFixtureAction('probe:facelets');
    recorder.addMarker('probe:facelets');
    try {
        await fixtureConn.sendCommand({ type: 'REQUEST_FACELETS' });
    } catch (e) {
        setStatus(`Facelets probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }
});

// ─── Recorder listeners ───────────────────────────────────────────────────────
recorder.onTraffic((entry) => {
    trafficLog.addTrafficEntry(entry);
});

recorder.onEvent((entry) => {
    eventsLog.addEntry(entry);
});

// ─── Init ─────────────────────────────────────────────────────────────────────
applyMode();

if (!navigator.bluetooth) {
    setStatus('Web Bluetooth is not available. Open this page in Chrome or Edge on a supported platform.');
    btnConnect.disabled = true;
}
