import {
  API,
  Logger,
  PlatformConfig,
  Service,
  Characteristic,
  IndependentPlatformPlugin,
} from "homebridge";

import { PlaystationAccessory } from "./playstationAccessory";
import { Device } from "playactor/dist/device";

export interface PlaystationPlatformConfig extends PlatformConfig {
  pollInterval?: number;
}
export class PlaystationPlatform implements IndependentPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly kDefaultPollInterval = 5000;

  constructor(
    public readonly log: Logger,
    public readonly config: PlaystationPlatformConfig,
    public readonly api: API
  ) {
    this.log.debug("Discovering devices...");

    this.discoverDevices()
      .then(() => {
        this.log.debug("Finished discovering devices.");
      })
      .catch((err) => {
        this.log.error((err as Error).message);
      });
  }

  async discoverDevices() {
    const device = await Device.any();
    const deviceInformation = await device.discover();
    this.log.info("Discovered device:", deviceInformation);

    new PlaystationAccessory(this, deviceInformation);
  }
}
