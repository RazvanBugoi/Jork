#!/bin/bash
# Usage: bash web-search.sh "query"

QUERY="$1"
if [ -z "$QUERY" ]; then
    echo "Usage: web-search.sh <query>"
    exit 1
fi

ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$QUERY")
curl -s "https://api.duckduckgo.com/?q=${ENCODED}&format=json&no_html=1&skip_disambig=1" \
    | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('AbstractText'):
    print(d['AbstractText'])
elif d.get('Answer'):
    print(d['Answer'])
else:
    for t in d.get('RelatedTopics',[])[:5]:
        if isinstance(t,dict) and t.get('Text'):
            print(t['Text'])
"
