#!/usr/bin/env bash
# link-check.sh — Internal and external link checker for 91ai
# Usage:
#   ./scripts/link-check.sh [path ...]             # Internal links only
#   ./scripts/link-check.sh --external [path ...]  # Internal + external links
#   ./scripts/link-check.sh --external-only [path ...]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

CHECK_INTERNAL=1
CHECK_EXTERNAL=0
TIMEOUT=10
FILE_ARGS=()

usage() {
    echo "Usage: $0 [--external] [--external-only] [--timeout=N] [path ...]"
    echo "  (default)         Check internal links only"
    echo "  --external        Check internal + external links"
    echo "  --external-only   Check external links only"
    echo "  --timeout=N       Set curl timeout in seconds (default: 10)"
    echo "  path              Check explicit Markdown file(s) or directories"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --external)
            CHECK_EXTERNAL=1
            ;;
        --external-only)
            CHECK_INTERNAL=0
            CHECK_EXTERNAL=1
            ;;
        --timeout=*)
            TIMEOUT="${1#--timeout=}"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            while [ $# -gt 0 ]; do
                FILE_ARGS+=("$1")
                shift
            done
            break
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            FILE_ARGS+=("$1")
            ;;
    esac
    shift
done

if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]] || [ "$TIMEOUT" -eq 0 ]; then
    echo "--timeout must be a positive integer." >&2
    exit 1
fi

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
    for input in "${FILE_ARGS[@]}"; do
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

if [ ${#FILE_ARGS[@]} -gt 0 ]; then
    collect_explicit_files
else
    collect_default_files
fi

if [ ${#FILES[@]} -eq 0 ]; then
    echo "No Markdown files found." >&2
    exit 1
fi

red() { printf '\033[0;31m%s\033[0m' "$1"; }
grn() { printf '\033[0;32m%s\033[0m' "$1"; }

int_errors=0
int_total=0
ext_errors=0
ext_total=0
ext_unreachable=0

# Extract links from all selected files in one Perl process. Each record is
# "source<TAB>target". Fence state resets at file boundaries, and marker length
# is tracked so a shorter fence inside a longer block does not close it.
extract_all_link_targets() {
    perl -CSDA -ne '
        if (!defined($current_file) || $ARGV ne $current_file) {
            $current_file=$ARGV;
            $in_fence=0;
            $fence_char="";
            $fence_len=0;
        }

        if (/^\s*(`{3,}|~{3,})/) {
            my $marker=$1;
            my $char=substr($marker, 0, 1);
            my $len=length($marker);
            if (!$in_fence) {
                $in_fence=1;
                $fence_char=$char;
                $fence_len=$len;
                next;
            }
            if ($char eq $fence_char && $len >= $fence_len) {
                $in_fence=0;
                $fence_char="";
                $fence_len=0;
                next;
            }
        }
        next if $in_fence;

        sub emit_target {
            my ($target)=@_;
            $target =~ s/\\([ ()])/$1/g;
            print "$ARGV\t$target\n";
        }

        while (/\]\(\s*(?:<([^>\r\n]+)>|((?:\\.|[^()\s]|\((?:\\.|[^()])*\))+))/g) {
            emit_target(defined($1) ? $1 : $2);
        }
        if (/^\s*\[[^\]]+\]:\s*(?:<([^>\r\n]+)>|(\S+))/) {
            emit_target(defined($1) ? $1 : $2);
        }
        while (/<(?:a|img)\b[^>]*?\b(?:href|src)\s*=\s*(["\x27])(.*?)\1/ig) {
            emit_target($2);
        }
        while (/<(https?:\/\/[^>]+)>/ig) {
            emit_target($1);
        }
    ' "${FILES[@]}"
}

# --- Internal link checking ---
check_internal() {
    local file file_dir link target resolved

    echo "Checking internal links in ${#FILES[@]} Markdown files..."
    echo "------------------------------------------------------"

    while IFS=$'\t' read -r file link; do
        [ -z "$link" ] && continue
        if [[ "$file" == */* ]]; then
            file_dir="${file%/*}"
        else
            file_dir="."
        fi
        target="${link//&amp;/&}"

        # Skip all URI schemes, protocol-relative URLs, and page anchors.
        if [[ "$target" =~ ^[A-Za-z][A-Za-z0-9+.-]*: ]] || [[ "$target" == //* ]] || [[ "$target" == \#* ]]; then
            continue
        fi

        # Validate the path only. GitHub heading slugs vary for Unicode and
        # punctuation, so anchors (especially Chinese ones) are not guessed.
        target="${target%%#*}"
        target="${target%%\?*}"
        [ -z "$target" ] && continue

        # Decode the common path escape used by Markdown authors.
        target="${target//%20/ }"

        if [[ "$target" == /* ]]; then
            resolved="$REPO_ROOT/${target#/}"
        else
            resolved="$file_dir/$target"
        fi

        ((int_total++)) || true
        if [ ! -f "$resolved" ] && [ ! -d "$resolved" ]; then
            red "FAIL"
            echo " $file -> $target (target not found)"
            ((int_errors++)) || true
        fi
    done < <(extract_all_link_targets)

    if [ $int_errors -eq 0 ]; then
        grn "PASS"
        echo " All $int_total internal targets exist"
    else
        red "FAIL"
        echo " $int_errors/$int_total internal targets are broken"
    fi
    echo ""
}

# --- External link checking ---
check_external() {
    local source url http_code checked
    local unique_urls=()

    echo "Checking external links in ${#FILES[@]} Markdown files (timeout: ${TIMEOUT}s)..."
    echo "This may take a while..."
    echo "----------------------------------------------------------------"

    while IFS= read -r url; do
        [ -n "$url" ] && unique_urls+=("${url//&amp;/&}")
    done < <(
        while IFS=$'\t' read -r source url; do
            [[ "$url" =~ ^https?:// ]] && printf '%s\n' "$url"
        done < <(extract_all_link_targets) | LC_ALL=C sort -u
    )

    ext_total=${#unique_urls[@]}
    echo "Found $ext_total unique external URLs"
    echo ""

    checked=0
    for url in "${unique_urls[@]}"; do
        ((checked++)) || true

        # Badge rendering is not a useful availability signal.
        if [[ "$url" == *img.shields.io* ]]; then
            continue
        fi

        http_code=$(curl -o /dev/null -s -w "%{http_code}" --head -L --max-time "$TIMEOUT" "$url" 2>/dev/null || true)
        [ -n "$http_code" ] || http_code="000"

        if [ "$http_code" = "000" ]; then
            red "FAIL"
            echo " $url (unreachable/timeout)"
            ((ext_errors++)) || true
            ((ext_unreachable++)) || true
        elif [ "$http_code" -ge 400 ]; then
            red "FAIL"
            echo " $url (HTTP $http_code)"
            ((ext_errors++)) || true
        fi

        if [ $((checked % 50)) -eq 0 ]; then
            echo "  ... checked $checked/$ext_total URLs"
        fi
    done

    echo ""
    if [ $ext_errors -eq 0 ]; then
        grn "PASS"
        echo " All $ext_total external links reachable or intentionally skipped"
    else
        red "FAIL"
        echo " $ext_errors/$ext_total external links broken ($ext_unreachable unreachable, $((ext_errors - ext_unreachable)) HTTP errors)"
    fi
    echo ""
}

if [ $CHECK_INTERNAL -eq 1 ]; then
    check_internal
fi

if [ $CHECK_EXTERNAL -eq 1 ]; then
    check_external
fi

echo "================================"
total_errors=$((int_errors + ext_errors))
if [ $total_errors -gt 0 ]; then
    red "$total_errors total error(s)"
    [ $CHECK_INTERNAL -eq 1 ] && echo "  Internal: $int_errors/$int_total"
    [ $CHECK_EXTERNAL -eq 1 ] && echo "  External: $ext_errors/$ext_total"
else
    grn "All links OK"
    [ $CHECK_INTERNAL -eq 1 ] && echo "  Internal: $int_total checked"
    [ $CHECK_EXTERNAL -eq 1 ] && echo "  External: $ext_total checked"
fi
echo "================================"

[ $total_errors -eq 0 ] && exit 0 || exit 1
