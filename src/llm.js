'use strict';
const { spawn } = require('child_process');
const https = require('https');
const cfg = require('./config');

// ---- Claude CLI bridge ----

function loadSessionId() {
    const fs = require('fs');
    const f = cfg.THREAD;
    try { return fs.readFileSync(f, 'utf8').trim(); } catch(e) { return null; }
}

function saveSessionId(sid) {
    try { require('fs').writeFileSync(cfg.THREAD, sid); } catch(e) {}
}

function invokeClaude(prompt, maxTurns) {
    return new Promise(function(resolve) {
        const sessionId = loadSessionId();
        const args = [
            '-p', prompt,
            '--output-format', 'text',
            '--max-turns', String(maxTurns || cfg.MAX_TURNS),
            '--allowedTools', 'Read,Write,Edit,Bash,Glob,Grep',
        ];
        if (sessionId) { args.push('--resume'); args.push(sessionId); }

        const claudeCli = process.env.CLAUDE_CLI || 'claude';
        let stdout = '';
        let stderr = '';
        let resolved = false;

        const proc = spawn(claudeCli, args, {
            cwd: cfg.WORKSPACE,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        proc.stdin.end();

        const timer = setTimeout(function() {
            if (!resolved) {
                resolved = true;
                try { proc.kill('SIGTERM'); } catch(e) {}
                setTimeout(function() { try { proc.kill('SIGKILL'); } catch(e) {} }, 5000);
                resolve(stdout.trim() || null);
            }
        }, cfg.INVOKE_TIMEOUT);

        proc.stdout.on('data', function(d) { stdout += d.toString(); });
        proc.stderr.on('data', function(d) { stderr += d.toString(); });

        proc.on('close', function(code) {
            clearTimeout(timer);
            if (resolved) return;
            resolved = true;
            if (stderr.indexOf('session_id') !== -1) {
                const m = stderr.match(/"session_id"\s*:\s*"([^"]+)"/);
                if (m) saveSessionId(m[1]);
            }
            const response = stdout.trim();
            if (code !== 0 && !response) { resolve(null); }
            else { resolve(response); }
        });

        proc.on('error', function(e) {
            clearTimeout(timer);
            if (!resolved) { resolved = true; resolve(null); }
        });
    });
}

// ---- OpenAI-compatible API (openai, zhipu, deepseek, together, etc.) ----

function invokeOpenAI(systemPrompt, userPrompt) {
    return new Promise(function(resolve) {
        const OpenAI = require('openai');
        const client = new OpenAI({
            apiKey: cfg.LLM_API_KEY,
            baseURL: cfg.LLM_BASE_URL
        });
        client.chat.completions.create({
            model: cfg.LLM_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 2000
        }).then(function(res) {
            resolve(res.choices[0].message.content || null);
        }).catch(function(e) {
            resolve(null);
        });
    });
}

// ---- Anthropic API direct ----

function invokeAnthropic(systemPrompt, userPrompt) {
    return new Promise(function(resolve) {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic.Anthropic({ apiKey: cfg.LLM_API_KEY });
        client.messages.create({
            model: cfg.ANTHROPIC_MODEL,
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        }).then(function(res) {
            resolve(res.content[0].text || null);
        }).catch(function(e) {
            resolve(null);
        });
    });
}

// ---- Unified invoke ----
// For claude-cli: full prompt passed as user message, it has tool access
// For API providers: system prompt is Jork identity, user prompt is the task

function invoke(prompt, opts) {
    opts = opts || {};
    const maxTurns = opts.maxTurns || cfg.MAX_TURNS;
    const provider = cfg.LLM_PROVIDER;

    if (provider === 'claude-cli') {
        return invokeClaude(prompt, maxTurns);
    }

    // For API-based providers, split prompt into system + user
    const systemPrompt = opts.system || 'You are ' + cfg.JORK_NAME + ', an autonomous AI agent.';

    if (provider === 'anthropic') {
        return invokeAnthropic(systemPrompt, prompt);
    }

    // openai / custom / zhipu / deepseek / etc.
    return invokeOpenAI(systemPrompt, prompt);
}

module.exports = { invoke };
