# Homebridge Centurion Garage Doors

[![Prepublish](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/prepublish.yml/badge.svg)](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/prepublish.yml)
[![Publish](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/publish.yml/badge.svg)](https://github.com/andrew-snape/homebridge-cgd-garage-door/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/%40andrew-snape%2Fhomebridge-cgd-garage-door/latest?label=latest)](https://www.npmjs.com/package/@andrew-snape/homebridge-cgd-garage-door)
[![MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![semantic-release](https://img.shields.io/badge/semantic--release-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)


This is a Homebridge plugin that allows you to control Centurion Garage Doors.

> This is a community-maintained continuation of [KieraDOG/homebridge-cgd-garage-door](https://github.com/KieraDOG/homebridge-cgd-garage-door), published under a new scoped package name (`@andrew-snape/homebridge-cgd-garage-door`) since this fork doesn't have publish access to the original `homebridge-cgd-garage-door` npm package.

## Features

- Open and close your Centurion Garage Door
- Monitor the status of your garage door
- Control the Lock Mode
- Turn the lights on and off
- Integrates seamlessly with Homebridge

## Installation

Search for "CGD Garage Door" in the Homebridge UI's plugin search, or install manually:

```sh
npm install -g @andrew-snape/homebridge-cgd-garage-door
```

## Configuration

Add the following to your Homebridge config.json:

```json
{
    "name": "CGD Garage Door",
    "platform": "CGDGarageDoor",
    "deviceHostname": "<DEVICE_HOSTNAME|IP_ADDRESS>",
    "deviceLocalKey": "<DEVICE_LOCAL_KEY>"
}
```

You can find the deviceHostname and deviceLocalKey in the Local API section of the [MY CGD SMARTPHONE APP](https://www.cgdoors.com.au/garage-door-smartphone-app/).

## Camera Integration

Centurion Garage Doors also come with a door camera, which operates on port `88`. Camera functionality is not included in this plugin. However, you can use the [Homebridge Camera FFmpeg](https://github.com/homebridge-plugins/homebridge-camera-ffmpeg) plugin to integrate the camera into Homebridge. 

To configure the camera, set the Homebridge Camera FFmpeg `Video Source` parameter to:

```text
-f mjpeg -i http://[DEVICE_HOSTNAME|IP_ADDRESS]:88:0 -map 0:v
```

## Development

1. `npm install`
2. Fill in the real `deviceHostname`/`deviceLocalKey` for your door in `test/hbConfig/config.json` locally — don't commit your real credentials
3. `npm run watch` — builds the plugin, links it globally, then runs Homebridge against `test/hbConfig` in debug mode, rebuilding and restarting on every change to `src/`

