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
import { isIP } from "net";

export interface PlaystationPlatformConfig extends PlatformConfig {
  pollInterval?: number;
  deviceIp?: string;
  overrides?: Array<{ deviceId: string; name?: string }>;
  apps?: Array<{ id: string; name: string }>;
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
    this.log.debug("Config", config);
    if (this.config.deviceIp && isIP(this.config.deviceIp) !== 4) {
      this.log.error("deviceIp must be an IPv4 address");
      return;
    }
    this.log.info("Discovering devices...");

    this.discoverDevices().catch((err) => {
      this.log.error((err as Error).message);
    });
  }

  async discoverDevices() {
    const discovery = new Discovery({ deviceIp: this.config.deviceIp });
    const devices = discovery.discover();

    for await (const deviceInformation of devices) {
      this.log.debug("Discovered device:", deviceInformation);
      new PlaystationAccessory(this, deviceInformation);
    }
  }
}
