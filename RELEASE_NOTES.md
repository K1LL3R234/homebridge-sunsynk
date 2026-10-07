# homebridge-sunsynk 1.2.0

This release makes the plugin much harder to knock over, closes a security gap in the Sunsynk login, and lets you choose which sensors are published. It rolls up 1.2.0-beta.1 to 1.2.0-beta.4. The full list of changes is in [CHANGELOG.md](CHANGELOG.md).

## Upgrading from 1.1.5

No configuration changes are needed. Existing setups keep publishing all nine sensors, and accessories keep their rooms, names and automations in HomeKit.

One thing behaves differently: **Battery Power W** now shows a wattage while the battery is charging, where it previously sat at 0.0001. It shows the size of the flow in both directions, so use the charging state on **Battery SOC** to tell charging from discharging. Automations that depended on the old 0.0001 reading during charging should be checked.

## Security

- The login request now verifies Sunsynk's TLS certificate. Verification had been switched off for the request that sends your username and password. ([#23](https://github.com/K1LL3R234/homebridge-sunsynk/pull/23))
- Axios is now at least 1.20.0, which resolves three high-severity advisories, and the unused `string` and `debug` dependencies have been removed. ([#23](https://github.com/K1LL3R234/homebridge-sunsynk/pull/23))

## New

- Each sensor can be switched on or off from the Homebridge UI, or with an optional `sensors` block in the config. See the README for the sensor names.
- The plugin no longer polls an API endpoint that none of your enabled sensors use.

## Reliability

- A failed poll no longer stops the plugin. The error is logged and polling carries on at the next interval. ([#20](https://github.com/K1LL3R234/homebridge-sunsynk/issues/20))
- An inverter that is offline, in a warning or fault state, or upgrading no longer crashes the child bridge at startup. ([#21](https://github.com/K1LL3R234/homebridge-sunsynk/issues/21))
- A Sunsynk outage while Homebridge starts no longer leaves the plugin idle until the next restart. Setup is retried on every poll until it succeeds.
- A missing or invalid poll interval now falls back to 10 minutes, and a missing or invalid low battery threshold falls back to 20%.

## Fixes

- Battery Power W shows the real wattage while charging, as described under Upgrading.

## Logging

- Errors are always logged, not only when debug logging is on. ([#24](https://github.com/K1LL3R234/homebridge-sunsynk/pull/24))
- All output goes through the Homebridge logger, so it appears in the Homebridge UI log with the usual timestamp and plugin name. ([#24](https://github.com/K1LL3R234/homebridge-sunsynk/pull/24))
- Setup and polling warnings say which request failed and how, so a Sunsynk outage can be told apart from a login problem. Passwords are never logged. ([#24](https://github.com/K1LL3R234/homebridge-sunsynk/pull/24))

## Thanks

Thanks to [@atdr](https://github.com/atdr) for the security and logging fixes in #23 and #24.
