import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { PlaystationAccessory } from "./platformAccessory";
import { IDiscoveredDevice } from "playactor/dist/discovery/model";
import { Device } from "playactor/dist/device";

export interface PlaystationPlatformConfig extends PlatformConfig {
  pollInterval?: number;
}
export class PlaystationPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly kDefaultPollInterval = 5000;

  constructor(
    public readonly log: Logger,
    public readonly config: PlaystationPlatformConfig,
    public readonly api: API
  ) {
    this.log.debug("Finished initializing platform:", this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on("didFinishLaunching", async () => {
      this.log.debug("Executed didFinishLaunching callback");
      // run the method to discover / register your devices as accessories
      try {
        await this.discoverDevices();
      } catch (err) {
        this.log.error((err as Error).message);
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    const device = await Device.any();
    const deviceInformation = await device.discover();

    this.log.debug("Discovered device:", deviceInformation);

    // generate a unique id for the accessory this should be generated from
    // something globally unique, but constant, for example, the device serial
    // number or MAC address
    const uuid = this.api.hap.uuid.generate(deviceInformation.id);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find<
      PlatformAccessory<{
        deviceInformation: IDiscoveredDevice;
      }>
    >(
      (
        accessory
      ): accessory is PlatformAccessory<{
        deviceInformation: IDiscoveredDevice;
      }> => accessory.UUID === uuid
    );

    if (existingAccessory) {
      // the accessory already exists
      this.log.info(
        "Restoring existing accessory from cache:",
        existingAccessory.context.deviceInformation.name
      );

      existingAccessory.context.deviceInformation = deviceInformation;
      this.api.updatePlatformAccessories([existingAccessory]);

      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new PlaystationAccessory(this, existingAccessory);
    } else {
      const connection = await device.openConnection();
      if (!connection) {
        throw new Error(
          "The device doesn't look configured, please run 'npm run homebridge-playstation-login' to configure it, then restart Homebridge."
        );
      }
      await connection.close();

      this.log.debug("Successfully connected to device.");

      this.log.info("Adding new accessory:", deviceInformation.name);

      const accessory = new this.api.platformAccessory<{
        deviceInformation: IDiscoveredDevice;
      }>(deviceInformation.name, uuid);

      accessory.context.deviceInformation = deviceInformation;

      new PlaystationAccessory(this, accessory);

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }
}
