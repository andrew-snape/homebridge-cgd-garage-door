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

## Camera Integration

Centurion Garage Doors also come with a door camera, exposed as an MJPEG stream on port `88`. This plugin handles it natively — live view and snapshots show up directly on the garage door accessory in the Home app, no separate camera plugin required.

Camera support is on by default and requires `ffmpeg` to transcode the stream for HomeKit. A static build is bundled automatically via [`ffmpeg-for-homebridge`](https://github.com/homebridge/ffmpeg-for-homebridge); if that's unavailable for your platform, install `ffmpeg` yourself and it'll be picked up from your system `PATH`. Two optional config fields:

- `enableCamera` (boolean, default `true`) — set to `false` to disable the camera entirely
- `videoProcessor` (string) — path to a specific `ffmpeg` binary, overriding the bundled/PATH lookup

## Development

1. `npm install`
2. Fill in the real `deviceHostname`/`deviceLocalKey` for your door in `test/hbConfig/config.json` locally — don't commit your real credentials
3. `npm run watch` — builds the plugin, links it globally, then runs Homebridge against `test/hbConfig` in debug mode, rebuilding and restarting on every change to `src/`

