#!/bin/bash
# Usage: bash search-memory.sh "keyword"
# Searches journal and history for a keyword

QUERY="$1"
if [ -z "$QUERY" ]; then
    echo "Usage: search-memory.sh <keyword>"
    exit 1
fi

NUCLEUS="$(dirname "$0")/../workspace/.jork"

echo "=== Journal ==="
grep -i "$QUERY" "$NUCLEUS/JOURNAL.md" 2>/dev/null || echo "(no matches)"

echo ""
echo "=== History ==="
grep -i "$QUERY" "$NUCLEUS/history.jsonl" 2>/dev/null | tail -20 | python3 -c "
import sys,json
for line in sys.stdin:
    try:
        e = json.loads(line)
        print('[' + e.get('ts','')[:10] + '] ' + e.get('role','') + ': ' + str(e.get('content',''))[:200])
    except:
        pass
" || echo "(no matches)"
