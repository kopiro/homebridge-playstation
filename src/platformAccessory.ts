import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";
import { Device } from "playactor/dist/device";
import {
  DeviceStatus,
  IDiscoveredDevice,
} from "playactor/dist/discovery/model";

import { PlaystationPlatform } from "./platform";

export class PlaystationAccessory {
  private service: Service;
  private lockRefresh = false;
  private lockSetOn = false;

  private lockTimeout: NodeJS.Timeout | undefined;
  private readonly kLockTimeout = 15000;

  constructor(
    private readonly platform: PlaystationPlatform,
    private readonly accessory: PlatformAccessory<{
      deviceInformation: IDiscoveredDevice;
    }>
  ) {
    const { Service, Characteristic } = this.platform;
    const { deviceInformation } = accessory.context;

    this.accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, "Sony")
      .setCharacteristic(Characteristic.Model, deviceInformation.type)
      .setCharacteristic(Characteristic.SerialNumber, deviceInformation.id);
    this.accessory.category =
      this.platform.api.hap.Accessory.Categories.TV_SET_TOP_BOX;

    this.service =
      this.accessory.getService(Service.Television) ||
      this.accessory.addService(Service.Television);
    this.service.setCharacteristic(Characteristic.Name, deviceInformation.name);

    this.service
      .getCharacteristic(Characteristic.Active)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    setInterval(
      this.refreshDeviceInformations.bind(this),
      this.platform.config.pollInterval || this.platform.kDefaultPollInterval
    );
  }

  private getDevice() {
    const { deviceInformation } = this.accessory.context;
    return Device.withId(deviceInformation.id);
  }

  private updateCharacteristics() {
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .updateValue(
        this.accessory.context.deviceInformation.status === DeviceStatus.AWAKE
      );
  }

  async refreshDeviceInformations() {
    if (this.lockRefresh) {
      this.platform.log.debug("Refresh is locked");
      return;
    }

    this.lockRefresh = true;

    try {
      const device = this.getDevice();
      this.accessory.context.deviceInformation = await device.discover();
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
      this.removeLocks();
    }, this.kLockTimeout);
  }

  private removeLocks() {
    this.lockSetOn = false;
    this.lockRefresh = false;
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }
  }

  setOn(value: CharacteristicValue) {
    this.platform.log.debug("Set Characteristic On ->", value);
    if (this.lockSetOn) {
      this.platform.log.info("setOn is temporarly disabled");
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.addLocks();

    const device = this.getDevice();
    device
      .openConnection()
      .then(async (connection) => {
        this.platform.log.debug("Obtained connection");

        if (value) {
          this.platform.log.debug("Waking device");
          await device.wake();
        } else {
          this.platform.log.debug("Standby device");
          await connection.standby();
        }

        this.platform.log.debug("Closing connection");
        await connection.close();

        this.platform.log.debug("Connection closed, updating informations");

        this.accessory.context.deviceInformation.status = value
          ? DeviceStatus.AWAKE
          : DeviceStatus.STANDBY;
        this.updateCharacteristics();
      })
      .catch((err) => {
        this.platform.log.error((err as Error).message);
      })
      .finally(() => {
        this.removeLocks();
      });
  }

  async getOn(): Promise<CharacteristicValue> {
    this.platform.log.debug(
      "Get Characteristic On",
      this.accessory.context.deviceInformation.status
    );

    return (
      this.accessory.context.deviceInformation.status === DeviceStatus.AWAKE
    );
  }
}
