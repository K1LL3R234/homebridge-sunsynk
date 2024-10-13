var Service;
var Characteristic;
var Accessory;
var crypto = require("crypto");
const CryptoJS = require('crypto-js');

const SunsynkAPI = require("./lib/sunsynkAPI");

const LogUtil = require('./util/logutil');

var plant_id = 0;
var pollInterval = 10;
var lowbatt = 20;

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-sunsynk", "Sunsynk", SunsynkAccessory);
    homebridge.registerPlatform("homebridge-sunsynk", "Sunsynk", SunsynkPlatform);
}

function SunsynkPlatform(log, config) {
    this.log = new LogUtil(config.options.debug, config.name, log);

    this.username = config.options.username;
    this.password = config.options.password;

    pollInterval = config.options.pollInterval * 60000;
    lowbatt = config.options.lowbatt;

    this.appKey = "204013305";
    this.appSecret = "zIQJeoPRXCjDV5anS5WIH7SQPAgdVaPm";

    //this.plant_id = 0;
}

SunsynkPlatform.prototype = {
    accessories: async function (callback) {

        let api;
        api = new SunsynkAPI(this.username, this.password, this.appKey, this.appSecret, this.log);

        this.SunsynkAPI = api;

        if (await api.login()) {

            api.body = {
                page: 1,
                limit: 20
            };
            var result = await api.get("/plants", api.body, null);
            plant_id = result.infos[0].id;
        }

        var allacc = [];

        var cur_pw = { "name": "Current PV Power W", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, cur_pw);
        allacc.push(acc);
        var today_pw = { "name": "Today PV Electricity kWh", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, today_pw);
        allacc.push(acc);
        var month_pw = { "name": "Month PV Electricity kWh", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, month_pw);
        allacc.push(acc);
        var year_pw = { "name": "Year PV Electricity kWh", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, year_pw);
        allacc.push(acc);
        var total_pw = { "name": "Total PV Electricity kWh", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, total_pw);
        allacc.push(acc);

        var batt_pw = { "name": "Battery Power W", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, batt_pw);
        allacc.push(acc);
        var batt_soc = { "name": "Battery SOC", "type": "batt" };
        var acc = new SunsynkAccessory(this.log, batt_soc);
        allacc.push(acc);

        var load_pw = { "name": "Load Power W", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, load_pw);
        allacc.push(acc);

        /*for (var i = 0; i < 9; i++) {
            var acc = new SunsynkAccessory(this.log, i);
            allacc.push(acc);
        }*/


        callback(allacc);
        platform = this;




        async function processData(data) {
            var real_result = await api.get(`/plant/${plant_id}/realtime`, null, null);

            var batt_result = await api.get(`/plant/energy/${plant_id}/flow`, null, null);

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