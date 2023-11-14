import {
  API,
  Logger,
  PlatformConfig,
  Service,
  Characteristic,
  IndependentPlatformPlugin,
} from "homebridge";

import { PlaystationAccessory } from "./playstationAccessory";
import { Discovery } from "playactor/dist/discovery";

export interface PlaystationPlatformConfig extends PlatformConfig {
  pollInterval?: number;
}
export class PlaystationPlatform implements IndependentPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly kDefaultPollInterval = 15_000;

  constructor(
    public readonly log: Logger,
    public readonly config: PlaystationPlatformConfig,
    public readonly api: API
  ) {
    this.log.info("Discovering devices...");

    this.discoverDevices()
      .then(() => {
        this.log.debug("Finished discovering devices.");
      })
      .catch((err) => {
        this.log.error((err as Error).message);
      });
  }

  async discoverDevices() {
    const discovery = new Discovery();
    const devices = discovery.discover();

    for await (const deviceInformation of devices) {
      this.log.debug("Discovered device:", deviceInformation);
      new PlaystationAccessory(this, deviceInformation);

      // Do not add more then one device as current method does not support multiple devices
      break;
    }
  }
}
