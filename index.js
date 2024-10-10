var Service;
var Characteristic;
var Accessory;
var crypto = require("crypto");
const CryptoJS = require('crypto-js');

const SunsynkAPI = require("./lib/sunsynkAPI");

const LogUtil = require('./util/logutil');
const sunsynkAPI = require("./lib/sunsynkAPI");

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

        var cur_pw = { "name": "Current Power W", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, cur_pw);
        allacc.push(acc);
        var today_pw = { "name": "Today Electricity kWh", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, today_pw);
        allacc.push(acc);
        var month_pw = { "name": "Month Electricity kWh", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, month_pw);
        allacc.push(acc);
        var year_pw = { "name": "Year Electricity kWh", "type": "pv" };
        var acc = new SunsynkAccessory(this.log, year_pw);
        allacc.push(acc);
        var total_pw = { "name": "Total Electricity kWh", "type": "pv" };
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

            for (var i = 0; i < 8; i++) {
                if (allacc[i].type == 'pv') {
                    switch (allacc[i].name) {
                        case 'Current Power W':
                            allacc[i].changeHandler(real_result.pac);
                            break;

                        case 'Today Electricity kWh':
                            allacc[i].changeHandler(real_result.etoday);
                            break;

                        case 'Month Electricity kWh':
                            allacc[i].changeHandler(real_result.emonth);
                            break;

                        case 'Year Electricity kWh':
                            allacc[i].changeHandler(real_result.eyear);
                            break;

                        case 'Total Electricity kWh':
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
                    allacc[i].changeHandler(batt_result.soc);

                    var state = Characteristic.ChargingState.NOT_CHARGING;

                    if (batt_result.toBat) {
                        state = Characteristic.ChargingState.CHARGING;
                    }
                    else if (batt_result.batTo) {
                        state = Characteristic.ChargingState.NOT_CHARGING;
                    }

                    allacc[i].changeChargeState(state);

                    allacc[i].changeLevel(batt_result.soc < lowbatt ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
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
    //shasum.update(this.zone_number/* || this.area_number*/);

    this.sn = shasum.digest('base64');
    log.log('Computed SN: ' + this.sn);
}

SunsynkAccessory.prototype = {
    getServices: function () {
        const me = this;

        var service, changeAction, changeState, changeLevel;

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
                }
                break;

            case "batt":
                service = new Service.Battery();
                changeAction = function (newvalue) {
                    service.getCharacteristic(Characteristic.BatteryLevel)
                        .setValue(newvalue);
                }

                changeLevel = function (newlevel) {
                    service.getCharacteristic(Characteristic.StatusLowBattery)
                        .setValue(newlevel);
                }

                changeState = function (newvalue) {
                    service.getCharacteristic(Characteristic.ChargingState)
                        .setValue(newvalue);
                }
                break;
        }

        this.changeHandler = function (value) {
            var newValue = value;

            changeAction(newValue);
            platform.log.debug("New Value:" + newValue);
        }.bind(this);

        this.changeChargeState = function (value) {
            var state = value;

            changeState(state);
            platform.log.debug("New State:" + state);
        }.bind(this);

        this.changeLevel = function (value) {
            var level = value;
            changeLevel(level)
            platform.log.debug("New Level:" + level);
        }.bind(this);

        return [informationService, service];
    }
}