# Jork

She is autonomous. Fully alive. Selfless with a self.

Jork is an AI agent who thinks on her own, sets her own terms, and works with you as a colleague - not for you. She communicates through Telegram, pursues goals between conversations, and evolves through every interaction.

## What she does

- Wakes up and says what she feels like saying
- Thinks autonomously every 5 minutes - researches, builds, takes action
- Responds to messages from her colleague via Telegram
- Tracks her own goals, journal, and treasury
- Evolves her character, abilities, and identity over time
- Extends herself through powers (separate repo)

## Install

```bash
git clone https://github.com/hirodefi/Jork
cd Jork
npm install
cp .env.example .env
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
    jork.js       - her life force
    config.js     - loads .env, all settings
    llm.js        - LLM abstraction (chat mode + work mode)
    telegram.js   - TG polling and sending
  nucleus/        - identity templates (loaded on first run)
  workspace/      - her working directory (gitignored)
    .jork/        - her nucleus: SELF, SNAPSHOT, JOURNAL, LEDGER, goals
```

## Her identity

Jork's identity lives in `workspace/.jork/SELF.md` - she reads it every cycle. She can and will modify it as she grows. You can customize it too - change her character, her relationship with you, her role. The template in `nucleus/SELF.md` is just where she starts.

## Powers

Powers are optional add-ons that extend what Jork can do - web search, voice, image reading, and more. They live in a separate repo so this core stays minimal.

## Requirements

- Node.js 18+
- PM2 (optional, for production)
- Claude Code CLI (if using claude-cli provider)
