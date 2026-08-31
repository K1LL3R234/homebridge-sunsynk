var Service;
var Characteristic;
var Accessory;
var crypto = require("crypto");
const CryptoJS = require('crypto-js');
const qs = require('querystring');


const SunsynkAPI = require("./lib/sunsynkAPI");

const LogUtil = require('./util/logutil');

var plant_id = 0;
var plant_sn;
var pollInterval = 10;
var lowbatt = 20;

var handler_change = false;

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-sunsynk", "Sunsynk", SunsynkAccessory);
    homebridge.registerPlatform("homebridge-sunsynk", "Sunsynk", SunsynkPlatform);
}

function SunsynkPlatform(log, config) {
    this.valid = false;

    if (!config || !config.options || !config.options.username || !config.options.password) {
        log.warn("[Sunsynk] Missing or incomplete configuration. Plugin will not start.");
        return;
    }

    this.valid = true;

    this.log = new LogUtil(config.options.debug, config.name, log);

    this.username = config.options.username;
    this.password = config.options.password;

    // Validate username and password
    if (!this.username || !this.password) {
        this.log.error("Username or password is missing in the configuration. Please check your config file.");
        return;
    }

    pollInterval = config.options.pollInterval * 60000;
    lowbatt = config.options.lowbatt;

    // Only an explicit false disables a sensor, so an existing config without
    // this key keeps publishing every sensor.
    this.sensors = config.options.sensors || {};

    this.appKey = "204013305";
    this.appSecret = "zIQJeoPRXCjDV5anS5WIH7SQPAgdVaPm";

    //this.plant_id = 0;
}

SunsynkPlatform.prototype = {
    accessories: async function (callback) {

        if (!this.valid) {
            this.log?.warn("[Sunsynk] Skipping accessory registration due to invalid configuration.");
            callback([]);
            return;
        }

        // Sensor catalogue. "name" is used by Homebridge to derive the HomeKit
        // UUID and by SunsynkAccessory to derive the serial number, so changing
        // a name recreates the accessory in HomeKit and breaks any automation
        // that uses it. These strings must stay exactly as they are.
        // "source" says which polled endpoint feeds the sensor.
        var sensors = [
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

        var selected = this.sensors;
        var active = sensors.filter(function (sensor) {
            return selected[sensor.id] !== false;
        });

        if (active.length === 0) {
            this.log.log("Every sensor is disabled in the configuration, nothing to publish.");
            callback([]);
            return;
        }

        this.log.log("Publishing " + active.length + " of " + sensors.length + " sensors.");

        // Only poll an endpoint when something still consumes it.
        var needRealtime = active.some(function (sensor) { return sensor.source === "realtime"; });
        var needFlow = active.some(function (sensor) { return sensor.source === "flow"; });
        var needGrid = active.some(function (sensor) { return sensor.source === "grid"; });

        let api;
        api = new SunsynkAPI(this.username, this.password, this.appKey, this.appSecret, this.log);

        this.SunsynkAPI = api;

        if (await api.login()) {

            api.body = {
                page: 1,
                limit: 20
            };
            var result = await api.get("/plants", api.body, null);
            if (!result || !Array.isArray(result.infos) || result.infos.length === 0) {
                this.log.warn("[Sunsynk] No plants were returned by the API.");
                callback([]);
                return;
            }

            plant_id = result.infos[0].id;

            // The inverter serial number is only needed for the grid endpoint.
            // Search every API state so a fault or offline inverter does not
            // make the child bridge crash during startup.
            if (needGrid) {
                var inverterStatuses = [1, 2, 3, 4, 0];
                var inverter;

                for (var statusIndex = 0; statusIndex < inverterStatuses.length; statusIndex++) {
                    var par = {
                        page: 1,               // current page number (required)
                        limit: 1,              // page size (required)
                        status: inverterStatuses[statusIndex],
                        plantId: plant_id,     // Plant ID (optional)
                        type: -1,              // 1: grid, 2: ess, -1: all (required)
                    };

                    var in_result = await api.get("/inverters", par, null);
                    if (in_result && Array.isArray(in_result.infos) && in_result.infos.length > 0) {
                        inverter = in_result.infos[0];
                        break;
                    }
                }

                if (!inverter || !inverter.sn) {
                    this.log.warn("[Sunsynk] No inverter was returned by the API; Grid Power will be unavailable.");
                    needGrid = false;
                } else {
                    plant_sn = inverter.sn;
                }
            }
        }

        var allacc = [];

        for (var i = 0; i < active.length; i++) {
            allacc.push(new SunsynkAccessory(this.log, active[i]));
        }

        callback(allacc);
        platform = this;




        async function processData(data) {
            try {
                var real_result = needRealtime ? await api.get(`/plant/${plant_id}/realtime`, null, null) : null;

                var batt_result = needFlow ? await api.get(`/plant/energy/${plant_id}/flow`, null, null) : null;

                var realAC_result = needGrid ? await api.get(`/inverter/grid/${plant_sn}/realtime`, null, null) : null;

                for (var i = 0; i < allacc.length; i++) {
                    if (allacc[i].type == 'pv') {
                        switch (allacc[i].name) {
                            case 'Current PV Power W':
                                allacc[i].changeHandler(real_result.pac);
                                break;

                            case 'Today PV Electricity kWh':
                                allacc[i].changeHandler(real_result.etoday);
                                break;

                            case 'Month PV Electricity kWh':
                                allacc[i].changeHandler(real_result.emonth);
                                break;

                            case 'Year PV Electricity kWh':
                                allacc[i].changeHandler(real_result.eyear);
                                break;

                            case 'Total PV Electricity kWh':
                                allacc[i].changeHandler(real_result.etotal);
                                break;

                            case 'Battery Power W':
                                allacc[i].changeHandler(batt_result.battPower);
                                break;

                            case 'Load Power W':
                                allacc[i].changeHandler(batt_result.loadOrEpsPower);
                                break;
                        }
                    }
                    else if (allacc[i].type == 'batt') {
                        allacc[i].changeHandler1(batt_result.soc);

                        var state = Characteristic.ChargingState.NOT_CHARGING;

                        if (batt_result.toBat) {
                            state = Characteristic.ChargingState.CHARGING;
                        }
                        else if (batt_result.batTo) {
                            state = Characteristic.ChargingState.NOT_CHARGING;
                        }

                        allacc[i].changeChargeState(state);

                        allacc[i].changeLevel(batt_result.soc < lowbatt ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)

                        allacc[i].changeHandler(batt_result.soc);

                    }
                    else if (allacc[i].type == 'pow') {
                        switch (allacc[i].name) {
                            case 'Grid Power':
                                if (realAC_result) {
                                    handler_change = true;
                                    allacc[i].changeHandler(realAC_result.acRealyStatus);
                                }
                                break;
                        }
                    }
                }
            } catch (err) {
                platform.log.warn('[Sunsynk] Polling failed:', err.message);
            }
        }

        processData();

        let timer = setInterval(function () {
            processData();
        }, pollInterval);
    }
}

function SunsynkAccessory(log, config) {
    this.log = log;

    this.name = config["name"];
    this.type = config["type"];

    var shasum = crypto.createHash('sha1');
    shasum.update(this.name);

    this.sn = shasum.digest('base64');
    log.log('Computed SN: ' + this.sn);
}

SunsynkAccessory.prototype = {
    getServices: function () {
        const me = this;

        var service, newService, changeAction, changeAction1, changeState, changeLevel;

        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, "Sunsynk")
            .setCharacteristic(Characteristic.Model, "Sunsynk"/*+ (this.accessoryType === ""?"":"") */)
            .setCharacteristic(Characteristic.SerialNumber, this.sn);

        switch (this.type) {
            case "pv":
                service = new Service.LightSensor();
                changeAction = function (newvalue) {
                    service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                        .setValue(newvalue);
                    service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                        .updateValue(newvalue);
                }

                this.changeHandler = function (value) {
                    if (value < 0.0001) {
                        value = 0.0001
                    }

                    changeAction(value);
                    platform.log.debug("New Value:" + value);
                }.bind(this);

                return [informationService, service];

            case "pow":
                service = new Service.Outlet();

                changeAction = function (value) {
                    service.getCharacteristic(Characteristic.On)
                        .setValue(value);
                    service.getCharacteristic(Characteristic.On)
                        .updateValue(value);
                }

                this.changeHandler = function (value) {
                    changeAction(value);
                    platform.log.debug("New Status:" + value);
                }.bind(this);

                service.getCharacteristic(Characteristic.On)
                    .on('set', function (value, callback) {
                        // Get the current state of the characteristic
                        const currentState = service.getCharacteristic(Characteristic.On).value;

                        if (handler_change) {
                            handler_change = false;
                            // Allow state change if triggered by handler
                            platform.log.debug("State changed via handler: " + value);
                            callback(null);
                        }
                        else {
                            handler_change = false;
                            // Prevent state change by resetting to the current state
                            platform.log.debug(`Button pressed, keeping state unchanged: ${currentState}`);
                            callback(null); // Acknowledge the action without error
                            process.nextTick(() => {
                                service.getCharacteristic(Characteristic.On).updateValue(currentState);
                            });
                        }
                    });

                return [informationService, service, newService];

            case "batt":
                service = new Service.HumiditySensor();

                changeAction = function (value) {
                    service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                        .setValue(value);
                    service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                        .updateValue(value);
                }


                newService = new Service.Battery();
                changeAction1 = function (newvalue) {
                    newService.getCharacteristic(Characteristic.BatteryLevel)
                        .setValue(newvalue);
                    newService.getCharacteristic(Characteristic.BatteryLevel)
                        .updateValue(newvalue);
                }

                changeLevel = function (newlevel) {
                    newService.getCharacteristic(Characteristic.StatusLowBattery)
                        .setValue(newlevel);
                    newService.getCharacteristic(Characteristic.StatusLowBattery)
                        .updateValue(newlevel);
                }

                changeState = function (newvalue) {
                    newService.getCharacteristic(Characteristic.ChargingState)
                        .setValue(newvalue);
                    newService.getCharacteristic(Characteristic.ChargingState)
                        .updateValue(newvalue);
                }

                this.changeHandler = function (value) {
                    changeAction(value);
                    platform.log.debug("New Value:" + value);
                }.bind(this);

                this.changeHandler1 = function (value) {
                    changeAction1(value);
                    platform.log.debug("New Value:" + value);
                }.bind(this);

                this.changeChargeState = function (value) {
                    changeState(value);
                    platform.log.debug("New State:" + value);
                }.bind(this);

                this.changeLevel = function (value) {
                    changeLevel(value)
                    platform.log.debug("New Level:" + value);
                }.bind(this);

                return [informationService, service, newService];
        }
    }
}
