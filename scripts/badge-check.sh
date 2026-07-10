#!/usr/bin/env bash
# badge-check.sh — Verify README badge counts against canonical source data.
# Usage: ./scripts/badge-check.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

red() { printf '\033[0;31m%s\033[0m' "$1"; }
grn() { printf '\033[0;32m%s\033[0m' "$1"; }

errors=0

echo "Checking README badge counts..."
echo "================================"

get_badge_value() {
    local label="$1"
    grep -Eo "badge/${label}-[0-9]+" README.md 2>/dev/null \
        | head -n 1 \
        | sed -E 's/.*-([0-9]+)$/\1/' \
        || true
}

check_badge() {
    local label="$1"
    local actual="$2"
    local source="$3"
    local badge

    badge=$(get_badge_value "$label")
    if [ -z "$badge" ]; then
        red "FAIL"
        echo " $label badge is missing from README.md"
        ((errors++)) || true
    elif [ "$badge" != "$actual" ]; then
        red "FAIL"
        echo " $label badge=$badge, actual=$actual ($source)"
        ((errors++)) || true
    else
        grn "PASS"
        echo " $label: badge=$badge, actual=$actual ($source)"
    fi
}

# Count table data rows by their first cell. Header and separator rows are
# excluded; an optional heading stops the count before adjacent/non-core data.
count_named_table_rows() {
    local file="$1"
    local stop_heading="${2:-}"

    awk -v stop="$stop_heading" '
    stop != "" && $0 == stop { exit }
    /^\|/ {
        first=$0
        sub(/^\|[[:space:]]*/, "", first)
        sub(/[[:space:]]*\|.*/, "", first)
        if (first=="" || first=="名称" || first ~ /^:?-+:?$/) next
        count++
    }
    END { print count+0 }
    ' "$file"
}

count_ai_coding_tools() {
    awk '
    $0 == "## 工具总览" { in_overview=1; next }
    in_overview && /^## / { exit }
    in_overview && /^\|/ {
        first=$0
        sub(/^\|[[:space:]]*/, "", first)
        sub(/[[:space:]]*\|.*/, "", first)
        if (first=="" || first=="工具" || first ~ /^:?-+:?$/) next
        count++
    }
    END { print count+0 }
    ' docs/ai-coding/README.md
}

# 精选条目: four explicitly defined source sets. Cross-topic duplicates
# remain separate entries, matching the count semantics documented in the index.
base_count=$(count_named_table_rows docs/project-collections/all-projects.md)
semiconductor_count=$(count_named_table_rows docs/project-collections/ai-semiconductor.md)
hot_github_count=$(count_named_table_rows docs/project-collections/hot-github-repos.md)
agent_skills_count=$(count_named_table_rows \
    docs/project-collections/open-agent-skills.md \
    '## 相邻格式：Cursor Rules / 提示词')
project_count=$((base_count + semiconductor_count + hot_github_count + agent_skills_count))

check_badge \
    "精选条目" \
    "$project_count" \
    "$base_count + $semiconductor_count + $hot_github_count + $agent_skills_count"

# ML and role-path counts use Git-tracked Markdown, excluding each index page.
ml_count=$(git ls-files -- 'docs/machine-learning/*.md' \
    | awk '$0 !~ /\/README\.md$/ { count++ } END { print count+0 }')
check_badge "ML_文章" "$ml_count" "Git-tracked article files"

coding_count=$(count_ai_coding_tools)
check_badge "Coding_工具" "$coding_count" "工具总览 data rows"

paths_count=$(git ls-files -- 'docs/paths/*.md' \
    | awk '$0 !~ /\/README\.md$/ { count++ } END { print count+0 }')
check_badge "角色路线" "$paths_count" "Git-tracked route files"

echo "================================"
if [ $errors -gt 0 ]; then
    red "$errors badge(s) out of date"
    echo ""
    echo "Update README.md badge values to match the source data above."
    exit 1
else
    grn "All 4 badges are up to date"
    exit 0
fi
