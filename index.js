const crypto = require("crypto");

const SunsynkAPI = require("./lib/sunsynkAPI");

const LogUtil = require('./util/logutil');

const { DEVICES: MATTER_DEVICES, MatterEnergyDevice, waitUntilRegistered } = require("./lib/matterEnergy");

const PLUGIN_NAME = "homebridge-sunsynk";
const PLATFORM_NAME = "Sunsynk";

// Sensor catalogue. "name" is used to derive the HomeKit UUID and the serial
// number, so changing a name recreates the accessory in HomeKit and breaks any
// automation that uses it. These strings must stay exactly as they are.
// "source" says which polled endpoint feeds the sensor.
const SENSORS = [
    { "id": "currentPvPower", "name": "Current PV Power W", "type": "pv", "source": "realtime" },
    { "id": "todayPvEnergy", "name": "Today PV Electricity kWh", "type": "pv", "source": "realtime" },
    { "id": "monthPvEnergy", "name": "Month PV Electricity kWh", "type": "pv", "source": "realtime" },
    { "id": "yearPvEnergy", "name": "Year PV Electricity kWh", "type": "pv", "source": "realtime" },
    { "id": "totalPvEnergy", "name": "Total PV Electricity kWh", "type": "pv", "source": "realtime" },
    { "id": "batteryPower", "name": "Battery Power W", "type": "pv", "source": "flow" },
    { "id": "batterySoc", "name": "Battery SOC", "type": "batt", "source": "flow" },
    { "id": "loadPower", "name": "Load Power W", "type": "pv", "source": "flow" },
    { "id": "gridPower", "name": "Grid Power", "type": "pow", "source": "grid" }
];

// Describe a failed API call for the log: the error message plus, when axios
// provides them, the error code and the request method and path, so an outage
// can be told apart from an authentication or endpoint problem. Request bodies
// are deliberately left out, because the login body carries the password.
function describeError(err) {
    if (!err) {
        return "unknown error";
    }

    var config = err.config || {};
    var request = [config.method ? String(config.method).toUpperCase() : "", config.url || ""].join(" ").trim();
    var details = [];

    if (err.code) {
        details.push(err.code);
    }
    if (request) {
        details.push(request);
    }

    var message = err.message || String(err);
    return details.length ? message + " (" + details.join(", ") + ")" : message;
}

module.exports = function (api) {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, SunsynkPlatform);
};

// A dynamic platform: Homebridge restores the accessories from its cache
// before this plugin does anything, so they stay in HomeKit with their rooms,
// names and automations even when the Sunsynk API is down at startup.
//
// Before 1.3.0 this was a static platform. Homebridge derived each accessory's
// UUID from "<platform>:<name>", and HomeKit keys its rooms and automations on
// that UUID plus the service and characteristic types, so the accessories here
// are created with exactly the same UUIDs, services and characteristics. That
// keeps an upgraded install's HomeKit setup intact.
class SunsynkPlatform {
    constructor(log, config, api) {
        this.hbLog = log;
        this.api = api;
        this.config = config || {};
        this.cached = new Map();
        this.cachedMatter = new Map();
        this.valid = false;

        if (!config || !config.options || !config.options.username || !config.options.password) {
            log.warn("[Sunsynk] Missing or incomplete configuration. Plugin will not start.");
            return;
        }

        this.valid = true;

        this.log = new LogUtil(config.options.debug, config.name, log);

        this.username = config.options.username;
        this.password = config.options.password;

        // A missing or invalid interval leaves setInterval with NaN, which fires
        // continuously and hammers the API. Fall back to the schema default.
        var minutes = Number(config.options.pollInterval);
        this.pollInterval = (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60000;
        // A missing or invalid threshold left lowbatt undefined, and
        // "soc < undefined" is always false, so the battery never reported low.
        var lowRaw = config.options.lowbatt;
        var lowPercent = lowRaw === undefined || lowRaw === null || lowRaw === "" ? NaN : Number(lowRaw);
        this.lowbatt = Number.isFinite(lowPercent) && lowPercent >= 0 && lowPercent <= 100 ? lowPercent : 20;

        // Only an explicit false disables a sensor, so an existing config without
        // this key keeps publishing every sensor.
        this.sensors = config.options.sensors || {};
        this.matterOptions = config.options.matter || {};

        this.appKey = "204013305";
        this.appSecret = "zIQJeoPRXCjDV5anS5WIH7SQPAgdVaPm";

        // Registration has to happen synchronously in this event: Homebridge
        // publishes the bridge straight after it, and anything registered later
        // is assigned new HomeKit IDs instead of reusing the cached ones.
        api.on("didFinishLaunching", () => {
            this.syncAccessories();
            this.matterReady = this.syncMatterAccessories();
            this.startPolling();
        });
    }

    // Called by Homebridge for every accessory in its cache, before
    // didFinishLaunching.
    configureAccessory(accessory) {
        this.cached.set(accessory.UUID, accessory);
    }

    // Called by Homebridge for every Matter accessory in its cache, before
    // didFinishLaunching. Registering the same UUID again attaches to it.
    configureMatterAccessory(accessory) {
        this.cachedMatter.set(accessory.UUID, accessory);
    }

    uuidFor(sensor) {
        // Matches the UUID Homebridge generated for the static platform, which
        // used the "platform" value from config.json as the prefix.
        return this.api.hap.uuid.generate(`${this.config.platform || PLATFORM_NAME}:${sensor.name}`);
    }

    syncAccessories() {
        var selected = this.sensors;
        var active = SENSORS.filter(function (sensor) {
            return selected[sensor.id] !== false;
        });

        var wanted = new Set();
        var added = [];
        this.accessories = [];

        for (var sensor of active) {
            var uuid = this.uuidFor(sensor);
            wanted.add(uuid);

            var accessory = this.cached.get(uuid);
            if (!accessory) {
                accessory = new this.api.platformAccessory(sensor.name, uuid);
                added.push(accessory);
            }
            accessory.context.sensorId = sensor.id;

            this.accessories.push(new SunsynkAccessory(this, accessory, sensor));
        }

        // Sensors unticked in the config, and anything left over in the cache
        // that this plugin no longer publishes, are removed from HomeKit.
        var removed = [];
        for (var [cachedUuid, cachedAccessory] of this.cached) {
            if (!wanted.has(cachedUuid)) {
                removed.push(cachedAccessory);
            }
        }

        if (added.length) {
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, added);
        }
        if (removed.length) {
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removed);
        }

        if (active.length === 0) {
            this.log.log("Every HomeKit sensor is disabled in the configuration.");
        } else {
            this.log.log("Publishing " + active.length + " of " + SENSORS.length + " sensors.");
        }
    }

    // Apple Home Energy (beta). Only on a bridge with Matter switched on, and
    // only for the devices left enabled under options.matter. Returns a
    // promise that settles once Homebridge has registered them, so the first
    // poll does not update a device that does not exist yet.
    syncMatterAccessories() {
        this.matterDevices = [];

        var matter = this.api.matter;
        var enabled = typeof this.api.isMatterEnabled === "function" && this.api.isMatterEnabled() && matter;

        if (!enabled) {
            var message = "Matter is not enabled on this bridge, so the Apple Home Energy devices are not published.";
            if (this.config.options.matter !== undefined) {
                this.log.log(message + " To use them, switch Matter on for this bridge in the Homebridge settings (Homebridge 2.4.0 or later).");
            } else {
                this.log.debug(message);
            }
            return Promise.resolve();
        }

        var options = this.matterOptions;
        for (var device of MATTER_DEVICES) {
            if (options[device.id] === false) {
                continue;
            }
            var asOutlet = options[device.id + "As"] === "outlet";
            this.matterDevices.push(new MatterEnergyDevice(this, device, asOutlet));
        }

        var wanted = new Set(this.matterDevices.map(function (device) { return device.UUID; }));
        var removed = [];
        for (var [uuid, cached] of this.cachedMatter) {
            if (!wanted.has(uuid)) {
                removed.push(cached);
            }
        }

        var accessories = this.matterDevices.map(function (device) { return device.accessory; });

        return (async () => {
            try {
                if (removed.length) {
                    await matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removed);
                }
                if (accessories.length) {
                    await matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories);
                    var ready = await waitUntilRegistered(matter, accessories.map(function (accessory) { return accessory.UUID; }), 30000);
                    if (!ready) {
                        this.log.warn("[Sunsynk] The Apple Home Energy devices took more than 30 seconds to register; the first readings may be missed.");
                    }
                }
                this.log.log("Publishing " + accessories.length + " of " + MATTER_DEVICES.length + " Apple Home Energy devices over Matter (beta)" +
                    (accessories.length ? ": " + this.matterDevices.map(function (device) { return device.device.name + (device.asOutlet ? " (outlet)" : ""); }).join(", ") : "") + ".");
            } catch (err) {
                this.log.error("[Sunsynk] Could not publish the Apple Home Energy devices:", describeError(err));
                this.matterDevices = [];
            }
        })();
    }

    startPolling() {
        // Everything that takes readings: the HomeKit sensors and the Matter
        // devices, each listing the endpoints it reads.
        this.consumers = this.accessories.concat(this.matterDevices);

        if (!this.valid || this.consumers.length === 0) {
            return;
        }

        // Only poll an endpoint when something still consumes it.
        var sources = new Set();
        for (var consumer of this.consumers) {
            for (var source of consumer.sources) {
                sources.add(source);
            }
        }
        this.sources = sources;
        // Everything but the plant endpoints is looked up by inverter.
        this.needInverter = ["grid", "load", "output", "input"].some(function (source) { return sources.has(source); });

        this.client = new SunsynkAPI(this.username, this.password, this.appKey, this.appSecret, this.log);

        // Discovery is retried on every poll until it succeeds, so the plugin
        // recovers on its own once the API comes back instead of needing a
        // restart.
        this.discovered = false;

        this.processData();

        setInterval(() => {
            this.processData();
        }, this.pollInterval);
    }

    async discover() {
        var api = this.client;

        try {
            await api.login();

            var result = await api.get("/plants", { page: 1, limit: 20 }, null);
            if (!result || !Array.isArray(result.infos) || result.infos.length === 0) {
                this.log.warn("[Sunsynk] No plants were returned by the API, retrying at the next poll.");
                return false;
            }

            var plant = this.choose("plant", result.infos, this.config.options.plantId, function (info) { return info.id; }, "Plant ID");
            if (!plant) {
                this.log.error("[Sunsynk] Fix the plant ID in the config and restart Homebridge.");
                this.stopped = true;
                return false;
            }
            this.plantId = plant.id;

            // The inverter serial number is only needed for the inverter
            // endpoints. Search every API state so a fault or offline
            // inverter does not make the child bridge crash during startup.
            if (this.needInverter) {
                var inverterStatuses = [1, 2, 3, 4, 0];
                var inverters = [];

                for (var statusIndex = 0; statusIndex < inverterStatuses.length; statusIndex++) {
                    var par = {
                        page: 1,               // current page number (required)
                        limit: 20,             // page size (required)
                        status: inverterStatuses[statusIndex],
                        plantId: this.plantId, // Plant ID (optional)
                        type: -1,              // 1: grid, 2: ess, -1: all (required)
                    };

                    var in_result = await api.get("/inverters", par, null);
                    if (in_result && Array.isArray(in_result.infos)) {
                        for (var info of in_result.infos) {
                            if (info && info.sn && !inverters.some(function (known) { return known.sn === info.sn; })) {
                                inverters.push(info);
                            }
                        }
                    }
                }

                // Every state answered and none of them held an inverter, so
                // this is the API's real answer rather than an outage. Stop
                // asking for grid data instead of retrying it forever.
                var inverter = inverters.length ? this.choose("inverter", inverters, this.config.options.inverterSn, function (info) { return info.sn; }, "Inverter Serial Number") : null;
                if (!inverter) {
                    var affected = this.inverterDependents();
                    if (!inverters.length) {
                        this.log.warn("[Sunsynk] No inverter was returned by the API; " + affected + " will be unavailable.");
                    } else {
                        this.log.error("[Sunsynk] " + affected + " will be unavailable until the inverter serial number in the config is fixed.");
                    }
                    this.needInverter = false;
                } else {
                    this.inverterSn = inverter.sn;
                }
            }

            return true;
        } catch (err) {
            this.log.warn("[Sunsynk] Setup failed, retrying at the next poll:", describeError(err));
            return false;
        }
    }

    // Name what stops working without an inverter, for the log.
    inverterDependents() {
        var names = [];
        if (this.accessories.some(function (accessory) { return accessory.sensor.source === "grid"; })) {
            names.push("Grid Power");
        }
        if (this.matterDevices.length) {
            names.push("the Apple Home Energy devices");
        }
        return names.join(" and ");
    }

    // Pick the plant or inverter to use. With an ID configured, use that one,
    // or log what the account has when it is not there. Without one, use the
    // first, and when there is more than one, list them so the right ID can
    // be copied into the config.
    choose(kind, infos, wanted, idOf, setting) {
        // Inverters are often named after their serial number, so only show a
        // name that adds something.
        var describe = function (info) {
            var id = idOf(info);
            var name = info.name || info.alias;
            return id + (name && String(name) !== String(id) ? " (" + name + ")" : "");
        };

        if (wanted !== undefined && wanted !== null && String(wanted).trim() !== "") {
            var match = infos.find(function (info) { return String(idOf(info)) === String(wanted).trim(); });
            if (match) {
                this.log.log("Using " + kind + " " + describe(match) + ".");
                return match;
            }

            this.log.error("[Sunsynk] The configured " + kind + " " + wanted + " was not found. This account has: " + infos.map(describe).join(", ") + ".");
            return null;
        }

        if (infos.length > 1) {
            this.log.log("Found " + infos.length + " " + kind + "s: " + infos.map(describe).join(", ") + ". Set \"" + setting + "\" in the config to choose one.");
        }

        this.log.log("Using " + kind + " " + describe(infos[0]) + ".");
        return infos[0];
    }

    async processData() {
        // A configured plant or inverter that the account does not have will
        // not appear by retrying, so stop until the config is fixed.
        if (this.stopped) {
            return;
        }

        if (!this.discovered) {
            this.discovered = await this.discover();

            if (!this.discovered) {
                return;
            }
        }

        await this.matterReady;

        // Each endpoint is fetched on its own, so one that fails only leaves
        // its own sensors stale for this poll instead of all of them.
        var plant = this.plantId;
        var sn = this.needInverter && this.inverterSn;
        var endpoints = {
            realtime: `/plant/${plant}/realtime`,
            flow: `/plant/energy/${plant}/flow`,
            grid: sn && `/inverter/grid/${sn}/realtime`,
            load: sn && `/inverter/load/${sn}/realtime`,
            output: sn && `/inverter/${sn}/realtime/output`,
            input: sn && `/inverter/${sn}/realtime/input`
        };

        for (var source of Object.keys(endpoints)) {
            if (!this.sources.has(source) || !endpoints[source]) {
                continue;
            }

            try {
                var data = await this.client.get(endpoints[source], null, null);

                for (var consumer of this.consumers) {
                    if (consumer.sources.includes(source)) {
                        await consumer.update(data, source);
                    }
                }
            } catch (err) {
                this.log.warn('[Sunsynk] Polling failed:', describeError(err));
            }
        }
    }
}

// One sensor, backed by a Homebridge platform accessory. The services and
// characteristics are the ones the static platform created, in the same
// shape, so HomeKit keeps recognising them.
class SunsynkAccessory {
    constructor(platform, accessory, sensor) {
        var Service = platform.api.hap.Service;
        var Characteristic = platform.api.hap.Characteristic;

        this.platform = platform;
        this.accessory = accessory;
        this.sensor = sensor;
        this.sources = [sensor.source];
        this.Characteristic = Characteristic;

        var shasum = crypto.createHash('sha1');
        shasum.update(sensor.name);
        this.sn = shasum.digest('base64');
        platform.log.log('Computed SN: ' + this.sn);

        accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, sensor.name)
            .setCharacteristic(Characteristic.Manufacturer, "Sunsynk")
            .setCharacteristic(Characteristic.Model, "Sunsynk")
            .setCharacteristic(Characteristic.SerialNumber, this.sn);

        switch (sensor.type) {
            case "pv":
                this.service = accessory.getService(Service.LightSensor) || accessory.addService(Service.LightSensor);
                break;

            case "pow":
                this.service = accessory.getService(Service.Outlet) || accessory.addService(Service.Outlet);

                // Grid Power shows the grid relay state, which HomeKit cannot
                // change. Accept the tap, then put the switch back.
                var on = this.service.getCharacteristic(Characteristic.On);
                on.onSet(function () {
                    var current = on.value;
                    platform.log.debug(`Button pressed, keeping state unchanged: ${current}`);
                    // setImmediate runs after HAP has stored the tapped value.
                    setImmediate(function () {
                        on.updateValue(current);
                    });
                });
                break;

            case "batt":
                this.service = accessory.getService(Service.HumiditySensor) || accessory.addService(Service.HumiditySensor);
                this.battery = accessory.getService(Service.Battery) || accessory.addService(Service.Battery);
                break;
        }
    }

    update(data) {
        if (!data) {
            return;
        }

        var Characteristic = this.Characteristic;
        var log = this.platform.log;

        switch (this.sensor.id) {
            case "currentPvPower":
                this.setLight(data.pac);
                break;

            case "todayPvEnergy":
                this.setLight(data.etoday);
                break;

            case "monthPvEnergy":
                this.setLight(data.emonth);
                break;

            case "yearPvEnergy":
                this.setLight(data.eyear);
                break;

            case "totalPvEnergy":
                this.setLight(data.etotal);
                break;

            case "batteryPower":
                // The API reports charging as negative power, which the
                // light sensor would clamp to its 0.0001 minimum. Direction
                // is already shown by the Battery SOC charging state.
                log.debug("Raw battPower:" + data.battPower);
                this.setLight(Math.abs(Number(data.battPower)) || 0);
                break;

            case "loadPower":
                this.setLight(data.loadOrEpsPower);
                break;

            case "batterySoc":
                var soc = Number(data.soc);
                if (data.soc === undefined || data.soc === null || !Number.isFinite(soc)) {
                    log.debug("No value for " + this.sensor.name + ", keeping the last one.");
                    break;
                }

                var state = Characteristic.ChargingState.NOT_CHARGING;

                if (data.toBat) {
                    state = Characteristic.ChargingState.CHARGING;
                }

                this.battery.getCharacteristic(Characteristic.BatteryLevel).updateValue(soc);
                this.battery.getCharacteristic(Characteristic.ChargingState).updateValue(state);
                this.battery.getCharacteristic(Characteristic.StatusLowBattery).updateValue(soc < this.platform.lowbatt ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
                this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(soc);
                log.debug("New Value:" + soc);
                break;

            case "gridPower":
                if (data.acRealyStatus === undefined || data.acRealyStatus === null) {
                    log.debug("No value for " + this.sensor.name + ", keeping the last one.");
                    break;
                }
                this.service.getCharacteristic(Characteristic.On).updateValue(data.acRealyStatus);
                log.debug("New Status:" + data.acRealyStatus);
                break;
        }
    }

    setLight(value) {
        // A field missing from the response would reach HomeKit as undefined,
        // which HAP rejects with a warning. Keep the last value instead.
        value = Number(value);
        if (!Number.isFinite(value)) {
            this.platform.log.debug("No value for " + this.sensor.name + ", keeping the last one.");
            return;
        }

        if (value < 0.0001) {
            value = 0.0001;
        }

        this.service.getCharacteristic(this.Characteristic.CurrentAmbientLightLevel).updateValue(value);
        this.platform.log.debug("New Value:" + value);
    }
}
