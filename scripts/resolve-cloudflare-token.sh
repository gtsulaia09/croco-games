#!/usr/bin/env bash
# Resolves the Cloudflare API token for the production deploy from the CLOUDFLARE_API_TOKEN secret
# (passed in as RAW_TOKEN). It tolerates common paste mistakes: spaces or line breaks around the
# token, quotes or backticks, a "Bearer " prefix, or other words copied along with it. The token is
# checked with Cloudflare before any deploy step uses it; if Cloudflare rejects it, the reason is
# reported without ever printing the token. On success it is exported (masked) via $GITHUB_ENV.
set -euo pipefail

raw="${RAW_TOKEN:-}"
if [ -z "$raw" ]; then
  echo "::error::The CLOUDFLARE_API_TOKEN secret is missing. Add it: Settings > Secrets and variables > Actions > New repository secret."
  exit 1
fi

# Cloudflare user API tokens look like cfut_ followed by letters and digits: pick that out if present.
token=$(printf '%s' "$raw" | grep -oE 'cfut_[A-Za-z0-9_-]{20,}' | head -n 1 || true)
if [ -z "$token" ]; then
  # Other token formats: drop a "Bearer " prefix, whitespace, quotes and backticks.
  token=$(printf '%s' "$raw" | sed -E 's/^[[:space:]]*[Bb]earer[[:space:]]+//' | tr -d " \t\r\n\"'\`")
fi
if [ -n "$token" ]; then
  echo "::add-mask::$token"
fi

verify=$(curl -sS --max-time 30 -H "Authorization: Bearer ${token}" https://api.cloudflare.com/client/v4/user/tokens/verify || true)
if printf '%s' "$verify" | grep -q '"status":"active"'; then
  if [ "$token" != "$raw" ]; then
    echo "::warning::The CLOUDFLARE_API_TOKEN secret has extra characters around the token (spaces, quotes or other text); only the token part was used. Re-save the secret with just the token to remove this warning."
  fi
  echo "Cloudflare API token is valid."
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "CLOUDFLARE_API_TOKEN=$token" >> "$GITHUB_ENV"
  fi
  exit 0
fi

reason=$(printf '%s' "$verify" | grep -oE '"message":"[^"]*"' | head -n 1 | sed -E 's/^"message":"(.*)"$/\1/' || true)
hint="A Cloudflare API token starts with cfut_ followed by 48 letters and digits (53 characters in total)."
case "$token" in
  AIza*) hint="The saved value looks like the Firebase key (it starts with AIza), not the Cloudflare token." ;;
  ghp_* | gho_* | github_pat_*) hint="The saved value looks like a GitHub token, not the Cloudflare token." ;;
  cfut_*)
    if [ "${#token}" -ne 53 ]; then
      hint="The token in the secret is ${#token} characters long instead of 53, so it was probably copied incompletely."
    fi
    ;;
esac
echo "::error::Cloudflare rejected the CLOUDFLARE_API_TOKEN secret (${reason:-no answer from Cloudflare}; saved value is ${#raw} characters). ${hint} Fix it: Settings > Secrets and variables > Actions > CLOUDFLARE_API_TOKEN > pencil icon > paste only the token > Update secret."
exit 1
