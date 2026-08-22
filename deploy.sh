#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

vercel=(npx --yes vercel)
auth_args=()

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  auth_args=(--token "$VERCEL_TOKEN")
elif ! "${vercel[@]}" whoami >/dev/null 2>&1; then
  printf '%s\n' \
    'Vercel authentication is required. Run `npx vercel login` or set VERCEL_TOKEN.' \
    >&2
  exit 1
fi

exec "${vercel[@]}" deploy --prod "${auth_args[@]}" "$@"
