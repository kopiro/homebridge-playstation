<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

# Homebridge Playstation

### Playstation integration for Homebridge / HOOBS.

_Hey Siri, turn on Playstation_ finally possible!

![IMG_2114](https://user-images.githubusercontent.com/839700/153052274-c406ef19-e9f4-41b0-bb66-78134069021d.jpg)

This integration exposes a Switch service that can be used to switch on/off your PS4/PS5, and determine its current state.

Most of the work is done by the amazing [playactor](https://github.com/dhleong/playactor) library, which this project depends on.

## Installation

You can install it via Homebridge UI or manually using:

```bash
npm -g install homebridge-playstation
```

## Configuration

Before doing anything, switch on your PlayStation.

Now you need to configure **PlayActor** and follow the authentication process provided by the library; to do so, open the terminal in the HomeBridge UI (make sure you don't run these commands as `root`, you need to run them as `homebridge` user!) and run:

```bash
homebridge-playstation-login
```

Open the authorization link provided, authenticate it using your PSN account, and copy the URL when the page shows "redirect" in the terminal.

Once you've done that, go to Settings > System > Remote Play > Link Device and provide the PIN code.

Now just restart the HomeBridge instance, and add your fresh new PlayStation as extra accessory using "Add Accessory" in the Home app.

## Parameters

- `pollInterval`: Determine how often should informations be fetched (in milliseconds)
