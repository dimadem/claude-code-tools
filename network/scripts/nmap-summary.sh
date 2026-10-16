#!/usr/bin/env bash
# Print a short summary of nmap XML output: one line per port, short NSE output.
#
# usage: nmap-summary.sh [--all] [--lines N] [--json] FILE.xml|-
#   FILE.xml   nmap -oX output; "-" reads stdin (nmap ... -oX - | nmap-summary.sh -)
#   --all      also show closed and filtered ports (default: open, open|filtered, unfiltered)
#   --lines N  max lines of output per NSE script (default 5, 0 = no script output)
#   --json     print JSON (same filters) for jq or nu:
#              ... --json scan.xml | nu --stdin -c 'from json | get hosts | ...'
#
# A file from a scan that is still running or that stopped is read up to the
# last full <host> element.
set -euo pipefail

usage() {
  echo "usage: nmap-summary.sh [--all] [--lines N] [--json] FILE.xml|-" >&2
  exit 2
}

all=0
lines=5
json=0
while [ $# -gt 0 ]; do
  case "$1" in
    --all) all=1; shift ;;
    --json) json=1; shift ;;
    --lines) [ $# -ge 2 ] || usage; lines=$2; shift 2 ;;
    --) shift; break ;;
    -?*) usage ;;
    *) break ;;
  esac
done
[ $# -eq 1 ] || usage
case "$lines" in ''|*[!0-9]*) usage ;; esac
[ "$1" = - ] || [ -r "$1" ] || { echo "error: cannot read $1" >&2; exit 2; }

prog=$(cat <<'EOF'
import json, re, sys
import xml.etree.ElementTree as ET

path, show_all, max_lines, as_json = sys.argv[1], sys.argv[2] == "1", int(sys.argv[3]), sys.argv[4] == "1"
data = sys.stdin.read() if path == "-" else open(path, encoding="utf-8", errors="replace").read()

partial = False
runs = data.count("<nmaprun")
try:
    root = ET.fromstring(data)
except ET.ParseError:
    # Scan running or stopped, or two runs after --resume: keep the full <host>
    # elements of all runs and the <runstats> of a finished last run.
    m = re.search(r"<nmaprun\b[^>]*>", data)
    if not m:
        sys.exit("error: no full <nmaprun> start tag in the input (the scan just started?)")
    hosts = re.findall(r"<host[\s>].*?</host>", data, re.S)
    last_run = data[data.rfind("<nmaprun"):]
    stats = re.search(r"<runstats>.*?</runstats>", last_run, re.S)
    done = stats is not None and "</nmaprun>" in last_run
    try:
        root = ET.fromstring(m.group(0) + "".join(hosts) + (stats.group(0) if done else "") + "</nmaprun>")
    except ET.ParseError as e:
        sys.exit(f"error: cannot parse the XML: {e}")
    partial = not done

SHOWN = {"open", "open|filtered", "unfiltered"}
errors = 0

def scripts_of(parent):
    """NSE output without failed scripts, cut to max_lines lines."""
    global errors
    out = []
    for s in parent.findall("script"):
        text = (s.get("output") or "").strip("\n")
        if text.startswith("ERROR: Script execution failed"):
            errors += 1
            continue
        if max_lines == 0:
            continue
        body = [l.strip() for l in text.splitlines() if l.strip()]
        if s.get("id") == "fingerprint-strings":
            body = [f"{len(body)} lines (service not identified)"]
        elif len(body) > max_lines:
            body = body[:max_lines] + [f"... {len(body) - max_lines} more lines"]
        out.append({"id": s.get("id"), "lines": body})
    return out

# Collect the data, then print it as text or JSON.
hosts, up, down, listed = [], 0, 0, 0
for h in root.iter("host"):
    status = h.find("status")
    state = status.get("state") if status is not None else "unknown"
    if state == "unknown":
        listed += 1
        continue
    if state != "up":
        down += 1
        continue
    up += 1
    mac = next((a for a in h.findall("address") if a.get("addrtype") == "mac"), None)
    hn = h.findall("hostnames/hostname")
    host = {
        "addr": " ".join(a.get("addr") for a in h.findall("address") if a.get("addrtype") != "mac"),
        "names": [n.get("name") for n in hn if n.get("type") == "user"] or [n.get("name") for n in hn],
        "mac": mac.get("addr") if mac is not None else None,
        "vendor": mac.get("vendor") if mac is not None else None,
        "ports": [], "hidden": {}, "os": None, "scripts": [],
    }
    hidden = host["hidden"]
    for ep in h.findall("ports/extraports"):
        hidden[ep.get("state")] = hidden.get(ep.get("state"), 0) + int(ep.get("count", 0))
    for p in h.findall("ports/port"):
        st = p.find("state")
        if not show_all and st.get("state") not in SHOWN:
            hidden[st.get("state")] = hidden.get(st.get("state"), 0) + 1
            continue
        svc = p.find("service")
        svc = svc if svc is not None else ET.Element("service")
        host["ports"].append({
            "port": int(p.get("portid")), "proto": p.get("protocol"),
            "state": st.get("state"), "reason": st.get("reason", ""),
            "service": svc.get("name", ""), "tunnel": svc.get("tunnel", ""),
            "guessed": svc.get("method") == "table",
            "version": " ".join(filter(None, (svc.get(k) for k in ("product", "version", "extrainfo")))),
            "scripts": scripts_of(p),
        })
    host["scanned"] = bool(h.findall("ports/port") or hidden)
    os_match = h.find("os/osmatch")
    if os_match is not None:
        host["os"] = {"name": os_match.get("name"), "accuracy": int(os_match.get("accuracy", 0))}
    hs = h.find("hostscript")
    if hs is not None:
        host["scripts"] = scripts_of(hs)
    hosts.append(host)

stats = root.find("runstats/finished")
done = not partial and stats is not None
summary = {
    "args": root.get("args", "nmap"), "status": "done" if done else "partial", "runs": runs,
    "elapsed": float(stats.get("elapsed")) if done else None, "exit": stats.get("exit") if done else None,
    "up": up, "down": down, "listed": listed, "nse_errors": errors, "hosts": hosts,
}

if as_json:
    json.dump(summary, sys.stdout, indent=1)
    print()
    sys.exit()

def print_scripts(scripts, indent):
    for s in scripts:
        if len(s["lines"]) <= 1:
            print(f"{indent}{s['id']}: {s['lines'][0] if s['lines'] else ''}")
        else:
            print(f"{indent}{s['id']}:")
            for l in s["lines"]:
                print(f"{indent}  {l}")

print(f"# {summary['args']}")
for host in hosts:
    line = f"\n## {host['addr']}"
    if host["names"]:
        line += f" ({','.join(host['names'])})"
    if host["mac"]:
        line += f" mac={host['mac']}" + (f" {host['vendor']}" if host["vendor"] else "")
    print(line)
    for p in host["ports"]:
        name = (f"{p['tunnel']}/" if p["tunnel"] else "") + p["service"] + ("?" if p["guessed"] else "")
        port = f"{p['port']}/{p['proto']}"
        print(f"{port:<10} {p['state']:<14} {name:<16} {p['version']}".rstrip()
              + (f"  [{p['reason']}]" if p["reason"] else ""))
        print_scripts(p["scripts"], "    ")
    if not host["scanned"]:
        print("no ports scanned")
    if host["hidden"]:
        print("not shown: " + ", ".join(f"{n} {k}" for k, n in sorted(host["hidden"].items())))
    if host["os"]:
        print(f"os: {host['os']['name']} ({host['os']['accuracy']}%)")
    print_scripts(host["scripts"], "  ")

print()
if listed:
    print(f"# listed, not scanned: {listed} (-sL)")
if done:
    resumed = f" after --resume ({runs} runs)" if runs > 1 else ""
    print(f"# done{resumed}: {up} up, {down} down, last run {summary['elapsed']}s, exit={summary['exit']}")
else:
    print(f"# partial: {up} up, {down} down so far (scan running or stopped)")
if errors:
    print(f"# NSE errors not shown: {errors} (use -d to see them)")
print("# service with '?' = name from port number only; use -sV for evidence")
EOF
)

exec python3 -I -c "$prog" "$1" "$all" "$lines" "$json"
