import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";
import { Device } from "playactor/dist/device";
import {
  DeviceStatus,
  IDiscoveredDevice,
} from "playactor/dist/discovery/model";

import { PlaystationPlatform } from "./platform";

export class PlaystationAccessory {
  private service: Service;
  private lockUpdate = false;
  private lockSetOn = true;

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

    this.service =
      this.accessory.getService(Service.Switch) ||
      this.accessory.addService(Service.Switch);
    this.service.setCharacteristic(Characteristic.Name, deviceInformation.name);

    this.service
      .getCharacteristic(Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    setInterval(
      this.updateCharacteristics.bind(this),
      this.platform.config.pollInterval || this.platform.kDefaultPollInterval
    );
  }

  private getDevice() {
    const { deviceInformation } = this.accessory.context;
    return Device.withId(deviceInformation.id);
  }

  private async updateDeviceInformations() {
    const device = this.getDevice();
    this.accessory.context.deviceInformation = await device.discover();
  }

  async updateCharacteristics(forceLock = false) {
    if (this.lockUpdate && !forceLock) return;
    this.lockUpdate = true;

    try {
      await this.updateDeviceInformations();

      this.service
        .getCharacteristic(this.platform.Characteristic.On)
        .updateValue(
          this.accessory.context.deviceInformation.status === DeviceStatus.AWAKE
        );
    } catch (err) {
      this.platform.log.error((err as Error).message);
    } finally {
      this.lockUpdate = false;
    }
  }

  setOn(value: CharacteristicValue) {
    this.platform.log.debug("Set Characteristic On ->", value);
    if (!this.lockSetOn) {
      this.platform.log.info("setOn is temporarly disabled");
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.lockSetOn = false;

    const device = this.getDevice();
    device
      .openConnection()
      .then(async (connection) => {
        this.lockUpdate = true;

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

        this.platform.log.debug("Connection closed");

        await this.updateCharacteristics(true);
      })
      .catch((err) => {
        this.platform.log.error((err as Error).message);
      })
      .finally(() => {
        this.lockSetOn = true;
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
