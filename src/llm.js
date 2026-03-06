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

// chat mode: no tools, just text response (fast)
// work mode: full tool access for autonomous tasks
function invokeClaude(prompt, opts) {
    return new Promise(function(resolve) {
        var maxTurns = (opts && opts.maxTurns) || cfg.MAX_TURNS;
        var useTools = (opts && opts.tools) || false;

        var model = (opts && opts.opus) ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
        var args = ['-p', '--output-format', 'text', '--model', model];

        if (useTools) {
            args.push('--max-turns', String(maxTurns));
            args.push('--allowedTools', 'Read,Write,Edit,Bash,Glob,Grep,WebSearch,WebFetch');
            if (!opts.noResume) {
                var sessionId = loadSessionId();
                if (sessionId) { args.push('--resume', sessionId); }
            }
        } else {
            // no tools = text reply only, prepend hard instruction
            prompt = "IMPORTANT: Reply with plain text only. Do not use any tools or functions.\n\n" + prompt;
            args.push('--max-turns', '3');
        }

        var claudeCli = process.env.CLAUDE_CLI || 'claude';
        var stdout = '';
        var stderr = '';
        var resolved = false;

        // clean env
        var env = Object.assign({}, process.env);
        delete env.CLAUDECODE;

        var proc = spawn(claudeCli, args, {
            cwd: cfg.WORKSPACE,
            env: env,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        // pipe prompt via stdin to avoid CLI arg parsing issues
        proc.stdin.write(prompt);
        proc.stdin.end();

        var timer = setTimeout(function() {
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
            console.log('[LLM] mode=' + (useTools ? 'work' : 'chat') + ' exit=' + code + ' out=' + stdout.length + 'b');
            if (code !== 0) console.log('[LLM] stderr: ' + stderr.slice(0, 500));
            if (useTools && stderr.indexOf('session_id') !== -1) {
                var m = stderr.match(/"session_id"\s*:\s*"([^"]+)"/);
                if (m) saveSessionId(m[1]);
            }
            var response = stdout.trim();
            if (code !== 0 && !response) { resolve(null); }
            else { resolve(response); }
        });

        proc.on('error', function(e) {
            clearTimeout(timer);
            if (!resolved) { resolved = true; resolve(null); }
        });
    });
}

// ---- OpenAI-compatible API ----

function invokeOpenAI(systemPrompt, userPrompt) {
    return new Promise(function(resolve) {
        var OpenAI = require('openai');
        var client = new OpenAI({
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
        var Anthropic = require('@anthropic-ai/sdk');
        var client = new Anthropic.Anthropic({ apiKey: cfg.LLM_API_KEY });
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
// opts.tools = true for work mode (autonomous tasks with tool access)
// opts.tools = false/undefined for chat mode (text only, fast)

function invoke(prompt, opts) {
    opts = opts || {};
    var provider = cfg.LLM_PROVIDER;

    if (provider === 'claude-cli') {
        return invokeClaude(prompt, opts);
    }

    var systemPrompt = opts.system || 'You are ' + cfg.JORK_NAME + ', an autonomous AI agent.';

    if (provider === 'anthropic') {
        return invokeAnthropic(systemPrompt, prompt);
    }

    return invokeOpenAI(systemPrompt, prompt);
}

module.exports = { invoke };
