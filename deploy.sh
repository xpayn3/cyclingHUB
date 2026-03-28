#!/bin/bash
# Deploy CycleIQ — build + commit + push in one command
# Usage: bash deploy.sh "commit message"

set -e

MSG="${1:-Update}"

# 1. Build minified files into docs/
node build.js

# 2. Copy assets to docs/
cp -r img docs/ 2>/dev/null || true
cp icons.svg docs/ 2>/dev/null || true
cp apple-touch-icon.png docs/ 2>/dev/null || true

# 3. Update build hash
HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
sed -i "s/const BUILD_HASH = '[^']*'/const BUILD_HASH = '$HASH'/" app.js

# 4. Stage tracked files only (respects .gitignore)
git add -u
git add docs/
git commit -m "$MSG

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
