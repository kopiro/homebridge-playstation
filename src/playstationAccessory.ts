import {
  Service,
  API,
  Characteristic,
  PlatformAccessory,
  CharacteristicValue,
} from "homebridge";
import { Device } from "playactor/dist/device";
import {
  DeviceStatus,
  IDiscoveredDevice,
} from "playactor/dist/discovery/model";

import { PlaystationPlatform } from "./playstationPlatform";
import { PLUGIN_NAME } from "./settings";

export class PlaystationAccessory {
  private readonly accessory: PlatformAccessory;
  private readonly tvService: Service;

  private readonly api: API = this.platform.api;
  private readonly Service: typeof Service = this.platform.Service;
  private readonly Characteristic: typeof Characteristic =
    this.platform.Characteristic;

  private lockRefresh = false;
  private lockSetOn = false;

  private lockTimeout: NodeJS.Timeout | undefined;
  private readonly kLockTimeout = 15000;

  constructor(
    private readonly platform: PlaystationPlatform,
    private deviceInformation: IDiscoveredDevice
  ) {
    const uuid = this.api.hap.uuid.generate(deviceInformation.id);

    this.accessory = new this.api.platformAccessory<{
      deviceInformation: IDiscoveredDevice;
    }>(deviceInformation.name, uuid);
    this.accessory.category = this.api.hap.Categories.TV_SET_TOP_BOX;

    this.accessory
      .getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, "Sony")
      .setCharacteristic(this.Characteristic.Model, deviceInformation.type)
      .setCharacteristic(
        this.Characteristic.SerialNumber,
        deviceInformation.id
      );

    this.tvService =
      this.accessory.getService(this.Service.Television) ||
      this.accessory.addService(this.Service.Television);

    this.tvService
      .setCharacteristic(this.Characteristic.Name, deviceInformation.name)
      .setCharacteristic(
        this.platform.Characteristic.SleepDiscoveryMode,
        this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      );

    this.tvService
      .getCharacteristic(this.Characteristic.Active)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    // These characteristics are required but not implemented yet

    this.tvService
      .getCharacteristic(this.Characteristic.RemoteKey)
      .onSet((newValue: CharacteristicValue) => {
        this.platform.log.debug(
          "Set RemoteKey is not implemented yet",
          newValue
        );
      });

    this.tvService.setCharacteristic(this.Characteristic.ActiveIdentifier, 1);

    this.tvService
      .getCharacteristic(this.Characteristic.ActiveIdentifier)
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

    this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  private getDevice() {
    try {
      return Device.withId(this.deviceInformation.id);
    } catch (err) {
      return null;
    }
  }

  private updateCharacteristics() {
    this.tvService
      .getCharacteristic(this.platform.Characteristic.Active)
      .updateValue(this.deviceInformation.status === DeviceStatus.AWAKE);
  }

  private async refreshDeviceInformations() {
    if (this.lockRefresh) {
      this.platform.log.debug("Refresh is locked");
      return;
    }

    this.lockRefresh = true;

    try {
      const device = this.getDevice();
      if (!device) return;

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

  private setOn(value: CharacteristicValue) {
    this.platform.log.debug("setOn ->", value);

    if (this.lockSetOn) {
      this.platform.log.info("setOn is locked");
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.platform.log.debug("Connecting to device...");
    const device = this.getDevice();
    if (!device) return;

    this.addLocks();

    device
      .openConnection()
      .then(async (connection) => {
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
      })
      .catch((err) => {
        this.platform.log.error((err as Error).message);
      })
      .finally(() => {
        this.releaseLocks();
      });
  }

  private async getOn(): Promise<CharacteristicValue> {
    this.platform.log.debug("getOn is ->", this.deviceInformation.status);
    return this.deviceInformation.status === DeviceStatus.AWAKE;
  }
}
