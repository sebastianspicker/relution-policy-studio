#!/bin/zsh

set -euo pipefail

repository_root=${0:A:h:h}
output_dir=$repository_root/docs/assets/screenshots
campusweave_origin=http://127.0.0.1:8766
chrome_binary=''

for candidate in \
  '/Applications/Chromium.app/Contents/MacOS/Chromium' \
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'; do
  if [[ -x $candidate ]]; then
    chrome_binary=$candidate
    break
  fi
done

if [[ -z $chrome_binary ]]; then
  print -u2 -- 'A Chromium-based browser is required to capture CampusWeave screenshots.'
  exit 1
fi

mkdir -p -- $output_dir
browser_state=$(mktemp -d /private/tmp/campusweave-screenshots.XXXXXX)
server_log=$(mktemp /private/tmp/campusweave-server.XXXXXX)

cleanup() {
  if [[ -n ${server_pid:-} ]]; then
    kill $server_pid 2>/dev/null || true
    wait $server_pid 2>/dev/null || true
  fi
  mv -- $browser_state ~/.Trash/ 2>/dev/null || true
  mv -- $server_log ~/.Trash/ 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd -- $repository_root
python3 -m campusweave >$server_log 2>&1 &
server_pid=$!

python3 - $campusweave_origin <<'PY'
import sys
import time
import urllib.request

origin = sys.argv[1]
for _ in range(80):
    try:
        with urllib.request.urlopen(f"{origin}/api/v1/health", timeout=0.25) as response:
            if response.status == 200:
                break
    except OSError:
        time.sleep(0.05)
else:
    raise SystemExit("CampusWeave did not become ready")
PY

capture() {
  local route=$1
  local filename=$2
  local size=$3
  local profile_dir=$browser_state/${filename:r}
  mkdir -p -- $profile_dir
  python3 - \
    $chrome_binary \
    $profile_dir \
    $size \
    $output_dir/$filename \
    $campusweave_origin/$route <<'PY'
import pathlib
import subprocess
import sys
import time

browser, profile_dir, size, output_name, url = sys.argv[1:]
output = pathlib.Path(output_name)
before = output.stat().st_mtime_ns if output.exists() else None
command = [
    browser,
    "--headless=new",
    "--disable-background-networking",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-default-browser-check",
    "--no-first-run",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=2500",
    "--force-device-scale-factor=1",
    f"--user-data-dir={profile_dir}",
    f"--window-size={size}",
    f"--screenshot={output}",
    url,
]
process = subprocess.Popen(
    command,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
try:
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if output.exists() and output.stat().st_mtime_ns != before:
            break
        if process.poll() is not None:
            raise SystemExit(f"Browser exited before capturing {output.name}")
        time.sleep(0.1)
    else:
        raise SystemExit(f"Timed out capturing {output.name}")
finally:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
PY
}

capture '#start' campusweave-overview.png 1440,1000
capture '#assignments' campusweave-assignments.png 1440,1000
capture '#assignments' campusweave-mobile.png 500,900

print -r -- "Captured CampusWeave screenshots in ${output_dir#$repository_root/}/"
