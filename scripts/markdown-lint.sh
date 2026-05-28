#!/usr/bin/env bash
# markdown-lint.sh — Markdown format checker for awesome-aiguide
# Usage: ./scripts/markdown-lint.sh [file...]
# If no files given, checks all .md files in the project.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ $# -gt 0 ]; then
    FILES=("$@")
else
    FILES=()
    while IFS= read -r f; do
        FILES+=("$f")
    done < <(find . -name '*.md' -not -path './.claude/*')
fi

total_errors=0
total_warnings=0
pass_count=0

echo "Checking markdown format on ${#FILES[@]} files..."
echo ""

for file in "${FILES[@]}"; do
    [ -f "$file" ] || continue
    file_err=0
    file_warn=0

    # Rule 7: filename kebab-case (README.md and CLAUDE.md are exempt)
    base=$(basename "$file")
    if [ "$base" != "README.md" ] && [ "$base" != "CLAUDE.md" ] && [ "$base" != "AGENTS.md" ]; then
        if ! echo "$base" | grep -qE '^[a-z0-9][a-z0-9-]*\.md$'; then
            printf '\033[0;31mFAIL\033[0m %s:- Filename not kebab-case: %s\n' "$file" "$base"
            file_err=$((file_err + 1))
        fi
    fi

    # Rule 5: unclosed code blocks
    fence_count=$(grep -cE '^```' "$file" || true)
    fence_count=${fence_count:-0}
    if [ $((fence_count % 2)) -ne 0 ]; then
        printf '\033[0;31mFAIL\033[0m %s:- Unclosed code block (odd fences: %d)\n' "$file" "$fence_count"
        file_err=$((file_err + 1))
    fi

    # Rules 1-4, 6: single awk pass
    # Pass a flag if the file has HTML h1 (skip markdown h1 check)
    has_html_h1="no"
    if grep -qE '<h1[ >]' "$file"; then
        has_html_h1="yes"
    fi

    awk_output=$(awk -v skip_h1="$has_html_h1" '
    BEGIN { prev_level=0; in_code=0; prev_blank=1; trailing=0; errs=0; wrns=0 }
    /^```/ { in_code=1-in_code; prev_blank=0; next }
    in_code { prev_blank=0; next }
    /^#{1,4} [^#]/ {
        if (!first_seen) {
            first_seen=1
            if (skip_h1!="yes" && !/^# [^#]/) {
                printf "\033[0;31mFAIL\033[0m %s:%d First heading is not h1\n", FILENAME, FNR
                errs++
            }
        }
        match($0, /^#{1,4}/); lvl=RLENGTH
        if (prev_level>0 && lvl-prev_level>1) {
            printf "\033[0;31mFAIL\033[0m %s:%d Heading skips level: h%d -> h%d\n", FILENAME, FNR, prev_level, lvl
            errs++
        }
        prev_level=lvl
    }
    /^\* / && !/^\* \* \*/ {
        printf "\033[0;33mWARN\033[0m %s:%d Use - instead of * for list items\n", FILENAME, FNR
        wrns++
    }
    /^#{2,4} [^#]/ && !prev_blank {
        printf "\033[0;31mFAIL\033[0m %s:%d Missing blank line before heading\n", FILENAME, FNR
        errs++
    }
    /^[[:space:]]*$/ { prev_blank=1; next }
    { prev_blank=0 }
    / +$/ { trailing++ }
    END {
        if (trailing>0) printf "\033[0;33mWARN\033[0m %s:- Trailing whitespace on %d lines (outside code blocks)\n", FILENAME, trailing
        printf "STATS %d %d %d\n", errs, wrns, trailing
    }
    ' "$file")

    # Parse stats from awk
    stats=$(echo "$awk_output" | grep '^STATS' | tail -1)
    awk_err=$(echo "$stats" | awk '{print $2}')
    awk_warn=$(echo "$stats" | awk '{print $3}')
    awk_err=${awk_err:-0}
    awk_warn=${awk_warn:-0}
    file_err=$((file_err + awk_err))
    file_warn=$((file_warn + awk_warn))

    # Print non-stats output
    echo "$awk_output" | grep -v '^STATS' || true

    total_errors=$((total_errors + file_err))
    total_warnings=$((total_warnings + file_warn))

    if [ $file_err -eq 0 ]; then
        printf '\033[0;32mPASS\033[0m %s\n' "$file"
        pass_count=$((pass_count + 1))
    fi
done

echo ""
echo "================================"
printf "Files: %d passed, %d with issues\n" "$pass_count" "$((${#FILES[@]} - pass_count))"
if [ $total_errors -gt 0 ]; then
    printf '\033[0;31m%s error(s)\033[0m, ' "$total_errors"
else
    printf '\033[0;32m%s error(s)\033[0m, ' "$total_errors"
fi
if [ $total_warnings -gt 0 ]; then
    printf '\033[0;33m%s warning(s)\033[0m\n' "$total_warnings"
else
    printf '\033[0;32m%s warning(s)\033[0m\n' "$total_warnings"
fi
echo "================================"

[ $total_errors -eq 0 ] && exit 0 || exit 1
