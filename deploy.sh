#!/bin/bash
cd /Users/lv9/.openclaw/workspace/stocklist
python3 build.py
git add index.html
git diff --cached --quiet || {
  git commit -m "Auto-update stocklist $(date '+%Y-%m-%d %H:%M')"
  git push origin main
}
