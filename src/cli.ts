#!/usr/bin/env node
import { DeviceOptions } from "playactor/dist/cli/options";
const opt = new DeviceOptions();
opt.dontAutoOpenUrls = true;
opt
  .findDevice()
  .then((device) => {
    device
      .openConnection()
      .then((conn) => {
        conn.close();
        console.log("Connection succeded, restart HomeBridge now!");
      })
      .catch((err) => {
        console.error(err.message);
      });
  })
  .catch((err) => {
    console.error(err.message);
  });
