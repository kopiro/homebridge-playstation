import {API, Characteristic, CharacteristicValue, PlatformAccessory, Service,} from "homebridge";
import {Device} from "playactor/dist/device";
import {DeviceStatus, IDiscoveredDevice,} from "playactor/dist/discovery/model";

import {PlaystationPlatform} from "./playstationPlatform";
import {PLUGIN_NAME} from "./settings";

export class PlaystationAccessory {
  private readonly accessory: PlatformAccessory;
  private readonly tvService: Service;

  private readonly api: API = this.platform.api;
  private readonly Service: typeof Service = this.platform.Service;
  private readonly Characteristic: typeof Characteristic =
    this.platform.Characteristic;

  private lockUpdate = false;
  private lockSetOn = false;

  private lockTimeout: NodeJS.Timeout | undefined;
  private readonly kLockTimeout = 20_000;

  // list of titles that can be started through Home app
  private titleIDs: unknown[] = [];

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
      .setCharacteristic(
        this.Characteristic.ConfiguredName,
        deviceInformation.name
      )
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

    this.tvService.setCharacteristic(this.Characteristic.ActiveIdentifier, 0);
    this.setTitleList();

    this.tvService
      .getCharacteristic(this.Characteristic.ActiveIdentifier)
      .onSet(this.setTitleSwitchState.bind(this))

    setInterval(
      this.updateDeviceInformations.bind(this),
      this.platform.config.pollInterval || this.platform.kDefaultPollInterval
    );

    this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  private setTitleList() {
    // if nothing selected yet, add a placeholder
    this.addTitleToList('CUSAXXXXXX', '---', 0);
    const titleList = this.platform.config.apps || [];
    titleList.forEach((title, index) => {
      this.addTitleToList(title.id, title.name, index + 1);
    });
  }

  private addTitleToList(titleId: string, titleName: string, index: number) {

    this.platform.log.debug("adding input for title: ", titleId, titleName);

    const titleInputSource = new this.Service.InputSource(titleName, titleId);
    titleInputSource
      .setCharacteristic(this.Characteristic.Identifier, index)
      .setCharacteristic(this.Characteristic.Name, titleName)
      .setCharacteristic(this.Characteristic.ConfiguredName, titleName)
      .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.APPLICATION)
      .setCharacteristic(this.Characteristic.CurrentVisibilityState, this.Characteristic.CurrentVisibilityState.SHOWN);

    this.accessory.addService(titleInputSource);
    this.tvService.addLinkedService(titleInputSource);

    this.titleIDs.push(titleId)
  }

  private async discoverDevice() {
    // Wrapper to get the device and making sure you always call .discover() before using the device,
    // otherwise you will get an "Error: Unexpected discovery message"
    const device = Device.withId(this.deviceInformation.id);
    this.deviceInformation = await device.discover();
    return device;
  }

  private updateCharacteristics() {
    this.tvService
      .getCharacteristic(this.platform.Characteristic.Active)
      .updateValue(this.deviceInformation.status === DeviceStatus.AWAKE);

    const runningAppTitle = this.titleIDs.indexOf(this.deviceInformation.extras['running-app-titleid'] || 0);
    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .updateValue(runningAppTitle == -1 ? 0 : runningAppTitle);

    this.platform.log.debug(`Device status updated ${this.deviceInformation.status}, title: ${this.deviceInformation.extras['running-app-titleid'] || 'no app running'} ${this.deviceInformation.extras['running-app-name'] || ''} id: ${runningAppTitle}`);
  }

  private async updateDeviceInformations(force = false) {
    if (this.lockUpdate && !force) {
      return;
    }

    this.lockUpdate = true;

    try {
      await this.discoverDevice();
      this.updateCharacteristics();
    } catch (err) {
      this.platform.log.error((err as Error).message);
    } finally {
      this.lockUpdate = false;
    }
  }

  private addLocks() {
    this.lockSetOn = true;
    this.lockUpdate = true;
    this.lockTimeout = setTimeout(() => {
      this.platform.log.debug("Removing locks due to timeout");
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
    this.platform.log.debug("setOn ->", value);

    if (this.lockSetOn) {
      this.platform.log.info(
        `Lock is active, ignoring request.\nYou're experiencing this because the previous operation is still in progress, or, less likely because the cleanup of the previous connection failed.\nThis is a Playstation and RemotePlay limitation, as opening/closing connection can take up to 20 seconds, after which the lock will be released anyway.\nTry to use the plugin as normal without hammering the switch button on/off, don't fall in the trap of the Heisenbug.`
      );
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.platform.log.debug("Discovering device...");

    this.addLocks();

    this.discoverDevice()
      .then(async (device) => {
        if (
          (value == true &&
            this.deviceInformation.status === DeviceStatus.AWAKE) ||
          (value == false &&
            this.deviceInformation.status === DeviceStatus.STANDBY)
        ) {
          this.platform.log.debug("Already in desired state");
          this.updateCharacteristics();
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

  private async setTitleSwitchState(value: CharacteristicValue) {
    this.platform.log.debug("setTitleSwitchState ->", value);

    const requestedTitle = this.titleIDs[value as number] as string || null

    if (!requestedTitle) {
      this.platform.log.debug("No title found for index ->", value);
      return;
    }

    if (this.lockSetOn) {
      this.platform.log.info(
        `Lock is active, ignoring request.\nYou're experiencing this because the previous operation is still in progress, or, less likely because the cleanup of the previous connection failed.\nThis is a Playstation and RemotePlay limitation, as opening/closing connection can take up to 20 seconds, after which the lock will be released anyway.\nTry to use the plugin as normal without hammering the switch button on/off, don't fall in the trap of the Heisenbug.`
      );
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.addLocks();

    this.discoverDevice()
      .then(async (device) => {
        if (this.deviceInformation.extras['running-app-titleid'] === requestedTitle) {
          this.platform.log.debug("Title already running");
          this.updateCharacteristics();
          return;
        }

        this.platform.log.debug(`starting title ${requestedTitle} ...`);
        const connection = await device.openConnection();

        await connection.startTitleId?.(requestedTitle);

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
}
