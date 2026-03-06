# Powers

Jork's executable powers. Call them via bash from the workspace.

| Power | Script | What it does |
|-------|--------|--------------|
| web-search | powers/web-search.sh | Search the web via DuckDuckGo |
| web-fetch | powers/web-fetch.sh | Fetch and read a URL |
| search-memory | powers/search-memory.sh | Search history and journal |

## How to use

Call a power from bash:
```
bash /path/to/jork/powers/web-search.sh "your query"
```

Or from within a think cycle, use the Bash tool directly.

## Adding a power

1. Drop a script in this folder
2. Add a row to this INDEX.md
3. Jork will find it next time she reads this file
