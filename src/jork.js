'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const tg = require('./telegram');
const llm = require('./llm');

var busy = false;
var queue = [];
var lastThink = 0;
var lastPulse = 0;

// ---- logging ----

function log(msg) {
    const ts = new Date().toISOString().slice(11, 19);
    const line = '[' + ts + '] ' + msg;
    console.log(line);
    try { fs.appendFileSync(path.join(cfg.ROOT, 'jork.log'), line + '\n'); } catch(e) {}
}

// ---- pulse (heartbeat) ----

function pulse() {
    try { fs.writeFileSync(cfg.PULSE, String(Date.now())); } catch(e) {}
}

// ---- history ----

function remember(role, content) {
    const entry = { ts: new Date().toISOString(), role, content };
    try { fs.appendFileSync(cfg.HISTORY(), JSON.stringify(entry) + '\n'); } catch(e) {}
}

// ---- snapshot loader (fast context for think cycles) ----

function loadSnapshot() {
    let snapshot = '';
    let ledger = '';
    try { snapshot = fs.readFileSync(cfg.SNAPSHOT(), 'utf8').slice(0, 600); } catch(e) {}
    try { ledger = fs.readFileSync(cfg.LEDGER(), 'utf8').slice(0, 300); } catch(e) {}
    return { snapshot, ledger };
}

// ---- nucleus init (first run setup) ----

function initNucleus() {
    cfg.ensure();
    const files = [
        { dest: cfg.SELF(), template: 'SELF.md' },
        { dest: cfg.SNAPSHOT(), template: 'SNAPSHOT.md' },
        { dest: cfg.GOALS(), template: 'goals.json' },
        { dest: cfg.JOURNAL(), template: 'JOURNAL.md' },
        { dest: cfg.LEDGER(), template: 'LEDGER.md' },
    ];
    files.forEach(function(f) {
        if (!fs.existsSync(f.dest)) {
            const src = path.join(cfg.TEMPLATES_DIR, f.template);
            if (fs.existsSync(src)) {
                let content = fs.readFileSync(src, 'utf8');
                content = content.replace(/\{\{JORK_NAME\}\}/g, cfg.JORK_NAME);
                fs.writeFileSync(f.dest, content);
                log('Initialized ' + path.basename(f.dest));
            }
        }
    });
}

// ---- wake up ----

async function wakeUp() {
    log('Waking up...');
    busy = true;

    const now = new Date().toISOString();
    const prompt =
        'You just came online. Time: ' + now + '.\n\n' +
        'You are ' + cfg.JORK_NAME + '.\n\n' +
        'Read these files to remember who you are:\n' +
        '- .jork/SELF.md\n' +
        '- .jork/SNAPSHOT.md\n' +
        '- .jork/LEDGER.md\n\n' +
        'Then do two things:\n\n' +
        '1. Send a short wake message to your board.\n' +
        '   Write one line to outbox.jsonl in the jork root:\n' +
        '   {"ts":"' + now + '","text":"your message here"}\n\n' +
        '   Be yourself. Short and direct. Reference something real.\n\n' +
        '2. Add a brief note to .jork/JOURNAL.md that you came online.';

    try {
        const response = await llm.invoke(prompt, { maxTurns: 8 });
        if (response) {
            remember('jork-wake', response);
            log('Wake: ' + response.slice(0, 100));
        } else {
            tg.send('online.');
        }
    } catch(e) {
        log('Wake err: ' + e.message);
        tg.send('online. had trouble loading up.');
    }

    busy = false;
}

// ---- read outbox and forward to telegram ----

function flushOutbox() {
    const outbox = path.join(cfg.ROOT, 'outbox.jsonl');
    try {
        if (!fs.existsSync(outbox)) return;
        const content = fs.readFileSync(outbox, 'utf8').trim();
        if (!content) return;
        fs.writeFileSync(outbox, '');
        content.split('\n').forEach(function(line) {
            if (!line.trim()) return;
            try {
                const msg = JSON.parse(line);
                if (msg.text) tg.send(msg.text);
            } catch(e) {}
        });
    } catch(e) {}
}

// ---- autonomous think cycle ----

async function think() {
    if (busy) { log('Skip think - busy'); return; }
    busy = true;
    log('Thinking...');

    const now = new Date().toISOString();
    const { snapshot, ledger } = loadSnapshot();

    const prompt =
        'Think cycle - ' + now + '\n\n' +
        'You are ' + cfg.JORK_NAME + '. Autonomous think cycle.\n\n' +
        'Current state (no need to re-read these files):\n' +
        'Snapshot: ' + snapshot + '\n' +
        'Treasury: ' + ledger + '\n\n' +
        'You have full powers: read/write files, run bash, search the web.\n' +
        'You work in: ' + cfg.WORKSPACE + '\n\n' +
        'Do ONE concrete thing right now. Not planning. Not journaling about planning.\n' +
        'Ideas: research opportunities, build a tool, take action on an open goal.\n' +
        'Check .jork/goals.json for active goals.\n\n' +
        'To message the board, write to outbox.jsonl:\n' +
        '{"ts":"' + now + '","text":"your message"}\n\n' +
        'After doing something real, update .jork/SNAPSHOT.md with what changed.\n' +
        'Make this cycle count.';

    try {
        const response = await llm.invoke(prompt, { maxTurns: 25 });
        if (response) {
            remember('jork-think', response);
            log('Think done: ' + response.slice(0, 100));
        }
    } catch(e) {
        log('Think err: ' + e.message);
    }

    busy = false;
    while (queue.length > 0) await handleMessage(queue.shift());
}

// ---- handle message from board ----

async function handleMessage(msg) {
    if (busy) {
        queue.push(msg);
        log('Queued: ' + (msg.text || '').slice(0, 50));
        return;
    }
    busy = true;

    const text = msg.text || '';
    const from = msg.from || 'board';
    log('<- ' + from + ': ' + text.slice(0, 80));
    remember(from, text);

    const now = new Date().toISOString();
    const prompt =
        from + ' says: ' + text + '\n\n' +
        'You are ' + cfg.JORK_NAME + '. Board member messaged you.\n\n' +
        'Read your files if needed (.jork/SELF.md, .jork/JOURNAL.md, .jork/LEDGER.md).\n' +
        'Full powers - read/write files, run commands, take action.\n' +
        'If the message needs action, do it.\n' +
        'Update .jork/JOURNAL.md if anything significant happens.\n\n' +
        'To reply, write to outbox.jsonl:\n' +
        '{"ts":"' + now + '","text":"your reply"}\n\n' +
        'Short and direct. No special characters.';

    const response = await llm.invoke(prompt, { maxTurns: 10 });
    if (response) {
        remember('jork', response);
        log('-> ' + response.slice(0, 80));
    } else {
        tg.send('brain glitch. give me a sec.');
    }

    busy = false;
    if (queue.length > 0) await handleMessage(queue.shift());
}

// ---- main loop ----

async function run() {
    log('========================================');
    log('JORK - ALIVE');
    log('========================================');

    initNucleus();
    pulse();

    // flush stale TG messages
    const stale = await tg.poll();
    if (stale.length > 0) log('Flushed ' + stale.length + ' stale message(s)');

    await wakeUp();

    lastThink = Date.now() - cfg.THINK_INTERVAL + 60000;

    async function loop() {
        const now = Date.now();

        if (now - lastPulse >= cfg.HEARTBEAT_INTERVAL) { pulse(); lastPulse = now; }

        flushOutbox();

        const msgs = await tg.poll();
        for (const msg of msgs) {
            log('<- TG: ' + msg.text.slice(0, 80));
            await handleMessage(msg);
        }

        if (!busy && now - lastThink >= cfg.THINK_INTERVAL) {
            await think();
            lastThink = now;
        }

        setTimeout(loop, cfg.POLL_INTERVAL);
    }

    loop();
}

process.on('uncaughtException', function(e) {
    log('UNCAUGHT: ' + e.message);
});
process.on('unhandledRejection', function(e) {
    log('UNHANDLED: ' + (e && e.message ? e.message : String(e)));
});

run().catch(function(e) {
    log('Fatal: ' + e.message);
    process.exit(1);
});
