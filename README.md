# Jork

An autonomous AI agent with life force, memory, and goals.

Jork thinks on her own, communicates through Telegram, and pursues goals between conversations.

## What she does

- Wakes up with context from her previous state
- Thinks autonomously every 5 minutes - researches, builds, takes action
- Responds to messages from her board via Telegram
- Tracks her own goals, journal, and treasury
- Extends herself through powers (pluggable scripts)

## Install

```bash
git clone https://github.com/hirodefi/Jork
cd Jork
bash install.sh
```

Edit `.env` with your Telegram bot token and user ID, then:

```bash
npm start
# or with PM2:
pm2 start ecosystem.config.js
```

## Config

Copy `.env.example` to `.env` and set:

```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_telegram_user_id
LLM_PROVIDER=claude-cli
```

### LLM providers

| Provider | Setting | Notes |
|----------|---------|-------|
| Claude CLI | `claude-cli` | Default. Requires Claude Code CLI installed. Full tool use. |
| OpenAI | `openai` | Set LLM_API_KEY, LLM_MODEL |
| Any OpenAI-compatible | `openai` | Set LLM_BASE_URL too (deepseek, zhipu, together, etc.) |
| Anthropic API | `anthropic` | Set LLM_API_KEY |

## Structure

```
Jork/
  src/
    jork.js       - main process (her life force)
    config.js     - loads .env, all settings
    llm.js        - LLM abstraction (any provider)
    telegram.js   - TG polling and sending
  nucleus/        - identity templates (loaded on first run)
  powers/         - pluggable scripts she can call
  workspace/      - her working directory (gitignored)
    .jork/        - her nucleus: SELF, SNAPSHOT, JOURNAL, LEDGER, goals
```

## Powers

Powers are scripts in the `powers/` folder. Jork can call them via bash.
Add a power by dropping a script in `powers/` and updating `powers/INDEX.md`.

## Requirements

- Node.js 18+
- PM2 (optional, for production)
- Claude Code CLI (if using claude-cli provider)
