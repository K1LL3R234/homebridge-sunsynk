[![npm](https://badgen.net/npm/v/homebridge-sunsynk/latest)](https://www.npmjs.com/package/homebridge-sunsynk)
[![npm](https://badgen.net/npm/v/homebridge-sunsynk)](https://www.npmjs.com/package/homebridge-sunsynk)
[![npm](https://badgen.net/npm/dt/homebridge-sunsynk)](https://www.npmjs.com/package/homebridge-sunsynk)
[![GitHub last commit](https://badgen.net/github/last-commit/K1LL3R234/homebridge-sunsynk)](https://github.com/K1LL3R234/homebridge-sunsynk)
# homebridge-sunsynk
 Sunsynk Inveter plugin

A plugin for [Homebridge](https://github.com/nfarina/homebridge) that connects to your Sunsynk Inverter with Homekit. The plugin provides eight key sensors:  Current Power Production (in Watts), Today's Yield (in kWh), This Month's Yield (in kWh), This Year's Yield (in kWh), the Total Yield (in kWh), Battery Power (in W), Battery SOC (in %) and Load Power (in W). With these sensors, you can effortlessly create automations in your Apple Home based on your solar panel yield, power usage and battery status for a Sunsynk inverter and the e-linter API. homebridge-sunsynk was originated by [Chris Posthumus](https://github.com/k1ll3r234).


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

## Future features

I will add more things as it is requested or when I find need for it.

Please add feature recomendations [here](https://github.com/K1LL3R234/homebridge-sunsynk/issues/new?assignees=&labels=&projects=&template=feature_request.md&title=).

If you want to discuss things go [here](https://github.com/K1LL3R234/homebridge-sunsynk/discussions).