#!/usr/bin/env node
import { DeviceOptions } from "playactor/dist/cli/options";
const opt = new DeviceOptions();
opt.dontAutoOpenUrls = true;
opt
  .findDevice()
  .then(async (device) => {
    await device.openConnection();
    console.log("Restart HomeBridge now!");
  })
  .catch((err) => {
    console.error(err);
  });
