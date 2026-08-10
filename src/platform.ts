import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
import { CGDGarageDoor } from './CGDGarageDoor.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export class CGDCameraPlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;
  private readonly api: API;

  private readonly accessories: PlatformAccessory[] = [];

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;

    this.log('Platform finished initializing!');

    const { deviceHostname, deviceLocalKey } = config;
    if (!deviceHostname || !deviceLocalKey) {
      this.log.warn('Missing required configuration parameters');
      return;
    }

    const cgdGarageDoor = new CGDGarageDoor(this.log, {
      deviceHostname,
      deviceLocalKey,
    });

    api.on('didFinishLaunching', () => {
      this.log('Did finish launching');
      this.addAccessory(deviceHostname, cgdGarageDoor);
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log('Configuring accessory %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  async addAccessory(name: string, cgdGarageDoor: CGDGarageDoor) {
    await cgdGarageDoor.waitForStatus();

    this.log('Adding new accessory with name %s', name);

    const uuid = this.api.hap.uuid.generate(name);

    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
    if (existingAccessory) {
      this.log('Accessory with name %s already exists', name);
      this.configureGarageDoorAccessory(existingAccessory, cgdGarageDoor);
      return;
    }

    const accessory = new this.api.platformAccessory(name, uuid);
    this.configureGarageDoorAccessory(accessory, cgdGarageDoor);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.log('Accessory with name %s added', name);
  }

  configureGarageDoorAccessory(accessory: PlatformAccessory, cgdGarageDoor: CGDGarageDoor) {
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

    const vacationSwitch = accessory.getService(this.api.hap.Service.Switch) || accessory.addService(new this.api.hap.Service.Switch(accessory.displayName));

    vacationSwitch.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => cgdGarageDoor.getVacation())
      .onSet((value) => cgdGarageDoor.setVacation(value));

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
        .getCharacteristic(this.api.hap.Characteristic.On).updateValue(cgdGarageDoor.getVacation());
    });

    this.log('Garage Door Accessory %s configured!', accessory.displayName);
  }
}
