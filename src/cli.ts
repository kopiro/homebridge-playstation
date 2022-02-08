#!/usr/bin/env node
import { DeviceOptions } from "playactor/dist/cli/options";
const opt = new DeviceOptions();
opt.dontAutoOpenUrls = true;
opt
  .findDevice()
  .then(async (device) => {
    try {
      await device.openConnection();
      console.log("Restart HomeBridge now!");
    } catch (err) {
      // noop, as the CLI in playactor manages errors
    }
  })
  .catch(() => {
    // noop, as the CLI in playactor manages errors
  });
