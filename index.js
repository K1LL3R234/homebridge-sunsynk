var Service;
var Characteristic;
var Accessory;
var crypto = require("crypto");
const CryptoJS = require('crypto-js');

const SunsynkAPI = require("./lib/sunsynkAPI");

const LogUtil = require('./util/logutil');

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

    this.appKey = "204013305";
    this.appSecret = "zIQJeoPRXCjDV5anS5WIH7SQPAgdVaPm";

    this.plant_id=0;
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
            this.plant_id=result.infos[0].id;
        }

        var allacc = [];

        for (var i = 0; i < 3; i++) {
            var acc = new SunsynkAccessory(this.log, i);
            allacc.push(acc);
        }


        callback(allacc);
        platform = this;

        function processData(data) {

        }
    }
}

function SunsynkAccessory(log, config) {
    this.log = log;

    this.name = "test" + config;

    var shasum = crypto.createHash('sha1');
    //shasum.update(this.zone_number/* || this.area_number*/);

    this.sn = shasum.digest('base64');
    log.log('Computed SN: ' + this.sn);
}

SunsynkAccessory.prototype = {
    getServices: function () {
        const me = this;

        var service, changeAction;

        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, "Sunsynk")
            .setCharacteristic(Characteristic.Model, "Sunsynk"/*+ (this.accessoryType === ""?"":"") */)
            .setCharacteristic(Characteristic.SerialNumber, this.sn);

        service = new Service.LightSensor();
        changeAction = function (newvalue) {
            service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .setValue(newvalue);
        }

        this.changeHandler = function (value) {
            var newValue = value;

            changeAction(newValue);
            platform.log.debug("New Value:" + newValue);
        }.bind(this);

        return [informationService, service];
    }
}