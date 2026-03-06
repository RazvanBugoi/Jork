'use strict';
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) {
    return new Promise(resolve => rl.question(q, resolve));
}

function line() { console.log('  ' + '-'.repeat(48)); }

// set or replace a key in env string
function setKey(env, key, value) {
    const re = new RegExp(`^(#\\s*)?${key}=.*$`, 'm');
    if (re.test(env)) return env.replace(re, `${key}=${value}`);
    return env + `\n${key}=${value}`;
}

async function main() {
    console.log('');
    line();
    console.log('  JORK SETUP');
    line();
    console.log('');

    const envPath = path.join(__dirname, '.env');
    const examplePath = path.join(__dirname, '.env.example');

    if (fs.existsSync(envPath)) {
        const ow = await ask('  .env already exists. Overwrite? (y/n): ');
        if (ow.trim().toLowerCase() !== 'y') {
            console.log('  Keeping existing .env.');
            rl.close();
            done();
            return;
        }
    }

    let env = fs.readFileSync(examplePath, 'utf8');

    // --- Telegram user ID ---
    console.log('');
    console.log('  STEP 1 - Your Telegram user ID');
    console.log('  How to get it: message @userinfobot on Telegram.');
    console.log('  It will reply with your numeric ID (e.g. 850713022).');
    console.log('');
    const userId = (await ask('  Enter your Telegram user ID: ')).trim();
    env = setKey(env, 'TELEGRAM_CHAT_ID', userId);

    // --- Telegram bot token ---
    console.log('');
    console.log('  STEP 2 - Telegram bot token');
    console.log('  How to get it: message @BotFather on Telegram.');
    console.log('  Send /newbot, follow the steps, copy the token it gives you.');
    console.log('  Looks like: 1234567890:ABCdefGHI...');
    console.log('');
    const botToken = (await ask('  Enter your bot token: ')).trim();
    env = setKey(env, 'TELEGRAM_BOT_TOKEN', botToken);

    // --- LLM ---
    console.log('');
    console.log('  STEP 3 - AI brain');
    console.log('  [1] Claude CLI  (uses your Claude Code install, no extra key needed)');
    console.log('  [2] Anthropic API  (claude-sonnet / claude-opus via API key)');
    console.log('  [3] OpenAI / compatible  (GPT-4, DeepSeek, Groq, etc.)');
    console.log('');
    const choice = (await ask('  Choose 1, 2, or 3: ')).trim();

    if (choice === '1') {
        env = setKey(env, 'LLM_PROVIDER', 'claude-cli');
        try {
            execSync('claude --version', { stdio: 'ignore' });
            console.log('  Claude CLI found.');
        } catch(e) {
            console.log('');
            console.log('  Claude CLI not found on this machine.');
            console.log('  Install it from https://claude.ai/code then start Jork.');
        }
    } else if (choice === '2') {
        console.log('');
        console.log('  Get your key at https://console.anthropic.com');
        const key = (await ask('  Enter your Anthropic API key: ')).trim();
        env = setKey(env, 'LLM_PROVIDER', 'anthropic');
        env = setKey(env, 'LLM_API_KEY', key);
        env = setKey(env, 'ANTHROPIC_MODEL', 'claude-sonnet-4-6');
    } else {
        console.log('');
        const baseUrl = (await ask('  API base URL (e.g. https://api.openai.com/v1): ')).trim();
        const model = (await ask('  Model name (e.g. gpt-4o, deepseek-chat): ')).trim();
        const key = (await ask('  API key: ')).trim();
        env = setKey(env, 'LLM_PROVIDER', 'openai');
        env = setKey(env, 'LLM_BASE_URL', baseUrl);
        env = setKey(env, 'LLM_MODEL', model);
        env = setKey(env, 'LLM_API_KEY', key);
    }

    fs.writeFileSync(envPath, env);
    console.log('');
    console.log('  Config saved.');

    rl.close();

    console.log('');
    line();
    console.log('  Done. Starting Jork...');
    line();
    console.log('');

    try {
        execSync('pm2 start ecosystem.config.js', { cwd: __dirname, stdio: 'inherit' });
        console.log('');
        console.log('  Jork is now alive.');
        console.log('  She will message you on Telegram shortly.');
        console.log('');
    } catch(e) {
        // pm2 not installed - fallback message
        console.log('  pm2 not found. Start her manually:');
        console.log('    node src/jork.js');
        console.log('');
        console.log('  Or install pm2 first:');
        console.log('    npm install -g pm2');
        console.log('    pm2 start ecosystem.config.js');
        console.log('');
    }
}

main().catch(e => {
    console.error('Setup error:', e.message);
    rl.close();
    process.exit(1);
});
