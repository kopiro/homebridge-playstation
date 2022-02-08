<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

# Homebridge Playstation

### Playstation integration for Homebridge / HOOBS.

_Hey Siri, turn on Playstation_ finally possible!

This integration exposes a Switch service that can be used to switch on/off your PS4/PS5, and determine its current state.

Most of the work is done by the amazing [playactor](https://github.com/dhleong/playactor) library, which this project depends on.

## Installation

You can install it via Homebridge UI or manually using:

```bash
npm -g install homebridge-playstation
```

## Configuration

It is highly recommended that you use either Homebridge Config UI X or the HOOBS UI to install and configure this plugin.

**The first time that you install the plugin you need to follow the authentication process provided by PlayActor library; therefore open the Homebridge logs and follow the instructions.**

Specifically, you'll need to open the authorization link in your browser, authenticate it using your PSN account, and copy the URL in the terminal.

Once you've done that, you need to go to "Settings" > "System" > "Remote Play" and provide the PIN code to PlayActor.

## Parameters

- `pollInterval`: Determine how often should informations be fetched (in milliseconds)
