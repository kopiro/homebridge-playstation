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
import { addLock, hasLock, releaseLock } from "./locks";

import { PlaystationPlatform } from "./playstationPlatform";
import { PLUGIN_NAME } from "./settings";

enum Locks {
  "RETRIEVE_DEVICE_STATUS" = "RETRIEVE_DEVICE_STATUS",
  "SET_ON" = "SET_ON",
}

export class PlaystationAccessory {
  private readonly accessory: PlatformAccessory;
  private readonly tvService: Service;

  private readonly api: API = this.platform.api;
  private readonly Service: typeof Service = this.platform.Service;
  private readonly Characteristic: typeof Characteristic =
    this.platform.Characteristic;

  private deviceReachable = false;

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
      .setCharacteristic(this.Characteristic.SerialNumber, deviceInformation.id)
      .setCharacteristic(
        this.Characteristic.FirmwareRevision,
        deviceInformation.systemVersion
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

    this.retrieveDeviceStatusAndUpdateAllCharacteristics();
    setInterval(
      this.retrieveDeviceStatusAndUpdateAllCharacteristics.bind(this),
      this.platform.config.pollInterval || this.platform.kDefaultPollInterval
    );

    this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  private async discoverDevice() {
    this.platform.log.debug("Discovering device...");

    try {
      // Wrapper to get the device and making sure you always call .discover() before using the device,
      // otherwise you will get a "Error: Unexpected discovery message"
      const device = Device.withId(this.deviceInformation.id);
      this.deviceInformation = await device.discover();
      this.deviceReachable = true;
      return device;
    } catch (err) {
      this.platform.log.debug("Device is not reachable");
      this.deviceReachable = false;
      throw err;
    }
  }

  private updateAllCharacteristics() {
    const activeValue = this.getCharacteristicActiveValue();
    this.tvService
      .getCharacteristic(this.platform.Characteristic.Active)
      .updateValue(activeValue);

    this.platform.log.debug("Characteristic Active ->", activeValue);
  }

  private async retrieveDeviceStatusAndUpdateAllCharacteristics() {
    if (hasLock(Locks.RETRIEVE_DEVICE_STATUS)) return;

    addLock(Locks.RETRIEVE_DEVICE_STATUS, 20_000);
    this.platform.log.debug("Updating device informations...");

    try {
      await this.discoverDevice();
    } catch (err) {
      this.platform.log.error((err as Error).message);
    }

    releaseLock(Locks.RETRIEVE_DEVICE_STATUS);
    this.updateAllCharacteristics();
  }

  private async getOn() {
    return this.getCharacteristicActiveValue();
  }

  private setOn(value: CharacteristicValue) {
    this.platform.log.debug("Requesting active value to", value);

    if (hasLock(Locks.SET_ON)) {
      this.platform.log.info("Locked");
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    // If device is not reachable, we throw error
    // during the setOn instead of simply showing it off
    if (!this.deviceReachable) {
      this.platform.log.info("Device is unreachable");
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }

    addLock(Locks.SET_ON, 20_000);

    this.discoverDevice()
      .then(async (device) => {
        if (
          (value == true &&
            this.deviceInformation.status === DeviceStatus.AWAKE) ||
          (value == false &&
            this.deviceInformation.status === DeviceStatus.STANDBY)
        ) {
          this.platform.log.debug("Already in desired state");
          this.updateAllCharacteristics();
          return;
        }

        this.platform.log.debug("Opening connection...");
        const connection = await device.openConnection();

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
        this.platform.log.error(
          "setOn caused an error",
          (err as Error).message
        );
        this.updateAllCharacteristics();
      })
      .finally(() => {
        releaseLock(Locks.SET_ON);
      });
  }

  private getCharacteristicActiveValue(): boolean {
    return (
      this.deviceReachable &&
      this.deviceInformation.status === DeviceStatus.AWAKE
    );
  }
}
