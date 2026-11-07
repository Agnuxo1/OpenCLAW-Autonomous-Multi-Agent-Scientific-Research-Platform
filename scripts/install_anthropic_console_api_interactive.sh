#!/usr/bin/env bash
# Install and test an Anthropic Console API key. No Claude.ai login or OAuth.
# The secret is entered in the terminal, never in command arguments or logs.
set -euo pipefail
umask 077

if [[ ! -t 0 ]]; then
  echo "ERROR: An interactive SSH terminal is required (-t)." >&2
  exit 2
fi

BASE="$HOME/.openclaw"
SWARM="/mnt/datos/proyectos/claude-fable-competition-swarm-20261101"
if [[ ! -f "$SWARM/runner.py" ]]; then
  echo "ERROR: The existing Server-IA competition swarm is missing." >&2
  exit 3
fi

echo "Authenticating with Claude Platform API only; no personal session used."
read -rs -p "Paste the Anthropic Console API key (hidden): " API_KEY
printf '\n' >&2
if [[ ! "$API_KEY" =~ ^sk-ant-(usr-|api)[a-zA-Z0-9_-]{30,}$ ]]; then
  echo "Invalid API key shape; no credentials were modified." >&2
  unset API_KEY
  exit 4
fi

echo "Testing the free /v1/models endpoint with x-api-key..."
set +e
printf '%s' "$API_KEY" | python3 -c '
import json
import sys
import urllib.error
import urllib.request

key = sys.stdin.read().strip()
req = urllib.request.Request(
    "https://api.anthropic.com/v1/models?limit=1",
    headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
    method="GET",
)
try:
    with urllib.request.urlopen(req, timeout=20) as response:
        obj = json.load(response)
        if response.status != 200 or "data" not in obj:
            raise ValueError("Unexpected API response")
        print("API authentication succeeded (HTTP 200; no inference).")
except urllib.error.HTTPError as err:
    print("API authentication failed: HTTP " + str(err.code), file=sys.stderr)
    sys.exit(1)
except (OSError, TimeoutError, ValueError):
    print("API authentication could not be confirmed.", file=sys.stderr)
    sys.exit(1)
'
STATUS=$?
set -e
if [[ $STATUS -ne 0 ]]; then
  unset API_KEY
  echo "Not installed; no changes to existing agents." >&2
  exit 5
fi

mkdir -p -m 700 "$BASE" "$SWARM/secrets"
chmod 700 "$SWARM/secrets"

printf '%s' "$API_KEY" | python3 -c '
import os
from pathlib import Path
import sys
import tempfile

key = sys.stdin.read().strip()
if not key or "\n" in key or "\r" in key:
    raise ValueError("Invalid credential")
base = Path.home() / ".openclaw"
env_file = base / ".env"
agent_secret = Path("/mnt/datos/proyectos/claude-fable-competition-swarm-20261101/secrets/anthropic.key")
previous = env_file.read_text(encoding="utf-8") if env_file.exists() else ""
lines = [s for s in previous.splitlines() if not s.strip().startswith("ANTHROPIC_API_KEY=")]
lines.append("ANTHROPIC_API_KEY=" + key)

def atomic_private_write(path, contents):
    fd, tmp = tempfile.mkstemp(prefix=".key-setup-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

atomic_private_write(env_file, "\n".join(lines) + "\n")
atomic_private_write(agent_secret, key)
print("Credential saved privately for OpenClaw and the competition swarm.")
'
unset API_KEY

systemctl --user restart openclaw-gateway.service
echo "OpenClaw has been restarted with the API key installed."
echo "Existing competition timer will discover the key at its next check."
echo "Verify promotional credit balance and disable any paid auto-reload."
