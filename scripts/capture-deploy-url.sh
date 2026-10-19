#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
sprite api "/sprites/zhiyun-ric-e2d4-beneath-the-sk-c88475" 2>/dev/null | python3 -c '
import re, sys
from pathlib import Path
urls = re.findall(r"https://[a-z0-9-]+\.sprites\.app", sys.stdin.read())
if not urls:
    raise SystemExit("Deployment URL missing from Sprite response")
Path(".deploy_url").write_text(urls[0] + "\n")
print("Deployment URL captured:", urls[0])
'
