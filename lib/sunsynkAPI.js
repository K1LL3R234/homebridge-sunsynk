const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const axios = require('axios');

class sunsynkAPI {
    constructor(username, password, appKey, appSecret, log) {
        this.username = username;
        this.password = password;
        this.appKey = appKey;
        this.appSecret = appSecret;
        this.log = log;

        this.tokenInfo = {
            access_token: '',
            refresh_token: '',
            uuid: '',
            expires_in: 0
        }

        this.preURL = "https://api.sunsynk.net/";


        this.nonce = this.createUuid();
        this.body = '';
        this.md5 = '';

        this.signature = '';
        this.signatureHeaders = '';

        this.headers = {
            'content-type': 'application/json',
            'accept': 'application/json',
            'Content-MD5': this.md5,
            'X-Ca-Nonce': this.nonce,
            'X-Ca-Key': this.appKey,
            /*'X-Ca-Signature': this.signature,
            'X-Ca-Signature-Headers': this.signatureHeaders*/
        };
    }

    sign_stuff(method, url) {
        var textToSign = '';

        textToSign += method + "\n";
        textToSign += this.headers['accept'] + "\n";
        textToSign += this.md5 + "\n";
        textToSign += this.headers['content-type'] + "\n";
        textToSign += "\n";

        var headers = this.headersToSign();
        this.signatureHeaders = '';
        var sortedKeys = Array.from(headers.keys()).sort();
        for (var headerName of sortedKeys) {
            textToSign += headerName + ":" + headers.get(headerName) + "\n";
            this.signatureHeaders = this.signatureHeaders ? this.signatureHeaders + "," + headerName : headerName;
        }
        textToSign += this.urlToSign(url);

        var hash = CryptoJS.HmacSHA256(textToSign, this.appSecret);
        this.signature = hash.toString(CryptoJS.enc.Base64);

        this.headers['X-Ca-Signature'] = this.signature;
        this.headers['X-Ca-Signature-Headers'] = this.signatureHeaders;
    }

    async request(method, path, params = null, body = null) {
        try {
            await this.refreshAccessTokenIfNeed(path);
        } catch (e) {
            this.log.log.error(e + "\n");
            this.log.log.error("Could not refresh token!!\n");
        }

        /*this.md5 = this.calcMd5(params);

        this.headers['Content-MD5'] = this.md5;
        this.headers['Authorization'] = `Bearer ${this.tokenInfo.access_token}`;

        this.sign_stuff(method, path);*/
        var headers = {
            'Content-type': 'application/json',
            'Accept': 'application/json',
            "Authorization": `Bearer ${this.tokenInfo.access_token}`
        }

        let res = await axios({
            baseURL: this.preURL + "api/v1/",
            url: path,
            method: method,
            headers: headers,
            params: params,
            data: body
        });

        this.log.debug(`API response: ${JSON.stringify(res.data)} path = ${path}`);
        return res.data.data;
    }

    async get(path, params, body) {
        return this.request('GET', path, params, body);
    }

    async post(path, params, body) {
        return this.request('POST', path, params, body);
    }

    async login() {
        this.body = JSON.stringify({
            username: this.username,
            password: this.password,
            grant_type: 'password',
            client_id: 'openapi'
        });

        this.md5 = this.calcMd5(this.body);
        this.headers['Content-MD5'] = this.md5;

        this.sign_stuff("POST", "/oauth/token");

        let res = await axios({
            baseURL: this.preURL,
            url: "/oauth/token",
            method: "POST",
            headers: this.headers,
            data: this.body
        });


        let { access_token, refresh_token, expires_in } = res.data.data;

        this.tokenInfo = {
            access_token: access_token,
            refresh_token: refresh_token,
            expires_in: expires_in + new Date().getTime(),
        };

        this.log.debug(`API response: ${JSON.stringify(res.data)}`);
        return res.data.success;
        //return this.post("/oauth/token", this.headers, this.body);
    }

    async refreshAccessTokenIfNeed(path) {
        if (path.startsWith('/oauth/token')) {
            return;
        }

        if (this.tokenInfo.expires_in - 60 * 1000 > new Date().getTime()) {
            return;
        }
        this.tokenInfo.access_token = '';
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

    headersToSign() {
        var headers = new Map();
        for (var name in this.headers) {
            name = name.toLowerCase();
            if (!name.startsWith('x-ca-')) {
                continue;
            }
            if (name === "x-ca-signature" || name === "x-ca-signature-headers" || name == "x-ca-key" || name === 'x-ca-nonce' || name === 'x-ca-stage') {
                continue;
            }
            var value = this.headers[name];
            headers.set(name, value);
        }
        headers.set('x-ca-key', this.appKey);
        headers.set('x-ca-nonce', this.nonce);
        return headers;
    }

    urlToSign(url_send) {
        var params = new Map();
        var contentType = this.headers["content-type"];
        if (contentType && contentType.startsWith('application/x-www-form-urlencoded')) {
            const formParams = this.body.split("&");
            formParams.forEach((p) => {
                const ss = p.split('=');
                params.set(ss[0], ss[1]);
            })
        }

        const ss = url_send.split('?');
        if (ss.length > 1 && ss[1]) {
            const queryParams = ss[1].split('&');
            queryParams.forEach((p) => {
                const ss = p.split('=');
                params.set(ss[0], ss[1]);
            })
        }

        var sortedKeys = Array.from(params.keys())
        sortedKeys.sort();

        var first = true;
        var qs
        for (var k of sortedKeys) {
            var s = k + "=" + params.get(k);
            qs = qs ? qs + "&" + s : s;
            console.log("key=" + k + " value=" + params.get(k));
        }

        var url = ss[0];
        return qs ? url + "?" + qs : url;
    }
}

module.exports = sunsynkAPI;