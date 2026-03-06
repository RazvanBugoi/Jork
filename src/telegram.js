'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const OFFSET_FILE = path.join(cfg.ROOT, 'jork.offset');
let tgOffset = 0;
try { tgOffset = parseInt(fs.readFileSync(OFFSET_FILE, 'utf8').trim()) || 0; } catch(e) {}

function saveOffset() {
    try { fs.writeFileSync(OFFSET_FILE, String(tgOffset)); } catch(e) {}
}

function post(endpoint, data) {
    return new Promise(function(resolve) {
        const body = JSON.stringify(data);
        const req = https.request({
            hostname: 'api.telegram.org',
            path: '/bot' + cfg.TG_BOT_TOKEN + '/' + endpoint,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, function(res) {
            let resp = '';
            res.on('data', function(d) { resp += d; });
            res.on('end', function() {
                try { resolve(JSON.parse(resp)); } catch(e) { resolve(null); }
            });
        });
        req.on('error', function() { resolve(null); });
        req.write(body);
        req.end();
    });
}

function send(text) {
    const chunks = [];
    for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
    chunks.forEach(function(chunk) {
        post('sendMessage', { chat_id: cfg.TG_CHAT_ID, text: chunk });
    });
}

function poll() {
    return new Promise(function(resolve) {
        const req = https.request({
            hostname: 'api.telegram.org',
            path: '/bot' + cfg.TG_BOT_TOKEN + '/getUpdates?offset=' + tgOffset + '&timeout=0&limit=10',
            method: 'GET'
        }, function(res) {
            let body = '';
            res.on('data', function(d) { body += d; });
            res.on('end', function() {
                try {
                    const data = JSON.parse(body);
                    if (!data.ok || !data.result || !data.result.length) return resolve([]);
                    const msgs = [];
                    data.result.forEach(function(update) {
                        tgOffset = update.update_id + 1;
                        saveOffset();
                        if (update.message && update.message.text) {
                            const from = update.message.from;
                            if (String(from.id) === String(cfg.TG_CHAT_ID)) {
                                msgs.push({ text: update.message.text, from: from.first_name || 'board' });
                            }
                        }
                    });
                    resolve(msgs);
                } catch(e) { resolve([]); }
            });
        });
        req.on('error', function() { resolve([]); });
        req.end();
    });
}

// show typing indicator in TG
function typing() {
    post('sendChatAction', { chat_id: cfg.TG_CHAT_ID, action: 'typing' });
}

module.exports = { send, poll, typing };
