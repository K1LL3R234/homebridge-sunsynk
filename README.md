[![npm version](https://badgen.net/npm/v/homebridge-sunsynk/latest)](https://www.npmjs.com/package/homebridge-sunsynk)
[![npm beta version](https://badgen.net/npm/v/homebridge-sunsynk/beta)](https://www.npmjs.com/package/homebridge-sunsynk)
[![npm downloads](https://badgen.net/npm/dt/homebridge-sunsynk)](https://www.npmjs.com/package/homebridge-sunsynk)
[![GitHub last commit](https://badgen.net/github/last-commit/K1LL3R234/homebridge-sunsynk)](https://github.com/K1LL3R234/homebridge-sunsynk)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
# homebridge-sunsynk
 Sunsynk Inveter plugin

A plugin for [Homebridge](https://github.com/nfarina/homebridge) that connects to your Sunsynk Inverter with Homekit. The plugin provides nine key sensors:  Current Power Production (in Watts), Today's Yield (in kWh), This Month's Yield (in kWh), This Year's Yield (in kWh), the Total Yield (in kWh), Battery Power (in W), Battery SOC (in %), Load Power (in W) and Grid Power (as an outlet). With these sensors, you can effortlessly create automations in your Apple Home based on your solar panel yield, power usage and battery status for a Sunsynk inverter and the e-linter API. homebridge-sunsynk was originated by [Chris Posthumus](https://github.com/k1ll3r234).


You can also set automations to happen when battery reach a certain level or when you generate more than enough power and can turn your pool pump on etc.

**IMPORTANT** - To use this plugin you will require a Sunsynk Inverter and the e-linter device (**NOT THE SOLARMAN**), so let us know if you get it working.

## Configuration

Username and Password is the email you login to the Sunsynk app. The pollInterval is how often you want to update the homekit in minutes. The lowbatt is wher it will change the state to low battery and you can the trigger automations.

Example:

```json
{
    "name": "Sunsynk Inverter",
    "platform": "Sunsynk",
    "options": {
        "username": "",
        "password": "",
        "pollInterval": 10,
        "lowbatt": 20,
        "debug": false
    }
}
```

### Choosing which sensors to publish

By default all nine sensors are published. If you don't need some of them, for example the battery sensors on a system without a battery, add an optional `sensors` block and set the ones you don't want to `false`:

```json
{
    "name": "Sunsynk Inverter",
    "platform": "Sunsynk",
    "options": {
        "username": "",
        "password": "",
        "pollInterval": 10,
        "lowbatt": 20,
        "debug": false,
        "sensors": {
            "batteryPower": false,
            "batterySoc": false,
            "gridPower": false
        }
    }
}
```

You can also tick and untick them in the Homebridge UI. Only a sensor explicitly set to `false` is switched off, so you only need to list the ones you are turning off, and a config without a `sensors` block keeps publishing all nine.

| Setting | Accessory in HomeKit | Appears as |
| --- | --- | --- |
| `currentPvPower` | Current PV Power W | Light sensor |
| `todayPvEnergy` | Today PV Electricity kWh | Light sensor |
| `monthPvEnergy` | Month PV Electricity kWh | Light sensor |
| `yearPvEnergy` | Year PV Electricity kWh | Light sensor |
| `totalPvEnergy` | Total PV Electricity kWh | Light sensor |
| `batteryPower` | Battery Power W | Light sensor |
| `batterySoc` | Battery SOC | Humidity sensor and battery |
| `loadPower` | Load Power W | Light sensor |
| `gridPower` | Grid Power | Outlet |

When every sensor that uses a given part of the Sunsynk API is switched off, that data is no longer requested at all.

**Turning a sensor off removes it from HomeKit on the next restart.** Anything attached to it in the Home app goes with it: automations, scenes, favourites, its room and any custom name you gave it. Turning it back on later adds it again as a new accessory, so you would need to set those up again.

### More than one plant or inverter

The plugin uses the first plant on the Sunsynk account and the first inverter in that plant. When there is more than one, the Homebridge log lists each of them with its ID at startup. Copy the one you want into `plantId` or `inverterSn`:

```json
"options": {
    "username": "",
    "password": "",
    "plantId": "123456",
    "inverterSn": "2301234567"
}
```

If a configured plant ID is not on the account, the log says so and lists the plants it found, and the plugin stops polling until the config is fixed. A configured inverter that is not found only switches off what needs the inverter: Grid Power and the Apple Home Energy devices below.

## Apple Home Energy (beta)

> **Beta.** This relies on how iOS 27's Home app treats Matter electrical devices, which Apple has not documented. It works on the setup it was tested on, but an iOS or Homebridge update may change what the Home app shows or stop it working. Please report what you see in an issue.

On Homebridge 2.4.0 or later with Matter switched on for the bridge, the plugin also publishes three Matter devices that the Home app shows under its Energy filter:

| Device | What it reports | How the Home app uses it |
| --- | --- | --- |
| Sunsynk Grid | Grid power, positive while importing and negative while exporting, plus the lifetime imported and exported energy | The whole home figure under All Home |
| Sunsynk Load | House load power and lifetime energy used | Listed under All Home |
| Sunsynk Solar | Inverter AC output as negative power (0 W at night, rather than the inverter's own standby draw), and its lifetime energy produced | Listed under All Home |

The Energy filter shows live power only. The lifetime totals are published as well, but the Home app did not show any energy history for them in testing outside the US, where Apple's Energy tab is not offered.

To set it up:

1. Run the plugin as a child bridge and switch Matter on for that bridge in the Homebridge settings.
2. Restart Homebridge, then add the bridge to the Home app using its **Matter** QR code or pairing code. This is a separate pairing from the HomeKit one.
3. Set the poll interval to 1 minute. Sunsynk's cloud updates about once a minute, so polling faster gains nothing.

The devices are on by default once Matter is on, and each one can be switched off in the `matter` block. Load and solar are sensors by default: they are listed under All Home but have no room tile. Set `loadAs` or `pvAs` to `outlet` to get a room tile with live watts instead; its switch stays on, because there is nothing to switch. In testing, an outlet then no longer appears under All Home, so it is one or the other.

**After changing the `matter` block, remove the bridge from the Home app and pair it again.** The Home app picks up a device removed from a paired Matter bridge, but often ignores one added to it, and switching between sensor and outlet does both. Rooms and custom names need setting again after pairing. If pairing hangs after removing the bridge, restart Homebridge and try again.

```json
"options": {
    "username": "",
    "password": "",
    "pollInterval": 1,
    "matter": {
        "grid": true,
        "load": true,
        "loadAs": "sensor",
        "pv": true,
        "pvAs": "sensor"
    }
}
```

The HomeKit sensors keep working alongside. If you only want the Matter devices, switch the HomeKit ones off with the `sensors` block. Battery readings are not published over Matter yet, because the Home app shows Matter batteries as "Not Supported"; Battery SOC stays a HomeKit sensor.

## Thanks

A big thank you to [atdr](https://github.com/atdr) for the contributions to this plugin: the option to choose which sensors get published, and the fixes for the plugin stopping after a failed poll and crashing when the inverter is not in its normal state. The reports and the pull requests were both thorough and tested on real hardware, and the plugin is a lot more robust for it.

Thanks as well to everyone who opens issues and feature requests. Keep them coming.

## Future features

I will add more things as it is requested or when I find need for it.

Please add feature recomendations [here](https://github.com/K1LL3R234/homebridge-sunsynk/issues/new?assignees=&labels=&projects=&template=feature_request.md&title=).

If you want to discuss things go [here](https://github.com/K1LL3R234/homebridge-sunsynk/discussions).