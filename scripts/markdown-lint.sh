#!/usr/bin/env bash
# markdown-lint.sh — Markdown format checker for 91ai
# Usage: ./scripts/markdown-lint.sh [file-or-directory ...]
# With no arguments, checks canonical, Git-tracked reader-facing Markdown.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FILES=()

collect_default_files() {
    local file
    while IFS= read -r -d '' file; do
        case "$file" in
            docs/*/imgs/*|docs/*/illustrations/*)
                # Authoring sidecars, not reader-facing documentation.
                ;;
            README.md|AGENTS.md|CLAUDE.md|docs/*.md)
                FILES+=("$file")
                ;;
        esac
    done < <(git ls-files -z -- README.md AGENTS.md CLAUDE.md docs)
}

collect_explicit_files() {
    local input file
    for input in "$@"; do
        [ "$input" = "--" ] && continue
        if [ -f "$input" ]; then
            FILES+=("$input")
        elif [ -d "$input" ]; then
            while IFS= read -r -d '' file; do
                FILES+=("$file")
            done < <(find "$input" -type f -name '*.md' -print0)
        else
            echo "Path not found: $input" >&2
            return 1
        fi
    done
}

if [ $# -gt 0 ]; then
    collect_explicit_files "$@"
else
    collect_default_files
fi

if [ ${#FILES[@]} -eq 0 ]; then
    echo "No Markdown files found." >&2
    exit 1
fi

echo "Checking markdown format on ${#FILES[@]} files..."
echo ""

# A single awk process handles every file. Besides being much faster than
# spawning grep/awk pipelines per document, this keeps warning totals exact.
awk '
function begin_file(path, base) {
    current_file=path
    file_err=0
    file_warn=0
    trailing=0
    prev_level=0
    prev_blank=1
    first_seen=0
    has_html_h1=0
    in_code=0
    fence_char=""
    fence_n=0

    base=path
    sub(/^.*\//, "", base)
    if (base!="README.md" && base!="CLAUDE.md" && base!="AGENTS.md" &&
        base !~ /^[a-z0-9][a-z0-9-]*[.]md$/) {
        printf "\033[0;31mFAIL\033[0m %s:- Filename not kebab-case: %s\n", path, base
        file_err++
    }
}

function finish_file() {
    if (in_code) {
        printf "\033[0;31mFAIL\033[0m %s:- Unclosed code block\n", current_file
        file_err++
    }
    if (trailing>0) {
        printf "\033[0;33mWARN\033[0m %s:- Trailing whitespace on %d lines (outside code blocks)\n", current_file, trailing
    }

    total_errors+=file_err
    total_warnings+=file_warn
    total_files++
    if (file_err==0) {
        printf "\033[0;32mPASS\033[0m %s\n", current_file
        pass_count++
    }
}

FNR==1 {
    if (started) finish_file()
    started=1
    begin_file(FILENAME)
}

{
    marker_char=substr($0, 1, 1)
    marker_n=0
    if (marker_char=="`" || marker_char=="~") {
        for (i=1; i<=length($0); i++) {
            if (substr($0, i, 1)==marker_char) marker_n++
            else break
        }
    }
    if (marker_n>=3) {
        if (!in_code) {
            in_code=1
            fence_char=marker_char
            fence_n=marker_n
        } else if (marker_char==fence_char && marker_n>=fence_n) {
            in_code=0
            fence_char=""
            fence_n=0
        }
        prev_blank=0
        next
    }

    if (in_code) {
        prev_blank=0
        next
    }

    if ($0 ~ /<h1[ >]/) has_html_h1=1

    if ($0 ~ /[[:blank:]]+$/) {
        trailing++
        file_warn++
    }

    if ($0 ~ /^#{1,4} [^#]/) {
        if (!first_seen) {
            first_seen=1
            if (!has_html_h1 && $0 !~ /^# [^#]/) {
                printf "\033[0;31mFAIL\033[0m %s:%d First heading is not h1\n", FILENAME, FNR
                file_err++
            }
        }
        match($0, /^#{1,4}/)
        level=RLENGTH
        if (prev_level>0 && level-prev_level>1) {
            printf "\033[0;31mFAIL\033[0m %s:%d Heading skips level: h%d -> h%d\n", FILENAME, FNR, prev_level, level
            file_err++
        }
        prev_level=level
    }

    if ($0 ~ /^\* / && $0 !~ /^\* \* \*/) {
        printf "\033[0;33mWARN\033[0m %s:%d Use - instead of * for list items\n", FILENAME, FNR
        file_warn++
    }

    if ($0 ~ /^#{2,4} [^#]/ && !prev_blank) {
        printf "\033[0;31mFAIL\033[0m %s:%d Missing blank line before heading\n", FILENAME, FNR
        file_err++
    }

    if ($0 ~ /^[[:space:]]*$/) {
        prev_blank=1
        next
    }
    prev_blank=0
}

END {
    if (started) finish_file()

    print ""
    print "================================"
    printf "Files: %d passed, %d with issues\n", pass_count, total_files-pass_count
    if (total_errors>0) printf "\033[0;31m%d error(s)\033[0m, ", total_errors
    else printf "\033[0;32m%d error(s)\033[0m, ", total_errors
    if (total_warnings>0) printf "\033[0;33m%d warning(s)\033[0m\n", total_warnings
    else printf "\033[0;32m%d warning(s)\033[0m\n", total_warnings
    print "================================"

    if (total_errors>0) exit 1
}
' "${FILES[@]}"
