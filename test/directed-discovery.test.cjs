const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const test = require('node:test');

const { Device } = require('playactor/dist/device');
const { PlaystationAccessory } = require('../dist/playstationAccessory');

for (const deviceIp of [undefined, '192.0.2.10']) {
  test(`accessory discovery uses ${deviceIp ?? 'broadcast'}`, async () => {
    const originalWithId = Device.withId;
    let options;
    Device.withId = (id, config) => {
      options = { id, config };
      return { discover: async () => ({ id }) };
    };

    try {
      const accessory = {
        deviceInformation: { id: 'console-id' },
        platform: { config: { deviceIp } },
      };
      await PlaystationAccessory.prototype.discoverDevice.call(accessory);
      assert.deepEqual(options, {
        id: 'console-id',
        config: { deviceIp },
      });
    } finally {
      Device.withId = originalWithId;
    }
  });
}

test('login rejects an invalid IPv4 argument before discovery', () => {
  const cli = join(__dirname, '..', 'dist', 'cli.js');
  const result = spawnSync(process.execPath, [cli, '--ip', 'invalid'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: homebridge-playstation-login/);
});
