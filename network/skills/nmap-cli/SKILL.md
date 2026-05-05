---
name: nmap-cli
description: Run nmap from the shell to discover hosts, scan ports, detect services/OS, and run NSE scripts. Use whenever the user asks to invoke "nmap".
---

Binary: locate with `which nmap` (typical path: `/opt/homebrew/bin/nmap`). Confirm version with `nmap --version`. SYN scans, OS detection, UDP, raw-packet evasion, and `-A` require `sudo` — without root nmap silently downgrades to TCP connect (`-sT`) and skips raw-packet features. NSE scripts and data live under `/opt/homebrew/share/nmap/`; `nmap --script-updatedb` rebuilds the script index after any add/remove. Scanning hosts you do not own or operate is illegal in most jurisdictions; the evasion options assume an authorized engagement.

# Mental model

Each invocation flows through:

```
targets → host discovery → scan technique → port spec → service/OS detection → NSE → timing → output
```

- **Defaults without flags.** Top 1000 most common TCP ports (frequency-ordered, not range — a target's interesting port can sit outside the top 1000), `-T3` timing, SYN scan if running as root else TCP connect, ARP-based discovery on local Ethernet (always — even with `-Pn`, ARP still resolves MAC).
- **Privileged vs unprivileged is the central fork.** Raw sockets are required for `-sS`, `-sU`, `-O`, `-sN/-sF/-sX`, `-sA`, custom packet crafting, and every evasion knob. Unprivileged users get `-sT` and `-b` (FTP bounce) only — nmap downgrades silently rather than erroring.
- **`-A` is a bundle.** `-A` ≡ `-O -sV -sC --traceroute`. It triples or quadruples scan time on a single host because each component runs against every open port.
- **Output policy.** `-oA basename` writes Normal, XML, and Grepable in one pass — the typical default for any non-trivial scan. XML is the parseable target; Grepable suits `grep`/`awk`; any of the three can drive `--resume`.

# Minimal command

```sh
nmap target                                      # default: top 1000 TCP, T3
sudo nmap -sS -sV -O target                      # SYN + service version + OS (root)
nmap -sn 192.168.1.0/24                          # LAN host discovery (uses ARP)
sudo nmap -A -p- -oA scan_results target         # full audit, all ports, three output files
```

# Knobs by group

Targets:
- `-iL FILE` — read targets from file. `-iR N` — N random Internet targets. `-sL` — list-only (no probes sent, dry-run).
- `--exclude HOSTS` / `--excludefile FILE` — skip hosts. `--exclude-ports RANGE` — skip ports.
- `-6` — IPv6 (syntax otherwise unchanged).

Discovery:
- `-sn` — host discovery without port scan.
- `-Pn` — skip discovery, treat every host as up (off hosts still get a full port scan; pays off when targets filter ICMP, costs heavily on populated subnets).
- `-PS[ports]` / `-PA` / `-PU` / `-PE` / `-PP` / `-PM` — TCP SYN/ACK, UDP, ICMP echo/timestamp/netmask probes.
- `-n` / `-R` — never / always reverse-DNS. `--traceroute` — path tracing.
- `--disable-arp-ping` — opt out of automatic ARP on local Ethernet.

Scan technique:
- `-sS` (TCP SYN, half-open) / `-sT` (TCP connect, completes handshake) / `-sU` (UDP — kernel-rate-limited at the target side, ≈1 ICMP-unreachable/sec on Linux; pair with `--top-ports 20` or explicit `-p`).
- `-sA` (TCP ACK — distinguishes filtered from unfiltered, never reports open).
- `-sN` / `-sF` / `-sX` (Null / FIN / Xmas — stealth, OS-dependent reliability). `-sO` — IP protocol scan.

Ports:
- `-p RANGE` — `22,80,443`, `1-1024`, `U:53,T:80` (mixed protocols).
- `-p-` — all 65535. `-F` — top 100. `--top-ports N` — top N most common.

Detection:
- `-sV` — service/version probes (`--version-intensity 0–9`, `--version-light`, `--version-all`).
- `-O` — OS fingerprint (`--osscan-guess` aggressive, `--osscan-limit` skip unlikely targets).
- `-A` — `-O -sV -sC --traceroute` bundle.

NSE:
- `-sC` — `--script=default`.
- `--script=<list>` — comma-separated files, paths, or categories: `default`, `safe`, `discovery`, `vuln`, `auth`, `brute`, `intrusive`, `exploit`, `dos`, `malware`, `broadcast`. `vuln` runs ~100 scripts per host — tens of minutes on default timing.
- `--script-args=k=v,…` / `--script-args-file=FILE`.
- `--script-trace` — log every script's network exchange.

Timing & performance:
- `-T0…-T5` — paranoid (5 min between probes) → insane (may miss ports). Default `-T3`. `-T4` is usually safe on reliable networks.
- `--min-rate N` / `--max-rate N` — pps floor/ceiling.
- `--host-timeout TIME` — abandon a target after duration. `--max-retries N` — retransmission cap.
- `--scan-delay TIME` / `--max-scan-delay TIME` — per-probe pacing (different axis from `-T`).
- `--min-hostgroup N` / `--max-hostgroup N` — parallel host group sizes.

Evasion (assumes authorized engagement):
- `-f` / `--mtu N` — fragment packets.
- `-D decoy1,decoy2,ME,…` — cloak with decoy sources (`RND:5,ME` mixes 5 random plus self).
- `-S IP` — spoof source. `-e IFACE` — pin egress interface.
- `-g PORT` / `--source-port PORT` — fixed source port (e.g. `53`).
- `--proxies socks4://host:port,…` — relay (TCP only).
- `--spoof-mac MAC|prefix|vendor` — MAC override.
- `--data <hex>` / `--data-string <ascii>` / `--data-length N` — pad/inject packet payload.
- `--ttl N` / `--ip-options OPTS` / `--badsum` — packet header tweaks.

Output:
- `-oN file` / `-oX file` / `-oG file` / `-oA basename` — Normal / XML / Grepable / all three.
- `--open` — only ports in open or possibly-open states.
- `--reason` — show why a port is in its state (`syn-ack`, `no-response`, `host-unreach`).
- `-v` / `-vv` — verbosity. `-d` / `-dd` — debug.
- `--packet-trace` — log every probe sent/received.
- `--resume FILE` — continue an aborted scan from any of `-oN`/`-oG`/`-oX` output files.

# Read it locally

```sh
nmap --help                                  # one-page summary
man nmap                                     # comprehensive (≈3000 lines)
nmap --script-help "vuln"                    # contents of a category
nmap --script-help ssl-enum-ciphers          # what one script does
nmap --iflist                                # interfaces and routes nmap will use
ls /opt/homebrew/share/nmap/scripts | wc -l  # NSE scripts available locally
```

# Long-running calls

Full-port scans, `/24` networks with `-A`, or `--script=vuln` runs take tens of minutes to hours. nmap has no signal-based status; status comes from the terminal or the periodic flag.

- **Foreground status keys** — any keypress during a scan prints a `Stats:` line with elapsed time, hosts completed, percent done, and ETC. Letter keys also adjust output: `v`/`V` verbosity, `d`/`D` debug, `p`/`P` packet trace, `?` shows the runtime help.
- **Fire-and-forget** — `Bash` with `run_in_background: true`, plus `--noninteractive` so nmap doesn't try to attach to the absent terminal. Add `--stats-every 30s` so the log file gets a status line every interval. Redirect both streams (`nmap … > /tmp/nmap.log 2>&1`).
- **Resume** — `nmap --resume <output-file>` continues an aborted scan from the saved Normal, Grepable, or XML output; the original command line is recorded in the file header, so no other arguments are passed.

