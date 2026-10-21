// Apple Home Energy (beta): the grid meter, the house load and the PV output
// as Matter electrical devices, which the Home app shows under its Energy filter.
//
// Matter units: power in milliwatts (signed, + consumed, - produced), energy
// in milliwatt hours. The Sunsynk API reports watts and kilowatt hours, and
// some of its totals arrive as strings.
//
// The Matter shapes were tested against iOS 27 (see the README):
// - The grid is an ElectricalSensor that also declares the ElectricalMeter
//   device type (0x0514). Apple takes an ElectricalMeter as the whole home
//   meter for "All Home", and keeping the ElectricalSensor base type lets
//   Homebridge restore it from its cache. This relies on observed Apple
//   behaviour, not on anything documented.
// - Load and PV are ElectricalSensors by default, which list in the "All
//   Home" sheet but have no room tile. As an "outlet" they get a tile with
//   live watts, and a switch that stays on.

const ELECTRICAL_METER = 0x0514;
const ELECTRICAL_SENSOR = 0x0510;

// "id" seeds the Matter UUID, so changing it recreates the device in Home.
const DEVICES = [
    { "id": "grid", "name": "Sunsynk Grid", "sources": ["grid"] },
    { "id": "load", "name": "Sunsynk Load", "sources": ["load"] },
    { "id": "pv", "name": "Sunsynk Solar", "sources": ["output", "input"] }
];

function number(value) {
    if (value === undefined || value === null || value === "") {
        return NaN;
    }
    return Number(value);
}

function milliwatts(watts) {
    return Math.round(watts * 1000);
}

function energy(kilowattHours) {
    return { energy: Math.round(kilowattHours * 1e6) };
}

class MatterEnergyDevice {
    constructor(platform, device, asOutlet) {
        var matter = platform.api.matter;

        this.platform = platform;
        this.matter = matter;
        this.device = device;
        this.sources = device.sources;
        this.asOutlet = asOutlet;
        // An outlet gets its own UUID, and so its own Matter endpoint. Reusing
        // the sensor's endpoint with a different device type left the Home
        // app showing neither.
        this.UUID = matter.uuid.generate(`${platform.config.platform || "Sunsynk"}:matter:${device.id}${asOutlet ? ":outlet" : ""}`);

        var clusters = {
            electricalPowerMeasurement: { activePower: null },
            electricalEnergyMeasurement: device.id === "load"
                ? { cumulativeEnergyImported: null }
                : { cumulativeEnergyImported: null, cumulativeEnergyExported: null }
        };

        if (device.id === "grid") {
            clusters.descriptor = {
                deviceTypeList: [
                    { deviceType: ELECTRICAL_METER, revision: 1 },
                    { deviceType: ELECTRICAL_SENSOR, revision: 1 }
                ]
            };
        }

        var handlers;
        if (asOutlet) {
            clusters.onOff = { onOff: true };

            // There is nothing to switch, so a tap is accepted and the outlet
            // turned back on, like the HomeKit Grid Power outlet. Refusing the
            // command instead makes Homebridge log an error with a stack
            // trace on every tap. The delay lets the off state commit first.
            var uuid = this.UUID;
            var keepOn = async function () {
                platform.log.debug(device.name + " was switched off in the Home app; turning it back on.");
                setTimeout(function () {
                    Promise.resolve(matter.updateAccessoryState(uuid, "onOff", { onOff: true })).catch(function (err) {
                        platform.log.warn("[Sunsynk] Could not turn " + device.name + " back on: " + (err && err.message ? err.message : err));
                    });
                }, 500);
            };
            handlers = { onOff: { off: keepOn, toggle: keepOn } };
        }

        this.accessory = {
            UUID: this.UUID,
            displayName: device.name,
            deviceType: asOutlet ? matter.deviceTypes.OnOffOutlet : matter.deviceTypes.ElectricalSensor,
            serialNumber: "SUNSYNK-" + device.id.toUpperCase(),
            manufacturer: "Sunsynk",
            model: "Sunsynk",
            context: { deviceId: device.id },
            clusters: clusters
        };
        if (handlers) {
            this.accessory.handlers = handlers;
        }
    }

    async update(data, source) {
        if (!data) {
            return;
        }

        var power;
        var energyState = {};

        switch (this.device.id) {
            case "grid":
                // pac is signed: positive while importing, negative while
                // exporting, which is what Matter expects of a meter.
                power = number(data.pac);
                var imported = number(data.etotalFrom);
                var exported = number(data.etotalTo);
                if (Number.isFinite(imported)) {
                    energyState.cumulativeEnergyImported = energy(imported);
                }
                if (Number.isFinite(exported)) {
                    energyState.cumulativeEnergyExported = energy(exported);
                }
                break;

            case "load":
                power = number(data.totalPower);
                var used = number(data.totalUsed);
                if (Number.isFinite(used)) {
                    energyState.cumulativeEnergyImported = energy(used);
                }
                break;

            case "pv":
                // AC output for power, so that load = PV + grid balances; the
                // DC input is higher by the inverter's losses. The lifetime
                // total comes from the input endpoint, the inverter's own
                // counter.
                if (source === "output") {
                    power = number(data.pac);
                    if (Number.isFinite(power)) {
                        // At night pac dips to about -20 W, the inverter's
                        // own standby draw. Show that as no output rather
                        // than as solar using power.
                        power = Math.max(power, 0);
                        if (!this.asOutlet && power > 0) {
                            // A generator reports negative power in Matter.
                            power = -power;
                        }
                    }
                } else {
                    var produced = number(data.etotal);
                    if (Number.isFinite(produced)) {
                        energyState.cumulativeEnergyImported = energy(0);
                        energyState.cumulativeEnergyExported = energy(produced);
                    }
                }
                break;
        }

        try {
            if (Number.isFinite(power)) {
                await this.matter.updateAccessoryState(this.UUID, "electricalPowerMeasurement", { activePower: milliwatts(power) });
            }
            if (Object.keys(energyState).length) {
                await this.matter.updateAccessoryState(this.UUID, "electricalEnergyMeasurement", energyState);
            }
            this.platform.log.debug(this.device.name + ": " + (Number.isFinite(power) ? power + " W " : "") + JSON.stringify(energyState));
        } catch (err) {
            this.platform.log.warn("[Sunsynk] Could not update " + this.device.name + ": " + (err && err.message ? err.message : err));
        }
    }
}

// registerPlatformAccessories() resolves once the registration is sent, not
// once the endpoints exist, and on a child bridge a state update that arrives
// before then is dropped. Wait until every device answers a state read.
async function waitUntilRegistered(matter, uuids, timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    var pending = uuids.slice();

    while (pending.length) {
        var states = await Promise.all(pending.map(function (uuid) {
            return Promise.resolve(matter.getAccessoryState(uuid, "electricalPowerMeasurement")).catch(function () { return undefined; });
        }));
        pending = pending.filter(function (uuid, index) { return states[index] === undefined; });

        if (!pending.length || Date.now() > deadline) {
            break;
        }
        await new Promise(function (resolve) { setTimeout(resolve, 250); });
    }

    return pending.length === 0;
}

module.exports = { DEVICES, MatterEnergyDevice, waitUntilRegistered };
