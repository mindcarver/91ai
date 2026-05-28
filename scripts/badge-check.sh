#!/usr/bin/env bash
# badge-check.sh — Verify README badge counts match reality
# Usage: ./scripts/badge-check.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

red()   { printf '\033[0;31m%s\033[0m' "$1"; }
yel()   { printf '\033[0;33m%s\033[0m' "$1"; }
grn()   { printf '\033[0;32m%s\033[0m' "$1"; }

errors=0

echo "Checking README badge counts..."
echo "================================"

# --- Extract badge values from README.md ---
get_badge_value() {
    local label="$1"
    grep -o "badge/${label}-[0-9]*" README.md | grep -o '[0-9]*$'
}

# --- Badge 1: 项目 ---
badge_proj=$(get_badge_value '项目')
# Count from project-collections/README.md stated value
proj_readme_count=$(grep -o '当前收录 [0-9]*' docs/project-collections/README.md | grep -o '[0-9]*' || echo "0")

if [ "$badge_proj" != "$proj_readme_count" ]; then
    red "FAIL"; echo " 项目 badge=$badge_proj, project-collections/README says $proj_readme_count"
    ((errors++)) || true
else
    grn "PASS"; echo " 项目: badge=$badge_proj, README count=$proj_readme_count"
fi

# --- Badge 2: ML 文章 ---
badge_ml=$(get_badge_value 'ML_文章')
# Count .md files in machine-learning/ excluding README.md
ml_count=$(find docs/machine-learning -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')

if [ "$badge_ml" != "$ml_count" ]; then
    red "FAIL"; echo " ML_文章 badge=$badge_ml, actual file count=$ml_count"
    ((errors++)) || true
else
    grn "PASS"; echo " ML_文章: badge=$badge_ml, actual=$ml_count"
fi

# --- Badge 3: Coding 工具 ---
badge_coding=$(get_badge_value 'Coding_工具')
# Count top-level .md files in ai-coding/ excluding README and learning-path files
coding_count=$(ls docs/ai-coding/*.md 2>/dev/null | grep -v 'README' | grep -v 'learning-path' | wc -l | tr -d ' ')

if [ "$badge_coding" != "$coding_count" ]; then
    red "FAIL"; echo " Coding_工具 badge=$badge_coding, actual file count=$coding_count"
    ((errors++)) || true
else
    grn "PASS"; echo " Coding_工具: badge=$badge_coding, actual=$coding_count"
fi

# --- Badge 4: 角色路线 ---
badge_paths=$(get_badge_value '角色路线')
# Count .md files in paths/ excluding README.md
paths_count=$(ls docs/paths/*.md 2>/dev/null | grep -v 'README' | wc -l | tr -d ' ')

if [ "$badge_paths" != "$paths_count" ]; then
    red "FAIL"; echo " 角色路线 badge=$badge_paths, actual file count=$paths_count"
    ((errors++)) || true
else
    grn "PASS"; echo " 角色路线: badge=$badge_paths, actual=$paths_count"
fi

echo "================================"
if [ $errors -gt 0 ]; then
    red "$errors badge(s) out of date"
    echo ""
    echo "To fix, update the badge URLs in README.md to match actual counts."
    exit 1
else
    grn "All 4 badges are up to date"
    exit 0
fi
