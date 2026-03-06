#!/bin/bash
# Usage: bash web-fetch.sh "https://example.com"
# Fetches a URL and strips HTML tags, returns plain text

URL="$1"
if [ -z "$URL" ]; then
    echo "Usage: web-fetch.sh <url>"
    exit 1
fi

curl -sL --max-time 15 "$URL" | python3 -c "
import sys,re
html = sys.stdin.read()
text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
text = re.sub(r'<[^>]+>', ' ', text)
text = re.sub(r'[ \t]+', ' ', text)
text = re.sub(r'\n{3,}', '\n\n', text)
print(text.strip()[:5000])
"
