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

## Thanks

A big thank you to [atdr](https://github.com/atdr) for the contributions to this plugin: the option to choose which sensors get published, and the fixes for the plugin stopping after a failed poll and crashing when the inverter is not in its normal state. The reports and the pull requests were both thorough and tested on real hardware, and the plugin is a lot more robust for it.

Thanks as well to everyone who opens issues and feature requests. Keep them coming.

## Future features

I will add more things as it is requested or when I find need for it.

Please add feature recomendations [here](https://github.com/K1LL3R234/homebridge-sunsynk/issues/new?assignees=&labels=&projects=&template=feature_request.md&title=).

If you want to discuss things go [here](https://github.com/K1LL3R234/homebridge-sunsynk/discussions).