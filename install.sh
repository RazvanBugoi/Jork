#!/bin/bash
set -e

echo "Jork install"
echo "============"

# check node
if ! command -v node &>/dev/null; then
    echo "Error: Node.js not found. Install Node 18+ first."
    exit 1
fi

NODE_VER=$(node -e "console.log(parseInt(process.version.slice(1)))")
if [ "$NODE_VER" -lt 18 ]; then
    echo "Error: Node 18+ required. Found: $(node --version)"
    exit 1
fi

# install deps
echo "Installing dependencies..."
npm install

# create .env if missing
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "Created .env from template."
    echo "Edit .env and fill in your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
    echo "Then run: npm start"
else
    echo ".env already exists, skipping."
fi

echo ""
echo "Done. Run 'npm start' to start Jork."
echo "Or run 'pm2 start ecosystem.config.js' to run with PM2."
