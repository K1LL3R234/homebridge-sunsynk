# Change log

This change log documents all release versions of homebridge-sunsynk

### 1.2.0-beta.3 (2026-10-06)

- **SECURITY** - The login request to Sunsynk now verifies the server's TLS certificate. Verification had been switched off for that one request, which is the request that sends the account username and password, so anyone able to intercept the connection could have presented a forged certificate and read them. Sunsynk's certificate is valid and verifies normally, so nothing changes for working setups. ([#23](https://github.com/K1LL3R234/homebridge-sunsynk/pull/23))
- **SECURITY** - Raised the minimum Axios version to `^1.20.0`, which resolves three high-severity advisories affecting versions up to 1.17, and removed the unused `string` and `debug` dependencies, both of which carry advisories of their own. ([#23](https://github.com/K1LL3R234/homebridge-sunsynk/pull/23))
- **FIX** - Errors are now always logged. They were previously only shown when "Enable Debug Logging" was switched on, so a configuration or API error could fail silently. ([#24](https://github.com/K1LL3R234/homebridge-sunsynk/pull/24))
- **FIX** - Warnings, errors and debug output now go through the Homebridge logger instead of straight to the console, so they carry Homebridge's timestamp and plugin name and appear in the Homebridge UI log like every other line. ([#24](https://github.com/K1LL3R234/homebridge-sunsynk/pull/24))
- **FIX** - "Setup failed" and "Polling failed" warnings now say which request failed and how, for example `Request failed with status code 502 (ERR_BAD_RESPONSE, GET /plant/123/realtime)`, so a Sunsynk outage can be told apart from a login or endpoint problem. Request bodies are never logged, because the login request carries the password. ([#24](https://github.com/K1LL3R234/homebridge-sunsynk/pull/24))
- **FIX** - A missing or invalid "Low Battery in %" value no longer stops the low battery warning from ever triggering. It now falls back to the 20% default. ([#24](https://github.com/K1LL3R234/homebridge-sunsynk/pull/24))

### 1.2.0-beta.2 (2026-08-31)

- **FIX** - An inverter in an offline, warning, fault, or upgrading state no longer crashes the child bridge during startup. The plugin now validates plant and inverter API responses, searches across inverter states when Grid Power is enabled, and skips the inverter lookup when Grid Power is disabled. ([#21](https://github.com/K1LL3R234/homebridge-sunsynk/issues/21))
- **FIX** - A Sunsynk API outage while Homebridge starts no longer leaves the plugin sitting idle until the next restart. The sensors are now published before the API is contacted, so they keep their rooms, names and automations in HomeKit, and the plant and inverter lookup is wrapped in error handling and retried on every poll until it succeeds.
- **FIX** - A missing or invalid `pollInterval` reached `setInterval` as `NaN`, which fires continuously instead of on the interval. It now falls back to the 10 minute default.

### 1.2.0-beta.1 (2026-08-27)

- **FIX** - A failed poll no longer stops the plugin. The polling error handler called `platform.log.warn()`, which `LogUtil` did not have, so any hiccup from the Sunsynk API threw `TypeError: platform.log.warn is not a function` inside the `catch` and became an unhandled rejection. `LogUtil` now has a `warn` method, and it always prints rather than only in debug mode. The failure is logged and polling resumes at the next interval. ([#20](https://github.com/K1LL3R234/homebridge-sunsynk/issues/20))
- **FEATURE** - Sensors can now be switched on and off individually from the Homebridge UI or an optional `sensors` block in the config. Existing configurations are unaffected and keep publishing all nine sensors.
- **FEATURE** - The plugin no longer polls an API endpoint when none of the sensors that use it are enabled.
- **DOCS** - Corrected the sensor list in the README, which still described eight sensors and left out Grid Power.

### 1.1.5 (2026-01-13)

- **FIX** - API call update and authentication

### 1.1.5-beta.*

- **ATTEMPTS** - Trying to fix the API call

### 1.1.4 (2025-10-14)

- **FIX** - Dependencies update

### 1.1.3 (2025-07-28)

- **NEWS** - We are verified!!

### 1.1.2 (2025-07-25)

- **FIX** - Fixed the problem with no config for Verification

### 1.1.1 (2025-03-11)

- **FEATURE** - Added Grid Monitoring as an outlet.
- **FIX** - Changed the version of a dependency for security

### 1.1.0-beta.1 (2025-01-06)

- **FEATURE** - Added Grid Monitoring as an outlet.

### 1.0.7 (2025-01-06)
                
- **BUG** - Fixed issue to check if username and password is saved and valid.

### 1.0.6 (2024-11-06)
                
- **BUG** - Fixed string version in package

### 1.0.5 (2024-11-06)
                
- **BUG** - Fixed node for verification

### 1.0.4 (2024-10-13)
                
- **BUG** - Fixed SN for each device to be diffrent.

### 1.0.4-beta.2 (2024-10-11)
                
- **BUG** - Fixed problem with 0 pv bringing up an error.
          - Fixed problem with states not updating.

### 1.0.4-beta.1 (2024-10-11)

- **FEATURE** - Moved the SOC and charging under humidity sensor to be used for automations.
                Still figuring out that is why it moved to beta.
              
### 1.0.3 (2024-10-11)

- **FEATURE** - Moved the SOC and charging under the Battery Power W.
              - And cleaned up some code.

### 1.0.2 (2024-10-11)

- **BUG** - Fixed Not displaying something right.

### 1.0.1 (2024-10-11)

- **BUG** - Fixed bug for token being removed and can not continue requests.

### 1.0.0 (2024-10-11)

- **FEATURE** - Released.

### 1.0.0-beta.1 (2024-10-10)

- **FEATURE** - Initial release.
