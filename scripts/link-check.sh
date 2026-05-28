#!/usr/bin/env bash
# link-check.sh — Internal and external link checker for awesome-aiguide
# Usage:
#   ./scripts/link-check.sh             # Internal links only (default)
#   ./scripts/link-check.sh --external  # Internal + external links
#   ./scripts/link-check.sh --external-only  # External links only

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

CHECK_INTERNAL=1
CHECK_EXTERNAL=0
TIMEOUT=10

for arg in "$@"; do
    case $arg in
        --external) CHECK_EXTERNAL=1 ;;
        --external-only) CHECK_INTERNAL=0; CHECK_EXTERNAL=1 ;;
        --timeout=*) TIMEOUT="${arg#--timeout=}" ;;
        -h|--help)
            echo "Usage: $0 [--external] [--external-only] [--timeout=N]"
            echo "  (default)         Check internal links only"
            echo "  --external        Check internal + external links"
            echo "  --external-only   Check external links only"
            echo "  --timeout=N       Set curl timeout in seconds (default: 10)"
            exit 0
            ;;
    esac
done

red()   { printf '\033[0;31m%s\033[0m' "$1"; }
yel()   { printf '\033[0;33m%s\033[0m' "$1"; }
grn()   { printf '\033[0;32m%s\033[0m' "$1"; }

int_errors=0
int_total=0
ext_errors=0
ext_total=0
ext_unreachable=0

# --- Internal link checking ---
check_internal() {
    echo "Checking internal links..."
    echo "----------------------------"

    # Find all markdown files
    md_files=()
    while IFS= read -r f; do
        md_files+=("$f")
    done < <(find . -name '*.md' -not -path './.claude/*')

    for file in "${md_files[@]}"; do
        file_dir=$(dirname "$file")

        # Strip code blocks before extracting links to avoid false positives
        # (e.g., Python code like `b = func(b, t_emb)` matching [text](path) pattern)
        stripped_file=$(sed '/^```/,/^```/d' "$file")

        # Extract markdown links: [text](path) — but skip images ![text](path) and http links
        # Also handle HTML <a href="path"> links
        while IFS= read -r link; do
            [ -z "$link" ] && continue
            ((int_total++)) || true

            # Resolve path relative to the file's directory
            # Strip leading ./
            target="${link#./}"

            # Skip anchor-only links
            if echo "$target" | grep -qE '^#'; then
                continue
            fi

            # Strip anchor suffix (#section)
            anchor=""
            if echo "$target" | grep -q '#'; then
                anchor="${target#*#}"
                target="${target%%#*}"
            fi

            # Skip empty targets
            [ -z "$target" ] && continue

            # Resolve relative to file directory
            resolved="$file_dir/$target"

            # Check if it's a directory link (ends with /)
            if echo "$target" | grep -qE '/$'; then
                if [ ! -d "$resolved" ]; then
                    red "FAIL"; echo " $file -> $target (directory not found)"
                    ((int_errors++)) || true
                    continue
                fi
            else
                # File link
                if [ ! -f "$resolved" ]; then
                    red "FAIL"; echo " $file -> $target (file not found)"
                    ((int_errors++)) || true
                    continue
                fi
            fi
        done < <(
            # Extract links from markdown format: [text](path)
            echo "$stripped_file" | grep -oE '\[[^]]*\]\([^)]+\)' 2>/dev/null | \
                sed 's/\[.*\](\(.*\))/\1/' | \
                grep -vE '^(https?:|mailto:|tel:)' || true
            # Extract links from HTML format: <a href="path">
            echo "$stripped_file" | grep -oE '<a +href="[^"]+"' 2>/dev/null | \
                sed 's/.*href="\([^"]*\)".*/\1/' | \
                grep -vE '^(https?:|mailto:|tel:|#)' || true
        )
    done

    if [ $int_errors -eq 0 ]; then
        grn "PASS"; echo " All $int_total internal links valid"
    else
        red "FAIL"; echo " $int_errors/$int_total internal links broken"
    fi
    echo ""
}

# --- External link checking ---
check_external() {
    echo "Checking external links (timeout: ${TIMEOUT}s)..."
    echo "This may take a while..."
    echo "---------------------------------------------------"

    md_files=()
    while IFS= read -r f; do
        md_files+=("$f")
    done < <(find . -name '*.md' -not -path './.claude/*')

    # Collect all unique external URLs
    declare -A urls_seen
    for file in "${md_files[@]}"; do
        # Strip code blocks to avoid false positives
        stripped=$(sed '/^```/,/^```/d' "$file")
        while IFS= read -r url; do
            [ -z "$url" ] && continue
            urls_seen["$url"]=1
        done < <(
            # Markdown format URLs
            echo "$stripped" | grep -oE '\[[^]]*\]\(https?://[^)]+\)' 2>/dev/null | \
                sed 's/\[.*\](\(.*\))/\1/' || true
            # HTML format URLs
            echo "$stripped" | grep -oE 'href="https?://[^"]+"' 2>/dev/null | \
                sed 's/.*href="\([^"]*\)".*/\1/' || true
            # Image src URLs
            echo "$stripped" | grep -oE 'src="https?://[^"]+"' 2>/dev/null | \
                sed 's/.*src="\([^"]*\)".*/\1/' || true
        )
    done

    unique_urls=("${!urls_seen[@]}")
    ext_total=${#unique_urls[@]}
    echo "Found $ext_total unique external URLs"
    echo ""

    checked=0
    for url in "${unique_urls[@]}"; do
        ((checked++)) || true

        # Skip shields.io badge URLs (they always return 200, not worth checking)
        if echo "$url" | grep -q 'img.shields.io'; then
            continue
        fi

        # Skip known stable domains
        if echo "$url" | grep -qE '(github\.com|github\.io|npmjs\.com|pypi\.org)'; then
            # Still check, but with a note
            :
        fi

        http_code=$(curl -o /dev/null -s -w "%{http_code}" --head -L --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")

        if [ "$http_code" = "000" ]; then
            red "FAIL"; echo " $url (unreachable/timeout)"
            ((ext_errors++)) || true
            ((ext_unreachable++)) || true
        elif [ "$http_code" -ge 400 ]; then
            red "FAIL"; echo " $url (HTTP $http_code)"
            ((ext_errors++)) || true
        fi

        # Progress indicator every 50 URLs
        if [ $((checked % 50)) -eq 0 ]; then
            echo "  ... checked $checked/$ext_total URLs"
        fi
    done

    echo ""
    if [ $ext_errors -eq 0 ]; then
        grn "PASS"; echo " All $ext_total external links reachable"
    else
        red "FAIL"; echo " $ext_errors/$ext_total external links broken ($ext_unreachable unreachable, $((ext_errors - ext_unreachable)) HTTP errors)"
    fi
    echo ""
}

# --- Run checks ---
if [ $CHECK_INTERNAL -eq 1 ]; then
    check_internal
fi

if [ $CHECK_EXTERNAL -eq 1 ]; then
    check_external
fi

# --- Summary ---
echo "================================"
total_errors=$((int_errors + ext_errors))
if [ $total_errors -gt 0 ]; then
    red "$total_errors total error(s)"
    echo "  Internal: $int_errors/$int_total"
    [ $CHECK_EXTERNAL -eq 1 ] && echo "  External: $ext_errors/$ext_total"
else
    grn "All links OK"
    echo "  Internal: $int_total checked"
    [ $CHECK_EXTERNAL -eq 1 ] && echo "  External: $ext_total checked"
fi
echo "================================"

[ $total_errors -eq 0 ] && exit 0 || exit 1
