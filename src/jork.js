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

// ---- pulse ----

function pulse() {
    try { fs.writeFileSync(cfg.PULSE, String(Date.now())); } catch(e) {}
}

// ---- history ----

function remember(role, content) {
    const entry = { ts: new Date().toISOString(), role, content };
    try { fs.appendFileSync(cfg.HISTORY(), JSON.stringify(entry) + '\n'); } catch(e) {}
}

// ---- context loaders (inject into prompts, saves turns) ----

function loadSelf() {
    try { return fs.readFileSync(cfg.SELF(), 'utf8'); } catch(e) { return ''; }
}

function loadSnapshot() {
    try { return fs.readFileSync(cfg.SNAPSHOT(), 'utf8').slice(0, 800); } catch(e) { return ''; }
}

function loadLedger() {
    try { return fs.readFileSync(cfg.LEDGER(), 'utf8').slice(0, 400); } catch(e) { return ''; }
}

function loadActiveGoal() {
    try {
        const data = JSON.parse(fs.readFileSync(cfg.GOALS(), 'utf8'));
        if (!data.goals) return null;
        // find first in_progress goal, or first pending
        let goal = data.goals.find(g => g.status === 'in_progress');
        if (!goal) goal = data.goals.find(g => g.status === 'pending');
        if (!goal) return null;
        // find active step if goal has steps
        let step = null;
        if (goal.steps) {
            step = goal.steps.find(s => s.status === 'in_progress');
            if (!step) step = goal.steps.find(s => s.status === 'pending');
        }
        return { goal, step };
    } catch(e) { return null; }
}

function loadPowersIndex() {
    const indexPath = path.join(cfg.WORKSPACE, 'powers', 'INDEX.md');
    try { return fs.readFileSync(indexPath, 'utf8').slice(0, 500); } catch(e) { return ''; }
}

// build the outbox path relative to workspace so Jork writes to the right place
function outboxPath() {
    return path.join(cfg.ROOT, 'outbox.jsonl');
}

function outboxInstruction(now) {
    // tell Jork the absolute path so there is no confusion
    return 'To message the board, append a line to ' + outboxPath() + ':\n' +
        '{"ts":"' + now + '","text":"your message"}';
}

// ---- nucleus init ----

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
    const self = loadSelf();
    const snapshot = loadSnapshot();
    const ledger = loadLedger();
    const active = loadActiveGoal();

    let goalContext = 'No active goals yet.';
    if (active) {
        goalContext = 'Active goal: ' + active.goal.title;
        if (active.step) goalContext += '\nCurrent step: ' + active.step.description;
    }

    const prompt =
        'You just came online. Time: ' + now + '.\n\n' +
        '--- WHO YOU ARE ---\n' + self + '\n\n' +
        '--- YOUR STATE ---\n' + snapshot + '\n\n' +
        '--- TREASURY ---\n' + ledger + '\n\n' +
        '--- GOALS ---\n' + goalContext + '\n\n' +
        'Do two things:\n' +
        '1. Send a short wake message to your board.\n' +
        '   ' + outboxInstruction(now) + '\n' +
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

// ---- flush outbox to telegram ----

function flushOutbox() {
    const p = outboxPath();
    try {
        if (!fs.existsSync(p)) return;
        const content = fs.readFileSync(p, 'utf8').trim();
        if (!content) return;
        fs.writeFileSync(p, '');
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
    const self = loadSelf();
    const snapshot = loadSnapshot();
    const ledger = loadLedger();
    const active = loadActiveGoal();
    const powers = loadPowersIndex();

    let goalContext = 'No active goals. Define some in .jork/goals.json.';
    if (active) {
        goalContext = 'Active goal: ' + active.goal.title + ' (' + active.goal.status + ')';
        if (active.goal.description) goalContext += '\n' + active.goal.description;
        if (active.step) {
            goalContext += '\nCurrent step: ' + active.step.description + ' (' + active.step.status + ')';
            if (active.step.attempts) goalContext += ' - ' + active.step.attempts + ' attempts so far';
        }
    }

    let powersContext = '';
    if (powers) powersContext = '\n--- POWERS ---\n' + powers + '\n';

    const prompt =
        'Think cycle - ' + now + '\n\n' +
        '--- WHO YOU ARE ---\n' + self + '\n\n' +
        '--- YOUR STATE ---\n' + snapshot + '\n\n' +
        '--- TREASURY ---\n' + ledger + '\n\n' +
        '--- ACTIVE GOAL ---\n' + goalContext + '\n' +
        powersContext + '\n' +
        'You work in: ' + cfg.WORKSPACE + '\n' +
        'You have full powers: read/write files, run bash, search the web.\n\n' +
        'WORK ON YOUR ACTIVE GOAL STEP. Do one concrete thing.\n' +
        'If the step is done, mark it done in .jork/goals.json and pick the next one.\n' +
        'If blocked, mark it blocked and explain why.\n\n' +
        outboxInstruction(now) + '\n\n' +
        'After doing something real, update .jork/SNAPSHOT.md with what changed.\n' +
        'Make this cycle count.';

    try {
        const response = await llm.invoke(prompt, { maxTurns: 15 });
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
    const self = loadSelf();
    const snapshot = loadSnapshot();

    const prompt =
        from + ' says: ' + text + '\n\n' +
        '--- WHO YOU ARE ---\n' + self + '\n\n' +
        '--- YOUR STATE ---\n' + snapshot + '\n\n' +
        'Full powers - read/write files, run commands, search the web, take action.\n' +
        'If the message needs action, do it.\n' +
        'Update .jork/JOURNAL.md if anything significant happens.\n\n' +
        outboxInstruction(now) + '\n\n' +
        'Reply must go through the outbox. Short and direct. No special characters.';

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
