import {
  API,
  Characteristic,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
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
  private readonly log: Logging;
  private readonly Service: typeof Service = this.platform.Service;
  private readonly Characteristic: typeof Characteristic =
    this.platform.Characteristic;

  private lockUpdate = false;
  private lockSetOn = false;

  private tick: NodeJS.Timeout | undefined;

  private lockTimeout: NodeJS.Timeout | undefined;
  private readonly kLockTimeout = 20_000;

  // list of titles that can be started through Home app
  private titleIDs: unknown[] = [];

  constructor(
    private readonly platform: PlaystationPlatform,
    private deviceInformation: IDiscoveredDevice
  ) {
    const uuid = this.api.hap.uuid.generate(deviceInformation.id);
    const overrides = this.getOverrides();

    const deviceName = overrides?.name || deviceInformation.name;

    // @ts-expect-error - private property
    this.log = {
      ...this.platform.log,
      prefix: this.platform.log.prefix + `/${deviceName}`,
    };

    this.accessory = new this.api.platformAccessory<{
      deviceInformation: IDiscoveredDevice;
    }>(deviceName, uuid);
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
      .setCharacteristic(this.Characteristic.ConfiguredName, deviceName)
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
        this.log.debug(`Set RemoteKey is not implemented yet`, newValue);
      });

    this.tvService.setCharacteristic(this.Characteristic.ActiveIdentifier, 0);

    this.setTitleList();

    this.tvService
      .getCharacteristic(this.Characteristic.ActiveIdentifier)
      .onSet(this.setTitleSwitchState.bind(this));

    this.tick = setInterval(
      this.updateDeviceInformations.bind(this),
      this.platform.config.pollInterval || this.platform.kDefaultPollInterval
    );

    this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  private getOverrides() {
    const overrides = this.platform.config.overrides || [];
    return overrides.find(
      (override) => override.deviceId === this.deviceInformation.id
    );
  }

  private setTitleList() {
    // if nothing selected yet, add a placeholder
    this.addTitleToList("CUSAXXXXXX", "---", 0);
    const titleList = this.platform.config.apps || [];
    titleList.forEach((title, index) => {
      this.log.debug(`Adding input for title: `, title);
      this.addTitleToList(title.id, title.name, index + 1);
    });
  }

  private addTitleToList(titleId: string, titleName: string, index: number) {
    const titleInputSource = new this.Service.InputSource(titleName, titleId);
    titleInputSource
      .setCharacteristic(this.Characteristic.Identifier, index)
      .setCharacteristic(this.Characteristic.Name, titleName)
      .setCharacteristic(this.Characteristic.ConfiguredName, titleName)
      .setCharacteristic(
        this.Characteristic.IsConfigured,
        this.Characteristic.IsConfigured.CONFIGURED
      )
      .setCharacteristic(
        this.Characteristic.InputSourceType,
        this.Characteristic.InputSourceType.APPLICATION
      )
      .setCharacteristic(
        this.Characteristic.CurrentVisibilityState,
        this.Characteristic.CurrentVisibilityState.SHOWN
      );

    this.accessory.addService(titleInputSource);
    this.tvService.addLinkedService(titleInputSource);

    this.titleIDs.push(titleId);
  }

  private async discoverDevice() {
    // Wrapper to get the device and making sure you always call .discover() before using the device,
    // otherwise you will get an "Error: Unexpected discovery message"
    const device = Device.withId(this.deviceInformation.id);
    this.deviceInformation = await device.discover();
    return device;
  }

  private notifyCharacteristicsUpdate() {
    this.tvService
      .getCharacteristic(this.platform.Characteristic.Active)
      .updateValue(this.deviceInformation.status === DeviceStatus.AWAKE);

    const runningAppTitle = this.titleIDs.indexOf(
      this.deviceInformation.extras["running-app-titleid"] || 0
    );
    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .updateValue(runningAppTitle == -1 ? 0 : runningAppTitle);

    this.log.debug(`Device status updated to:`, this.deviceInformation.status);
  }

  private async updateDeviceInformations(force = false) {
    if (this.lockUpdate && !force) {
      return;
    }

    this.lockUpdate = true;

    try {
      await this.discoverDevice();
    } catch (err) {
      this.log.error((err as Error).message);
      // If we can't discover the device, it's probably OFF
      this.deviceInformation.status = DeviceStatus.STANDBY;
    } finally {
      this.lockUpdate = false;
      this.notifyCharacteristicsUpdate();
    }
  }

  private addLocks() {
    this.lockSetOn = true;
    this.lockUpdate = true;
    this.lockTimeout = setTimeout(() => {
      this.log.debug(`Removing locks due to timeout`);
      this.releaseLocks();
    }, this.kLockTimeout);
  }

  private releaseLocks() {
    this.lockSetOn = false;
    this.lockUpdate = false;
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }
  }

  private setOn(value: CharacteristicValue) {
    this.log.debug(`setOn:`, value);

    if (this.lockSetOn) {
      this.log.info(
        `Lock is active, ignoring request.\nYou're experiencing this because the previous operation is still in progress, or, less likely because the cleanup of the previous connection failed.\nThis is a Playstation and RemotePlay limitation, as opening/closing connection can take up to 20 seconds, after which the lock will be released anyway.\nTry to use the plugin as normal without hammering the switch button on/off, don't fall in the trap of the Heisenbug.`
      );
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.log.debug("Discovering device...");

    this.addLocks();

    this.discoverDevice()
      .then(async (device) => {
        if (
          (value == true &&
            this.deviceInformation.status === DeviceStatus.AWAKE) ||
          (value == false &&
            this.deviceInformation.status === DeviceStatus.STANDBY)
        ) {
          this.log.debug(`Already in desired state`);
          this.notifyCharacteristicsUpdate();
          return;
        }

        this.log.debug(`Opening connection...`);
        const connection = await device.openConnection();

        if (value) {
          this.log.debug(`Waking device...`);
          await device.wake();
        } else {
          this.log.debug(`Standby device...`);
          await connection.standby();
        }

        this.log.debug(`Closing connection...`);
        await connection.close();

        this.log.debug(`Connection closed`);
      })
      .catch((err) => {
        this.log.error((err as Error).message);
      })
      .finally(() => {
        this.releaseLocks();
      });
  }

  private async getOn(): Promise<CharacteristicValue> {
    return this.deviceInformation.status === DeviceStatus.AWAKE;
  }

  private async setTitleSwitchState(value: CharacteristicValue) {
    this.log.debug(`setTitleSwitchState: `, value);

    const requestedTitle = (this.titleIDs[value as number] as string) || null;

    if (!requestedTitle) {
      this.log.debug(`No title found for index: `, value);
      return;
    }

    if (this.lockSetOn) {
      this.log.info(
        `Lock is active, ignoring request.\nYou're experiencing this because the previous operation is still in progress, or, less likely because the cleanup of the previous connection failed.\nThis is a Playstation and RemotePlay limitation, as opening/closing connection can take up to 20 seconds, after which the lock will be released anyway.\nTry to use the plugin as normal without hammering the switch button on/off, don't fall in the trap of the Heisenbug.`
      );
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.addLocks();

    this.discoverDevice()
      .then(async (device) => {
        if (
          this.deviceInformation.extras["running-app-titleid"] ===
          requestedTitle
        ) {
          this.log.debug(`Title already running`);
          this.notifyCharacteristicsUpdate();
          return;
        }

        this.log.debug(`Starting title ${requestedTitle} ...`);
        const connection = await device.openConnection();

        await connection.startTitleId?.(requestedTitle);

        this.log.debug(`Closing connection...`);
        await connection.close();

        this.log.debug(`Connection closed`);
      })
      .catch((err) => {
        this.log.error((err as Error).message);
      })
      .finally(() => {
        this.releaseLocks();
      });
  }
}
