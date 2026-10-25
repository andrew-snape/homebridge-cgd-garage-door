# Homebridge Centurion Garage Doors

[![Prepublish](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/prepublish.yml/badge.svg)](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/prepublish.yml)
[![Publish](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/publish.yml/badge.svg)](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/%40snapeos%2Fhomebridge-centurion-garage-door/latest?label=latest)](https://www.npmjs.com/package/@snapeos/homebridge-centurion-garage-door)
[![MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![semantic-release](https://img.shields.io/badge/semantic--release-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)


This is a Homebridge plugin that allows you to control Centurion Garage Doors.

> This is a community-maintained continuation of [KieraDOG/homebridge-cgd-garage-door](https://github.com/KieraDOG/homebridge-cgd-garage-door), published under a new scoped package name (`@snapeos/homebridge-centurion-garage-door`) since this fork doesn't have publish access to the original `homebridge-cgd-garage-door` npm package.

## Features

- Open, close, and stop your Centurion Garage Door
- Monitor the status of your garage door
- Control the Lock Mode
- Turn the lights on and off
- Live camera view and snapshots straight from the door's built-in camera
- Integrates seamlessly with Homebridge

## Installation

Search for "Centurion Garage Door" in the Homebridge UI's plugin search, or install manually:

```sh
npm install -g @snapeos/homebridge-centurion-garage-door
```

## Configuration

Add the following to your Homebridge config.json:

```json
{
    "name": "Centurion Garage Door",
    "platform": "CGDGarageDoor",
    "deviceHostname": "<DEVICE_HOSTNAME|IP_ADDRESS>",
    "deviceLocalKey": "<DEVICE_LOCAL_KEY>"
}
```

You can find the deviceHostname and deviceLocalKey in the Local API section of the [MY CGD SMARTPHONE APP](https://www.cgdoors.com.au/garage-door-smartphone-app/).

### Options

Only the first two are required.

| Option | Default | Description |
|---|---|---|
| `deviceHostname` | | Hostname or IP address of the door controller (required) |
| `deviceLocalKey` | | Local API key from the CGD app (required) |
| `enableCamera` | `true` | Expose the door camera in HomeKit |
| `videoProcessor` | | Path to an `ffmpeg` binary |
| `enableVacationSwitch` / `vacationSwitchName` | `true` / `"Vacation Mode"` | Show or rename the Vacation Mode switch |
| `enableStopSwitch` / `stopSwitchName` | `true` / `"Stop"` | Show or rename the Stop switch |
| `transitionTimeoutSeconds` | `60` | How long the door may report Opening/Closing before the plugin treats it as stuck and shows Stopped (`0` disables). Set it comfortably above your door's travel time. |
| `pollIntervalSeconds` | `10` | Status check interval while the door is idle (minimum 1) |
| `pollIntervalMovingSeconds` | `1.5` | Status check interval while the door is opening or closing (minimum 0.5) |
| `unreachableAfterFailures` | `3` | Failed status checks in a row before HomeKit shows "No Response" (minimum 1) |
| `healthSummaryMinutes` | `10` | How often to log the health summary (`0` disables) |

Invalid or out-of-range numeric values are ignored with a single warning in the log, and the default is used instead.

## Logging & diagnostics

The plugin logs a few things that help when working out why a door did something, or why it stopped responding:

- **Door events.** Whenever the door's reported state changes you get one line with the device's own wording and timestamp, e.g. `Door: Closed by transmitter No.3 (2026-10-24 22:07:33)`. This tells you whether a remote, the wall button or WiFi (HomeKit or the app) moved the door. It is logged on change only, not on every poll.
- **Health summary.** Every `healthSummaryMinutes` (default 10) one line summarises that period: polls ok/failed and success rate, average and maximum response time, minimum and latest Wi-Fi signal (dBm), the door's cycle count and the last error. Nothing is logged for a period with no polls.
- **Unknown door text.** If the door reports a state the plugin doesn't recognise, a warning shows the raw text, once per distinct text. Please open an issue with it so it can be supported.
- **Error codes.** Each distinct non-zero device error code is logged once as a warning, with the door text and timestamp at that moment. While a code is active HomeKit shows the door as "No Response". What each code means isn't known yet, so these logs are the data for mapping them.
- **Intruder alert text.** Door text containing "Intruder" is logged as a warning each time it appears. It has been seen on an ordinary WiFi-initiated open, so it is not treated as an alarm.
- **No Response.** After `unreachableAfterFailures` failed status checks in a row (default 3) the door shows as "No Response" in HomeKit rather than a stale state, and returns to normal on the next successful check. Failed checks back off (up to 60 s) so an unresponsive door isn't hammered. Weak Wi-Fi (below -75 dBm) is also warned about, once, until it recovers above -70 dBm.

## Vacation Mode & Stop Switches

Alongside the garage door and light, two `Switch` tiles are exposed:

- **Vacation Mode** — locks out the door's wireless remote transmitters (handheld clickers), so it won't respond to them until you turn it back off. Useful when you're away and want to rule out a lost or cloned remote as a way in — the door can still be opened from HomeKit/Siri or the CGD app while it's on.
- **Stop** — a momentary button that stops the door mid-travel (flips back off automatically after triggering).

Both are on by default. Optional config fields let you hide or rename either one — handy if you have another accessory with a clashing name in the same home:

- `enableVacationSwitch` (boolean, default `true`)
- `vacationSwitchName` (string, default `"Vacation Mode"`)
- `enableStopSwitch` (boolean, default `true`)
- `stopSwitchName` (string, default `"Stop"`)

## Camera Integration

Centurion Garage Doors also come with a door camera, exposed as an MJPEG stream on port `88`. This plugin handles it natively — live view and snapshots show up directly on the garage door accessory in the Home app, no separate camera plugin required.

Camera support is on by default and requires `ffmpeg` to transcode the stream for HomeKit. A static build is bundled automatically via [`ffmpeg-for-homebridge`](https://github.com/homebridge/ffmpeg-for-homebridge); if that's unavailable for your platform, install `ffmpeg` yourself and it'll be picked up from your system `PATH`. Two optional config fields:

- `enableCamera` (boolean, default `true`) — set to `false` to disable the camera entirely
- `videoProcessor` (string) — path to a specific `ffmpeg` binary, overriding the bundled/PATH lookup

## Development

1. `npm install`
2. Fill in the real `deviceHostname`/`deviceLocalKey` for your door in `test/hbConfig/config.json` locally — don't commit your real credentials
3. `npm run watch` — builds the plugin, links it globally, then runs Homebridge against `test/hbConfig` in debug mode, rebuilding and restarting on every change to `src/`

