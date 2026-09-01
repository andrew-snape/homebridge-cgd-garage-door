import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
import { H264Level, H264Profile, SRTPCryptoSuites } from 'homebridge';
import pathToFfmpeg from 'ffmpeg-for-homebridge';
import { CGDCameraStreamingDelegate } from './CGDCameraStreamingDelegate.js';
import { CGDGarageDoor } from './CGDGarageDoor.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

interface CameraOptions {
  enableCamera: boolean;
  videoProcessor?: string;
}

interface SwitchOptions {
  enableVacationSwitch: boolean;
  vacationSwitchName: string;
  enableStopSwitch: boolean;
  stopSwitchName: string;
}

type AccessoryOptions = CameraOptions & SwitchOptions;

export class CGDCameraPlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;
  private readonly api: API;

  private readonly accessories: PlatformAccessory[] = [];

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;

    this.log('Platform finished initializing!');

    const {
      deviceHostname, deviceLocalKey,
      enableCamera = true, videoProcessor,
      enableVacationSwitch = true, vacationSwitchName = 'Vacation Mode',
      enableStopSwitch = true, stopSwitchName = 'Stop',
      transitionTimeoutSeconds,
    } = config;
    if (!deviceHostname || !deviceLocalKey) {
      this.log.warn('Missing required configuration parameters');
      return;
    }

    const cgdGarageDoor = new CGDGarageDoor(this.log, {
      deviceHostname,
      deviceLocalKey,
      transitionTimeoutSeconds,
    });

    api.on('didFinishLaunching', () => {
      this.log('Did finish launching');
      this.addAccessory(deviceHostname, cgdGarageDoor, {
        enableCamera, videoProcessor,
        enableVacationSwitch, vacationSwitchName,
        enableStopSwitch, stopSwitchName,
      });
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log('Configuring accessory %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  async addAccessory(name: string, cgdGarageDoor: CGDGarageDoor, options: AccessoryOptions) {
    await cgdGarageDoor.waitForStatus();

    this.log('Adding new accessory with name %s', name);

    const uuid = this.api.hap.uuid.generate(name);

    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
    if (existingAccessory) {
      this.log('Accessory with name %s already exists', name);
      this.configureGarageDoorAccessory(existingAccessory, cgdGarageDoor, name, options);
      return;
    }

    const accessory = new this.api.platformAccessory(name, uuid);
    this.configureGarageDoorAccessory(accessory, cgdGarageDoor, name, options);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.log('Accessory with name %s added', name);
  }

  configureGarageDoorAccessory(
    accessory: PlatformAccessory,
    cgdGarageDoor: CGDGarageDoor,
    deviceHostname: string,
    options: AccessoryOptions,
  ) {
    accessory.on('identify', () => {
      this.log('%s identified!', accessory.displayName);
    });

    const information = accessory.getService(this.api.hap.Service.AccessoryInformation) || accessory.addService(this.api.hap.Service.AccessoryInformation);
    information
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'CGD')
      .setCharacteristic(this.api.hap.Characteristic.Model, 'PRO Sectional Door Opener')
      // The device's local API exposes no real serial number; its hostname is the
      // most stable per-device identifier available, so use that instead of HAP's
      // random fallback.
      .setCharacteristic(this.api.hap.Characteristic.SerialNumber, accessory.displayName);

    const garageDoorOpener = accessory.getService(this.api.hap.Service.GarageDoorOpener) || accessory.addService(new this.api.hap.Service.GarageDoorOpener(accessory.displayName));

    garageDoorOpener.getCharacteristic(this.api.hap.Characteristic.CurrentDoorState)
      .onGet(() => {
        if (cgdGarageDoor.hasDeviceError()) {
          throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        return cgdGarageDoor.getCurrentDoorState();
      });

    garageDoorOpener.getCharacteristic(this.api.hap.Characteristic.TargetDoorState)
      .onGet(() => cgdGarageDoor.getTargetDoorState())
      .onSet((value) => cgdGarageDoor.setTargetDoorState(+value));

    const lightbulb = accessory.getService(this.api.hap.Service.Lightbulb) || accessory.addService(new this.api.hap.Service.Lightbulb(accessory.displayName));

    lightbulb.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => cgdGarageDoor.getLightbulb())
      .onSet((value) => cgdGarageDoor.setLightbulb(value));

    // Prior versions added a single, subtype-less Switch service for vacation mode.
    // Now that there are two switches, both need distinct subtypes to coexist on
    // one accessory — remove that legacy service so it doesn't linger as an
    // orphaned, unmanaged tile once the subtyped ones below replace it.
    const legacySwitch = accessory.services.find(
      (service) => service.UUID === this.api.hap.Service.Switch.UUID && !service.subtype,
    );
    if (legacySwitch) {
      accessory.removeService(legacySwitch);
    }

    const existingVacationSwitch = accessory.getServiceById(this.api.hap.Service.Switch, 'vacation');
    const vacationSwitch = options.enableVacationSwitch
      ? existingVacationSwitch
        || accessory.addService(new this.api.hap.Service.Switch(options.vacationSwitchName, 'vacation'))
      : undefined;

    if (vacationSwitch) {
      vacationSwitch.setCharacteristic(this.api.hap.Characteristic.Name, options.vacationSwitchName);
      vacationSwitch.getCharacteristic(this.api.hap.Characteristic.On)
        .onGet(() => cgdGarageDoor.getVacation())
        .onSet((value) => cgdGarageDoor.setVacation(value));
    } else if (existingVacationSwitch) {
      accessory.removeService(existingVacationSwitch);
    }

    const existingStopSwitch = accessory.getServiceById(this.api.hap.Service.Switch, 'stop');
    const stopSwitch = options.enableStopSwitch
      ? existingStopSwitch
        || accessory.addService(new this.api.hap.Service.Switch(options.stopSwitchName, 'stop'))
      : undefined;

    if (stopSwitch) {
      stopSwitch.setCharacteristic(this.api.hap.Characteristic.Name, options.stopSwitchName);

      // Modeled as a momentary button: HomeKit's GarageDoorOpener has no native
      // "stop" action (TargetDoorState only supports open/closed), and the device
      // has no persistent "stopped" toggle state to read back — it's a one-shot
      // command. Flipping back off shortly after makes it behave like a button
      // rather than a switch that gets stuck "on".
      stopSwitch.getCharacteristic(this.api.hap.Characteristic.On)
        .onGet(() => false)
        .onSet(async (value) => {
          if (!value) {
            return;
          }

          await cgdGarageDoor.triggerStop();

          setTimeout(() => {
            stopSwitch.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
          }, 1000);
        });
    } else if (existingStopSwitch) {
      accessory.removeService(existingStopSwitch);
    }

    cgdGarageDoor.onStatusUpdate(() => {
      garageDoorOpener
        .getCharacteristic(this.api.hap.Characteristic.CurrentDoorState).updateValue(
          cgdGarageDoor.hasDeviceError()
            ? new Error(`CGD device reported error code ${cgdGarageDoor.getDeviceErrorCode()}`)
            : cgdGarageDoor.getCurrentDoorState(),
        );

      garageDoorOpener
        .getCharacteristic(this.api.hap.Characteristic.TargetDoorState).updateValue(cgdGarageDoor.getTargetDoorState());

      lightbulb
        .getCharacteristic(this.api.hap.Characteristic.On).updateValue(cgdGarageDoor.getLightbulb());

      vacationSwitch
        ?.getCharacteristic(this.api.hap.Characteristic.On).updateValue(cgdGarageDoor.getVacation());
    });

    if (options.enableCamera) {
      this.configureCamera(accessory, deviceHostname, cgdGarageDoor, options.videoProcessor);
    }

    this.log('Garage Door Accessory %s configured!', accessory.displayName);
  }

  configureCamera(accessory: PlatformAccessory, deviceHostname: string, cgdGarageDoor: CGDGarageDoor, videoProcessor?: string) {
    // Confirmed via `curl -v http://<device>:88/`: an unauthenticated MJPEG
    // multipart stream (Content-Type: multipart/x-mixed-replace), no API key needed.
    const videoSourceUrl = `http://${deviceHostname}:88/`;
    const ffmpegPath = videoProcessor || pathToFfmpeg || 'ffmpeg';

    const cameraDelegate = new CGDCameraStreamingDelegate(
      this.log, this.api, videoSourceUrl, ffmpegPath, cgdGarageDoor.withDeviceLock,
    );

    const cameraController = new this.api.hap.CameraController({
      cameraStreamCount: 2,
      delegate: cameraDelegate,
      streamingOptions: {
        supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          codec: {
            profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
            levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
          },
          resolutions: [
            [1280, 720, 30],
            [1024, 768, 30],
            [640, 480, 30],
            [320, 240, 30],
            [320, 240, 15],
          ],
        },
        // No audio: the device has no microphone.
      },
    });

    cameraDelegate.controller = cameraController;
    accessory.configureController(cameraController);

    this.log(`Camera configured for %s (source: ${videoSourceUrl}, ffmpeg: ${ffmpegPath})`, accessory.displayName);
  }
}
