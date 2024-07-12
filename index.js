const request = require('request-promise');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const LogUtil = require('./util/logutil');


let Service, Characteristic;

module.exports = (homebridge) => {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-sunsynk', 'Sunsynk', Sunsynk, true);
};

class Sunsynk {
    constructor(log, config, api) {
        this.log = new LogUtil(
            config.options.debug,
        );


        this.config = config;
        if (!config || !config.options) {
            this.log.log('The config configuration is incorrect, disabling plugin.')
            return;
        }


        this.name = config.options.name;
        this.appKey = config.options.appKey;
        this.appSecret = config.options.appSecret;
        this.username = config.options.username;
        this.password = config.options.password;

        this.service = new Service.Switch(this.name);

        this.service
            .getCharacteristic(Characteristic.On)
            .on('set', this.handleOnSet.bind(this));

        this.token = null;
    }

    async handleOnSet(value, callback) {
        try {
            const token = await this.getToken();
            this.log('Token:', token);
            // Handle your logic after getting the token
        } catch (error) {
            this.log('Error:', error.message);
        }
        callback(null);
    }

    async getToken() {
        const nonce = this.createUuid();
        const requestBody = JSON.stringify({
            username: this.username,
            password: this.password,
            grant_type: 'password',
            client_id: 'openapi'
        });

        const md5 = this.calcMd5(requestBody);
        const headers = {
            'content-type': 'application/json',
            'accept': 'application/json',
            'Content-MD5': md5,
            'X-Ca-Nonce': nonce,
            'X-Ca-Key': this.appKey,
        };

        const textToSign = this.buildTextToSign(headers, requestBody, '/oauth/token');
        const signature = this.sign(textToSign, this.appSecret);
        headers['X-Ca-Signature'] = signature;
        headers['X-Ca-Signature-Headers'] = Object.keys(headers).join(',');

        const options = {
            method: 'POST',
            uri: 'http://openapi.inteless.com/oauth/token',
            headers: headers,
            body: requestBody
        };

        return await request(options).then(response => {
            const data = JSON.parse(response);
            return data.access_token; // Adjust according to the actual response structure
        });
    }

    calcMd5(data) {
        return crypto.createHash('md5').update(data).digest('base64');
    }

    createUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    buildTextToSign(headers, data, url) {
        let textToSign = 'POST\n';
        textToSign += headers['accept'] + '\n';
        textToSign += headers['Content-MD5'] + '\n';
        textToSign += headers['content-type'] + '\n';
        textToSign += '\n';
        textToSign += Object.keys(headers)
            .filter(key => key.startsWith('x-ca-'))
            .sort()
            .map(key => `${key}:${headers[key]}`)
            .join('\n') + '\n';
        textToSign += url;
        return textToSign;
    }

    sign(text, secret) {
        return crypto.createHmac('sha256', secret).update(text).digest('base64');
    }

    getServices() {
        return [this.service];
    }
}
