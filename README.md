<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

# Homebridge Playstation

### Playstation integration for Homebridge / HOOBS.

_Hey Siri, turn on Playstation_ finally possible!

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

![IMG_2114](https://user-images.githubusercontent.com/839700/153052274-c406ef19-e9f4-41b0-bb66-78134069021d.jpg)

This integration exposes a Switch service that can be used to switch on/off your PS4/PS5, and determine its current state.

Most of the work is done by the amazing [playactor](https://github.com/dhleong/playactor) library, which this project depends on.

## Installation

You can install it via Homebridge UI or manually using:

```bash
npm -g install homebridge-playstation
```

## Configuration

- Turn on your PlayStation, go to "Settings" and enable "Remote Play".

- Run this command as `homebridge` user, make sure you don't run these commands as `root` or `pi`, otherwise nothing will work):

```bash
homebridge-playstation-login
```

You can do this by using the Homebridge UI terminal or an SSH session and manually changing user with `su homebridge`

- Open the authorization link provided, authenticate it using your PSN account, and copy the URL when the page shows "redirect" in the terminal.

- On your PlayStation go to "Settings" > "System" > "Remote Play" > "Link Device" and provide the PIN code.

- Restart the HomeBridge instance

- At boot, you should see a message like `"Please add [PS5 XYZ] manually in Home app. Setup Code: 111-22-333"` in the  logs; open the Home app and add your PlayStation as an extra accessory using "Add Accessory" in the top-right menu

## Parameters

- `pollInterval`: Determine how often should informations be fetched (in milliseconds)

## Troubleshooting

If at some point you have any problem, you can try to reset the Homebridge accessory and re-pair it.

To do so, go to Homebridge UI > "Settings" > "Unpair Bridges / Cameras / TVs / External Accessories" and delete the Playstation.

To reset the credentials used by PlayActor, you need to manually remove the directory `/home/homebridge/.config/playactor`
