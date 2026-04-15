# BLE Capture Tool

This tool was created to capture BLE traffic data for writing unit tests in [smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth), a library that provides JavaScript/TypeScript bindings for controlling smart cubes over Web Bluetooth.

This tool has two modes:

- **Capture**: raw GATT exploration and traffic capture.
- **Fixture**: connects via `smartcube-web-bluetooth`, records BLE traffic plus decoded cube events, and exports a `smartcube-fixture` JSON.

## Recommended workflow for high-quality fixtures

- **Use Fixture mode**.
- Leave **Record from connect** enabled (default).
  - This captures the full connect + init handshake (service discovery, early writes, early notifies), which makes replays more faithful and reduces “missing prelude” gaps.
- Fill in **Scenario** / **Notes** (optional) so exports are self-describing.
- Keep sessions **short and intentional**:
  - Record just long enough to include the init traffic + a small set of actions.
  - Long sessions can produce huge JSON (especially if gyro notifications are high-volume).

## Probe buttons (Fixture mode)

When connected, use **Fixture Probes** to intentionally enrich a capture at a known moment:

- **Battery** → `sendCommand({ type: 'REQUEST_BATTERY' })`
- **Hardware** → `sendCommand({ type: 'REQUEST_HARDWARE' })`
- **Facelets** → `sendCommand({ type: 'REQUEST_FACELETS' })`

Each probe adds a **marker** entry to the traffic log (e.g. `probe:battery`) so later you can find the exact segment in the trace.

## Device Information / raw GATT reads (Capture mode)

In the GATT explorer:

- If **Device Information** service (0x180A) is present, the tool shows quick-read buttons for common characteristics (manufacturer/model/HW/FW/etc.). These actions also add a **marker**.
- Any per-characteristic **Read** action adds a marker like `gatt:read:0xXXXX`.

## Export warnings

On fixture export, the tool warns about common capture problems:

- **Many NOTIFY frames but zero decoded events** (often wrong protocol/MAC/crypto).
- **Long high-volume sessions** (often gyro spam) that will produce large fixtures.

