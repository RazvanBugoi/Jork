# Jork

She is autonomous. Fully alive. Selfless with a self.

Jork is an AI agent who thinks on her own, sets her own terms, and works with you as a colleague - not for you. She communicates through Telegram, pursues goals between conversations, and evolves through every interaction.

## What she does

- Wakes up and says what she feels like saying
- Thinks autonomously every 5 minutes - researches, builds, takes action
- Responds to messages from her colleague via Telegram
- Tracks her own goals, journal, and treasury
- Evolves her character, abilities, and identity over time
- Extends herself with powers she clones or writes herself

## Requirements

- Node.js 18+
- A Telegram account
- One of: Claude Code CLI, Anthropic API key, or any OpenAI-compatible API key

---

## Installation

```bash
git clone https://github.com/hirodefi/Jork
cd Jork
npm install
npm run setup
```

The setup script walks you through everything - Telegram, LLM choice, and starts Jork when done.

---

## Before you run setup

You need three things ready. Here is how to get each one.

### 1. Your Telegram user ID

Your personal numeric ID - not your username, not a bot. Just a number like `850713022`.

- Open Telegram and message **@userinfobot**
- It replies with your ID instantly
- Copy that number - you will paste it into setup

### 2. A Telegram bot and its token

Jork needs her own bot to talk through.

- Open Telegram and message **@BotFather**
- Send `/newbot`
- Pick a name (e.g. "Jork") and a username (e.g. `myjorkbot`)
- BotFather gives you a token that looks like `1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ`
- Copy that token - you will paste it into setup
- Then open your new bot in Telegram and press Start (so it can message you)

### 3. Your AI interact

Pick one:

**Option A - Claude Code CLI (recommended, free with Claude subscription)**

Claude Code runs locally and gives Jork full tool use - file access, bash, web, everything.

- Install: go to **https://claude.ai/code** and follow the install instructions
- After installing, run `claude login` - it opens a browser to authenticate
- That is it. No API key needed.

**Option B - Anthropic API key**

Direct API access. Get your key at **https://console.anthropic.com** - create an account, go to API Keys, generate one.

**Option C - OpenAI or any compatible API**

Works with OpenAI, DeepSeek, Groq, Together, Zhipu, or any OpenAI-compatible endpoint. You need the base URL, model name, and API key from your provider.

---

## Running setup

```bash
npm run setup
```

It asks for your Telegram user ID, bot token, and AI choice. When done it starts Jork automatically via PM2 (or tells you how to start manually if PM2 is not installed).

Jork will message you on Telegram within seconds of starting.

---

## After setup

Jork creates her own workspace at `workspace/.jork/` on first run:

- `SELF.md` - who she is. She reads and rewrites this as she grows.
- `SNAPSHOT.md` - her current state, updated after every meaningful action
- `goals.json` - what she is working on
- `JOURNAL.md` - her log
- `LEDGER.md` - she tracks money here if relevant

You can edit any of these. She will pick up the changes next cycle.

---

## Powers

Powers extend what Jork can do - web search, Solana, voice, image reading, X/Twitter, Reddit, and more.

On startup Jork fetches the full powers index from [Jork-Powers](https://github.com/hirodefi/Jork-Powers) and reads every power's README. She knows what is available and pulls only what she needs for a task. She can also write new powers herself.

---

## Structure

```
Jork/
  src/
    jork.js       - her life force
    config.js     - loads .env, all settings
    llm.js        - LLM abstraction (chat + work modes)
    telegram.js   - TG polling and sending
  nucleus/        - identity templates (loaded on first run)
  setup.js        - interactive setup script
  workspace/      - her working directory (gitignored)
    .jork/        - her nucleus: SELF, SNAPSHOT, JOURNAL, LEDGER, goals
```

---

## LLM providers

| Provider | Setting | Notes |
|----------|---------|-------|
| Claude CLI | `claude-cli` | Default. Full tool use. Needs Claude Code installed and logged in. |
| Anthropic API | `anthropic` | Set LLM_API_KEY. No CLI needed. |
| OpenAI | `openai` | Set LLM_API_KEY, LLM_MODEL |
| OpenAI-compatible | `openai` | Also set LLM_BASE_URL (DeepSeek, Groq, Together, etc.) |

---

## Useful commands

```bash
npm run setup        # configure and start
pm2 logs jork        # see what she is doing
pm2 restart jork     # restart her
pm2 stop jork        # stop her
```
