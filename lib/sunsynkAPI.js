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
    }

    async request(method, path, params = null) {

        // Refresh token if expiring in next 60 seconds
        if (Date.now() > this.tokenInfo.expires_in - 60_000) {
            this.log.log('[Sunsynk] Access token expired, re-authenticating...');
            await this.login();
        }

        const res = await axios({
            baseURL: 'https://api.sunsynk.net/api/v1/',
            url: path,
            method,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.apiToken}`
            },
            params
        });

        return res.data.data;
    }



    async get(path, params, body) {
        return this.request('GET', path, params, body);
    }

    async post(path, params, body) {
        return this.request('POST', path, params, body);
    }

    async login() {
        const requestBody = {
            username: this.username,
            password: this.password,
            grant_type: 'password',
            client_id: 'openapi'
        };

        const jsonBody = JSON.stringify(requestBody);

        // 1️⃣ Content-MD5 (EXACT match)
        const md5 = CryptoJS.MD5(jsonBody).toString(CryptoJS.enc.Base64);

        // 2️⃣ Nonce
        const nonce = crypto.randomUUID();

        // 3️⃣ Headers
        const headers = {
            accept: 'application/json',
            'content-type': 'application/json',
            'Content-MD5': md5,
            'X-Ca-Key': this.appKey,
            'X-Ca-Nonce': nonce
        };

        // 4️⃣ Build textToSign
        let textToSign = 'POST\n';
        textToSign += headers.accept + '\n';
        textToSign += md5 + '\n';
        textToSign += headers['content-type'] + '\n';
        textToSign += '\n';

        // 5️⃣ Canonicalize x-ca-* headers
        const headersToSign = {};
        Object.keys(headers).forEach(h => {
            const name = h.toLowerCase();
            if (name.startsWith('x-ca-')) {
                headersToSign[name] = headers[h];
            }
        });

        const sortedKeys = Object.keys(headersToSign).sort();
        const signatureHeaders = sortedKeys.join(',');

        sortedKeys.forEach(k => {
            textToSign += `${k}:${headersToSign[k]}\n`;
        });

        // 6️⃣ Append path
        textToSign += '/oauth/token';

        // 7️⃣ Sign
        const hash = CryptoJS.HmacSHA256(textToSign, this.appSecret);
        const signature = CryptoJS.enc.Base64.stringify(hash);

        // 8️⃣ Final headers
        headers['X-Ca-Signature'] = signature;
        headers['X-Ca-Signature-Headers'] = signatureHeaders;

        // 9️⃣ Request
        const res = await axios({
            method: 'POST',
            url: 'https://openapi.sunsynk.net/oauth/token',
            headers,
            data: jsonBody
        });

        const { access_token, refresh_token, expires_in } = res.data.data;

        this.tokenInfo = {
            access_token,
            refresh_token,
            expires_in: Date.now() + expires_in * 1000
        };

        this.apiToken = access_token;   // 🔥 THIS WAS MISSING

        return true;
    }
}

module.exports = sunsynkAPI;