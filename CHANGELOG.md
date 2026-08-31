# Change log

This change log documents all release versions of homebridge-sunsynk

### Unreleased

- **FIX** - An inverter in an offline, warning, fault, or upgrading state no longer crashes the child bridge during startup. The plugin now validates plant and inverter API responses, searches across inverter states when Grid Power is enabled, and skips the inverter lookup when Grid Power is disabled. ([#21](https://github.com/K1LL3R234/homebridge-sunsynk/issues/21))

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
