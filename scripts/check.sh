#!/usr/bin/env bash
# check.sh — Main entry point for 91ai documentation validation
# Usage: ./scripts/check.sh <command> [path ...]
#   lint       — Markdown format check
#   links      — Internal link check
#   links-ext  — Internal + external link check
#   badges     — Badge count verification
#   all        — Run lint + links + badges
#   all-full   — Run lint + links-ext + badges

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

run_script() {
    local name="$1"
    shift
    echo ""
    echo ">>>>>>>>>> Running: $name <<<<<<<<<<"
    echo ""
    bash "$SCRIPT_DIR/$name" "$@"
}

usage() {
    echo "Usage: $0 <command> [path ...]"
    echo ""
    echo "Commands:"
    echo "  lint       — Markdown format check"
    echo "  links      — Internal link check"
    echo "  links-ext  — Internal + external link check (slow)"
    echo "  badges     — Badge count verification"
    echo "  all        — Run lint + links + badges"
    echo "  all-full   — Run lint + links-ext + badges (slow)"
    echo ""
    echo "With no paths, lint and link checks use canonical Git-tracked Markdown."
    echo "Explicit Markdown files or directories can be passed to lint, links, or all."
    echo ""
    echo "Options for links-ext:"
    echo "  --timeout=N  Set curl timeout in seconds (default: 10)"
}

total_errors=0

case "${1:-}" in
    lint)
        run_script markdown-lint.sh "${@:2}" || total_errors=$((total_errors + 1))
        ;;
    links)
        run_script link-check.sh "${@:2}" || total_errors=$((total_errors + 1))
        ;;
    links-ext)
        run_script link-check.sh --external "${@:2}" || total_errors=$((total_errors + 1))
        ;;
    badges)
        run_script badge-check.sh "${@:2}" || total_errors=$((total_errors + 1))
        ;;
    all)
        run_script markdown-lint.sh "${@:2}" || total_errors=$((total_errors + 1))
        run_script link-check.sh "${@:2}" || total_errors=$((total_errors + 1))
        run_script badge-check.sh || total_errors=$((total_errors + 1))
        ;;
    all-full)
        run_script markdown-lint.sh || total_errors=$((total_errors + 1))
        run_script link-check.sh --external "${@:2}" || total_errors=$((total_errors + 1))
        run_script badge-check.sh || total_errors=$((total_errors + 1))
        ;;
    -h|--help|"")
        usage
        exit 0
        ;;
    *)
        echo "Unknown command: $1"
        usage
        exit 1
        ;;
esac

echo ""
echo "================================"
if [ $total_errors -gt 0 ]; then
    printf '\033[0;31m%s\033[0m\n' "$total_errors check(s) failed"
    exit 1
else
    printf '\033[0;32m%s\033[0m\n' "All checks passed"
    exit 0
fi
