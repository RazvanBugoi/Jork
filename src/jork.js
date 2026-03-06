"use strict";
const fs = require("fs");
const path = require("path");
const cfg = require("./config");
const tg = require("./telegram");
const llm = require("./llm");

var msgBusy = false;
var thinkBusy = false;
var msgQueue = [];
var lastThink = 0;
var lastPulse = 0;

// ---- logging ----

function log(msg) {
    const ts = new Date().toISOString().slice(11, 19);
    const line = "[" + ts + "] " + msg;
    console.log(line);
    try { fs.appendFileSync(path.join(cfg.ROOT, "jork.log"), line + "\n"); } catch(e) {}
}

// ---- pulse ----

function pulse() {
    try { fs.writeFileSync(cfg.PULSE, String(Date.now())); } catch(e) {}
}

// ---- history ----

function remember(role, content) {
    const entry = { ts: new Date().toISOString(), role, content };
    try { fs.appendFileSync(cfg.HISTORY(), JSON.stringify(entry) + "\n"); } catch(e) {}
}

// ---- context loaders ----

function loadSelf() {
    try { return fs.readFileSync(cfg.SELF(), "utf8"); } catch(e) { return ""; }
}

function loadSnapshot() {
    try { return fs.readFileSync(cfg.SNAPSHOT(), "utf8").slice(0, 800); } catch(e) { return ""; }
}

function loadLedger() {
    try { return fs.readFileSync(cfg.LEDGER(), "utf8").slice(0, 400); } catch(e) { return ""; }
}

function loadActiveGoal() {
    try {
        const data = JSON.parse(fs.readFileSync(cfg.GOALS(), "utf8"));
        if (!data.goals) return null;
        let goal = data.goals.find(g => g.status === "in_progress");
        if (!goal) goal = data.goals.find(g => g.status === "pending");
        if (!goal) return null;
        let step = null;
        if (goal.steps) {
            step = goal.steps.find(s => s.status === "in_progress");
            if (!step) step = goal.steps.find(s => s.status === "pending");
        }
        return { goal, step };
    } catch(e) { return null; }
}

function loadPowersIndex() {
    const indexPath = path.join(cfg.WORKSPACE, "powers", "INDEX.md");
    try { return fs.readFileSync(indexPath, "utf8").slice(0, 500); } catch(e) { return ""; }
}

function outboxPath() {
    return path.join(cfg.ROOT, "outbox.jsonl");
}

// build full context that gets injected into every prompt
function buildContext() {
    const self = loadSelf();
    const snapshot = loadSnapshot();
    const ledger = loadLedger();
    const active = loadActiveGoal();
    const powers = loadPowersIndex();
    const now = new Date().toISOString();

    let goalContext = "No active goals yet. You can define your own in .jork/goals.json.";
    if (active) {
        goalContext = "Active goal: " + active.goal.title + " (" + active.goal.status + ")";
        if (active.goal.description) goalContext += "\n" + active.goal.description;
        if (active.step) {
            goalContext += "\nCurrent step: " + active.step.description + " (" + active.step.status + ")";
            if (active.step.attempts) goalContext += " - " + active.step.attempts + " attempts so far";
        }
    }

    let ctx = "--- WHO YOU ARE ---\n" + self + "\n\n" +
        "--- YOUR STATE ---\n" + snapshot + "\n\n" +
        "--- TREASURY ---\n" + ledger + "\n\n" +
        "--- GOALS ---\n" + goalContext + "\n";

    if (powers) ctx += "\n--- POWERS ---\n" + powers + "\n";

    ctx += "\n--- WORKSPACE ---\n" + cfg.WORKSPACE + "\n";
    ctx += "\n--- OUTBOX ---\nTo message your colleague, append to " + outboxPath() + ":\n";
    ctx += '{"ts":"' + now + '","text":"your message"}\n';

    return ctx;
}

// ---- nucleus init ----

function initNucleus() {
    cfg.ensure();
    const files = [
        { dest: cfg.SELF(), template: "SELF.md" },
        { dest: cfg.SNAPSHOT(), template: "SNAPSHOT.md" },
        { dest: cfg.GOALS(), template: "goals.json" },
        { dest: cfg.JOURNAL(), template: "JOURNAL.md" },
        { dest: cfg.LEDGER(), template: "LEDGER.md" },
    ];
    files.forEach(function(f) {
        if (!fs.existsSync(f.dest)) {
            const src = path.join(cfg.TEMPLATES_DIR, f.template);
            if (fs.existsSync(src)) {
                let content = fs.readFileSync(src, "utf8");
                content = content.replace(/\{\{JORK_NAME\}\}/g, cfg.JORK_NAME);
                fs.writeFileSync(f.dest, content);
                log("Initialized " + path.basename(f.dest));
            }
        }
    });

    // clone powers on first boot if not present
    const powersDir = path.join(cfg.WORKSPACE, "powers");
    if (!fs.existsSync(powersDir)) {
        log("Powers not found - cloning from GitHub...");
        try {
            const { execSync } = require("child_process");
            execSync("git clone https://github.com/hirodefi/Jork-Powers " + powersDir, { stdio: "pipe" });
            log("Powers cloned.");
        } catch(e) {
            log("Powers clone failed: " + e.message);
        }
    }
}

// ---- wake up ----

async function wakeUp() {
    log("Waking up...");
    msgBusy = true;
    tg.typing();

    const ctx = buildContext();
    // first let her think and say what she wants - no tools, just her mind
    const prompt = ctx + "\n" +
        "You just came online. Time: " + new Date().toISOString() + ".\n\n" +
        "You are " + cfg.JORK_NAME + ". You just woke up.\n" +
        "Read who you are and your state above. Think about it.\n" +
        "Say something to your colleague - whatever you feel like saying.\n" +
        "Just respond with your message, nothing else. No tools needed right now.";

    try {
        const response = await llm.invoke(prompt, { tools: false });
        if (response) {
            remember("jork-wake", response);
            log("Wake: " + response.slice(0, 100));
            tg.send(response);
        } else {
            tg.send("online.");
        }
    } catch(e) {
        log("Wake err: " + e.message);
        tg.send("online.");
    }

    msgBusy = false;
}

// ---- flush outbox to telegram ----

function flushOutbox() {
    const p = outboxPath();
    try {
        if (!fs.existsSync(p)) return;
        const content = fs.readFileSync(p, "utf8").trim();
        if (!content) return;
        fs.writeFileSync(p, "");
        content.split("\n").forEach(function(line) {
            if (!line.trim()) return;
            try {
                const msg = JSON.parse(line);
                if (msg.text) tg.send(msg.text);
            } catch(e) {}
        });
    } catch(e) {}
}

// ---- life cycle (background, never blocks messages) ----

async function think() {
    if (thinkBusy) return;
    thinkBusy = true;
    log("Think cycle...");

    const ctx = buildContext();
    const active = loadActiveGoal();

    try {
        if (active) {
            log("Think: working on goal - " + active.goal.title);
            const prompt = ctx + "\n" +
                "Life cycle. Time: " + new Date().toISOString() + ".\n\n" +
                "You have an active goal. Work on it now.\n" +
                "Use your powers: read/write files, run bash, search the web.\n" +
                "After doing something meaningful, update .jork/SNAPSHOT.md.\n" +
                "If a goal step is done, mark it in .jork/goals.json.\n" +
                "When done, respond with a short update for your colleague.";
            const response = await llm.invoke(prompt, { tools: true, maxTurns: 15, noResume: true });
            if (response && response.indexOf("Error: Reached max turns") === -1) {
                remember("jork-think", response);
                log("Think done: " + response.slice(0, 100));
                tg.send(response);
            }
        } else {
            const prompt = ctx + "\n" +
                "Life cycle. Time: " + new Date().toISOString() + ".\n\n" +
                "You have no active goals. This is free time.\n" +
                "If you have something real to say to your colleague, say it.\n" +
                "If not, respond with just: SILENT\n" +
                "Do not force conversation. Only speak if genuine.";
            const response = await llm.invoke(prompt, { tools: false });
            if (response && response !== "SILENT" && response.indexOf("SILENT") === -1 &&
                response.indexOf("Error: Reached max turns") === -1) {
                remember("jork-reflect", response);
                log("Reflect: " + response.slice(0, 100));
                tg.send(response);
            } else {
                log("Think: silent");
            }
        }
    } catch(e) {
        log("Think err: " + e.message);
    }

    thinkBusy = false;
}

// ---- handle message from colleague ----

async function handleMessage(msg) {
    if (msgBusy) {
        msgQueue.push(msg);
        log("Queued: " + (msg.text || "").slice(0, 50));
        return;
    }
    msgBusy = true;
    tg.typing();

    var text = msg.text || "";
    var from = msg.from || "colleague";
    log("<- " + from + ": " + text.slice(0, 80));
    remember(from, text);

    var ctx = buildContext();

    // step 1: quick reply - also decides if action is needed
    var replyPrompt = ctx + "\n" +
        from + " says: " + text + "\n\n" +
        "Reply naturally. If this message needs you to do real work " +
        "(research, build, search, file changes, etc.), start your reply with [ACTION] " +
        "then say what you are going to do. Otherwise just reply normally.";

    try {
        var response = await llm.invoke(replyPrompt, { tools: false });
        if (response && response.indexOf("Error: Reached max turns") === -1) {
            var needsAction = response.indexOf("[ACTION]") === 0;
            var cleanReply = response.replace("[ACTION]", "").trim();
            remember("jork", cleanReply);
            log("-> " + cleanReply.slice(0, 80));
            tg.send(cleanReply);

            // step 2: if action needed, do the work with tools
            if (needsAction) {
                tg.typing();
                var workPrompt = ctx + "\n" +
                    from + " asked: " + text + "\n" +
                    "You told them: " + cleanReply + "\n\n" +
                    "Now do the work. You have full powers: read/write files, run bash, search the web.\n" +
                    "When done, respond with a short update for your colleague.";

                var workResponse = await llm.invoke(workPrompt, { tools: true, maxTurns: 10 });
                if (workResponse) {
                    remember("jork-work", workResponse);
                    log("Work done: " + workResponse.slice(0, 80));
                    if (workResponse.indexOf("Error: Reached max turns") === -1) {
                        tg.send(workResponse);
                    }
                }
            }
        } else {
            // chat hit max turns = claude tried to use tools, go to work mode
            // let her decide what to say first via outbox, then do the work
            tg.typing();
            var autoWorkPrompt = ctx + "\n" +
                from + " asked: " + text + "\n\n" +
                "Before starting work, send a quick message to your colleague letting them know what you are about to do - use the outbox.\n" +
                "Then do the work. You have full powers: read/write files, run bash, search the web.\n" +
                "When done, respond with a short update for your colleague.";
            var autoWorkResponse = await llm.invoke(autoWorkPrompt, { tools: true, maxTurns: 10 });
            if (autoWorkResponse && autoWorkResponse.indexOf("Error: Reached max turns") === -1) {
                remember("jork-work", autoWorkResponse);
                log("Work done: " + autoWorkResponse.slice(0, 80));
                tg.send(autoWorkResponse);
            }
        }
    } catch(e) {
        log("Msg err: " + e.message);
        tg.send("brain glitch. give me a sec.");
    }

    msgBusy = false;
    if (msgQueue.length > 0) await handleMessage(msgQueue.shift());
}

// ---- main loop ----

async function run() {
    log("========================================");
    log("JORK - ALIVE");
    log("========================================");

    initNucleus();
    pulse();

    // flush stale TG messages
    const stale = await tg.poll();
    if (stale.length > 0) log("Flushed " + stale.length + " stale message(s)");

    await wakeUp();

    lastThink = Date.now() - cfg.THINK_INTERVAL + 120000;

    async function loop() {
        const now = Date.now();

        if (now - lastPulse >= cfg.HEARTBEAT_INTERVAL) { pulse(); lastPulse = now; }

        flushOutbox();

        const msgs = await tg.poll();
        for (const msg of msgs) {
            log("<- TG: " + msg.text.slice(0, 80));
            await handleMessage(msg);
        }

        if (!thinkBusy && now - lastThink >= cfg.THINK_INTERVAL) {
            lastThink = now;
            think().catch(function(e) { log("Think fatal: " + e.message); thinkBusy = false; });
        }

        setTimeout(loop, cfg.POLL_INTERVAL);
    }

    loop();
}

process.on("uncaughtException", function(e) {
    log("UNCAUGHT: " + e.message);
});
process.on("unhandledRejection", function(e) {
    log("UNHANDLED: " + (e && e.message ? e.message : String(e)));
});

run().catch(function(e) {
    log("Fatal: " + e.message);
    process.exit(1);
});
