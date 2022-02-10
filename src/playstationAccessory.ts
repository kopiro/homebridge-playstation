import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";
import { Device } from "playactor/dist/device";
import {
  DeviceStatus,
  IDiscoveredDevice,
} from "playactor/dist/discovery/model";

import { PlaystationPlatform } from "./playstationPlatform";
import { PLUGIN_NAME } from "./settings";

export class PlaystationAccessory {
  private readonly accessory: PlatformAccessory;
  private readonly service: Service;

  private lockRefresh = false;
  private lockSetOn = false;

  private lockTimeout: NodeJS.Timeout | undefined;
  private readonly kLockTimeout = 15000;

  constructor(
    private readonly platform: PlaystationPlatform,
    private deviceInformation: IDiscoveredDevice
  ) {
    const { Service, Characteristic, api } = platform;

    const uuid = api.hap.uuid.generate(deviceInformation.id);

    this.accessory = new api.platformAccessory<{
      deviceInformation: IDiscoveredDevice;
    }>(deviceInformation.name, uuid);

    this.accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, "Sony")
      .setCharacteristic(Characteristic.Model, deviceInformation.type)
      .setCharacteristic(Characteristic.SerialNumber, deviceInformation.id);

    this.service =
      this.accessory.getService(Service.Television) ||
      this.accessory.addService(Service.Television);
    this.accessory.category = api.hap.Categories.TV_SET_TOP_BOX;

    this.service
      .setCharacteristic(Characteristic.ConfiguredName, deviceInformation.name)
      .setCharacteristic(
        this.platform.Characteristic.SleepDiscoveryMode,
        this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      );

    this.service
      .getCharacteristic(Characteristic.Active)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    // These characteristics are required but not implemented yet

    this.service
      .getCharacteristic(Characteristic.RemoteKey)
      .onSet((newValue: CharacteristicValue) => {
        this.platform.log.debug(
          "Set RemoteKey is not implemented yet",
          newValue
        );
      });

    this.service.setCharacteristic(Characteristic.ActiveIdentifier, 1);

    this.service
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .onSet((newValue: CharacteristicValue) => {
        this.platform.log.debug(
          "Set ActiveIdentifier is not implemented yet",
          newValue
        );
      });

    setInterval(
      this.refreshDeviceInformations.bind(this),
      this.platform.config.pollInterval || this.platform.kDefaultPollInterval
    );

    api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  private getDevice() {
    return Device.withId(this.deviceInformation.id);
  }

  private updateCharacteristics() {
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .updateValue(this.deviceInformation.status === DeviceStatus.AWAKE);
  }

  async refreshDeviceInformations() {
    if (this.lockRefresh) {
      this.platform.log.debug("Refresh is locked");
      return;
    }

    this.lockRefresh = true;

    try {
      const device = this.getDevice();
      this.deviceInformation = await device.discover();
      this.updateCharacteristics();
    } catch (err) {
      this.platform.log.error((err as Error).message);
    } finally {
      this.lockRefresh = false;
    }
  }

  private addLocks() {
    this.lockSetOn = true;
    this.lockRefresh = true;
    this.lockTimeout = setTimeout(() => {
      this.platform.log.debug("Removing locks due to timeout");
      this.releaseLocks();
    }, this.kLockTimeout);
  }

  private releaseLocks() {
    this.lockSetOn = false;
    this.lockRefresh = false;
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }
  }

  async setOn(value: CharacteristicValue) {
    try {
      this.platform.log.debug("Set On ->", value);

      if (this.lockSetOn) {
        this.platform.log.info("setOn is locked");
        throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.RESOURCE_BUSY
        );
      }

      this.addLocks();

      this.platform.log.debug("Connecting to device...");

      const device = this.getDevice();
      const connection = await this.getDevice().openConnection();

      this.platform.log.debug("Obtained connection");

      if (value) {
        this.platform.log.debug("Waking device...");
        await device.wake();
      } else {
        this.platform.log.debug("Standby device...");
        await connection.standby();
      }

      this.platform.log.debug("Closing connection...");
      await connection.close();

      this.platform.log.debug("Connection closed");

      // If connection has been closed, most of the time the information has been correctly reflected in the system
      // We therefore can assume that the device is now in the desired state
      return value;
    } catch (err) {
      this.platform.log.error((err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    } finally {
      this.releaseLocks();
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    this.platform.log.debug("GetOn", this.deviceInformation.status);
    return this.deviceInformation.status === DeviceStatus.AWAKE;
  }
}
