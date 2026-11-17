#!/usr/bin/env bash
# Checks that the site is up and serving a real Cadence build.
#
#   scripts/check-health.sh https://owner.github.io/repo/
#
# Retries before declaring the site down, so one slow response is not an
# outage. Prints a one-line verdict; exits 0 when up and 1 when down.
set -uo pipefail

base="${1:?Usage: check-health.sh <site url>}"
url="${base%/}/health.json"
attempts="${ATTEMPTS:-3}"
delay="${RETRY_DELAY:-20}"
reason=""

for attempt in $(seq 1 "$attempts"); do
  body="$(curl --silent --show-error --location --max-time 15 \
    --write-out $'\n%{http_code} %{time_total}' "$url?t=$(date +%s)" 2>&1)"
  status_line="${body##*$'\n'}"
  json="${body%$'\n'*}"
  code="${status_line%% *}"
  seconds="${status_line##* }"

  if [ "$code" = "200" ] && printf '%s' "$json" | grep -q '"status": *"ok"'; then
    commit="$(printf '%s' "$json" | sed -n 's/.*"commit": *"\([^"]*\)".*/\1/p' | head -1)"
    echo "UP: $url answered in ${seconds}s (commit ${commit:0:7}, attempt $attempt)"
    exit 0
  fi

  if [ "$code" = "000" ]; then
    reason="no response (${json//$'\n'/ })"
  elif [ "$code" = "200" ]; then
    reason="HTTP 200 but the body is not a Cadence health report"
  else
    reason="HTTP $code"
  fi
  echo "Attempt $attempt of $attempts failed: $reason" >&2
  [ "$attempt" -lt "$attempts" ] && sleep "$delay"
done

echo "DOWN: $url — $reason"
exit 1
