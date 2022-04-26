#!/usr/bin/env node

import { DeviceOptions } from "playactor/dist/cli/options";
import { Discovery } from "playactor/dist/discovery";
import readline from "readline";

const connect = async (deviceId) => {
  try {
    const opt = new DeviceOptions();
    opt.dontAutoOpenUrls = true;
    opt.deviceHostId = deviceId;

    console.log(`Connecting to <${deviceId}>...`);

    const device = await opt.findDevice();
    const conn = await device.openConnection();
    console.log(
      "Connection successful, wait a bit so we can safely close the connection..."
    );
    await conn.close();

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : err;
    console.error(message);
    return false;
  }
};

const confirm = (deviceName) => {
  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    input.question(`Authenticate to ${deviceName}? (y/n) `, (response) => {
      input.close();
      resolve(response.toLowerCase() === "y");
    });
  });
};

const discover = async () => {
  const discovery = new Discovery();
  const devices = discovery.discover();

  let success = false;
  for await (const device of devices) {
    console.log("Discovered device:", device);
    const confirmed = await confirm(device.name);
    if (confirmed) {
      // track if there were any successful connections
      success = (await connect(device.id)) || success;
    }

    console.log("\nDiscovering next device...");
  }

  return success;
};

discover()
  .then((success) => {
    if (success) {
      console.log("\nPlease restart Homebridge now!");
    } else {
      console.error("\nDid not authenticate to any consoles.");
    }
  })
  .catch((err) => console.error(err));
