---
name: wireshark-cli
description: Run wireshark from the shell to launch the GUI with a pre-configured capture, read a pcap, apply filters, or kick off a long-running ring-buffer capture. Use whenever the user asks to invoke "wireshark".
---

Binary: locate with `which wireshark` (typical path on macOS: `/Applications/Wireshark.app/Contents/MacOS/wireshark` — `wireshark` in `$PATH` is usually a Homebrew-cask shim). Confirm version with `wireshark --version`. **wireshark is the GUI**: every CLI invocation still spins up the Qt window. For headless capture/analysis use the siblings `tshark` (full dissection, text output) and `dumpcap` (capture only, no dissection — fastest, what wireshark/tshark actually use under the hood). Live capture needs raw-socket privileges — on macOS via the ChmodBPF installer (group `access_bpf` on `/dev/bpf*`), on Linux via `setcap cap_net_raw,cap_net_admin=eip` on `dumpcap` or membership in `wireshark` group. Without permissions the interface list (`-D`) is empty and `-k` fails with a permission error.

# Mental model

Each invocation flows through:

```
interface | infile → capture filter (BPF, kernel) → dissection → display filter (post-process) → UI/output
```

- **Defaults without flags.** No capture starts, no file loaded — just the empty GUI. `-k` is what triggers capture immediately; `-i` alone only preselects the interface. Capture defaults: first non-loopback interface, promiscuous on, snaplen = max, 2 MiB kernel buffer, pcapng output, infinite duration.
- **Two filter syntaxes — do not confuse them.** `-f` is a **capture filter** in **libpcap/BPF** syntax (`tcp port 443 and host 1.2.3.4`); kernel-level, runs during capture, **dropped packets are gone forever**. `-Y` / `-R` are **display filters** in **wireshark-filter(4)** syntax (`http.request.method == "GET" && tcp.stream eq 3`); applied after dissection, rich grammar, reversible. `-Y` is dynamic (toggle in GUI); `-R` is "read filter" applied once at load and requires reload to change. Mixing the two syntaxes is the #1 wireshark CLI mistake.
- **GUI vs CLI fork.** `wireshark -k -w file.pcapng -i en0` *does* run a capture, but the window still opens. For true headless: `tshark -i en0 -w file.pcapng` (same flags work) or `dumpcap -i en0 -w file.pcapng -b filesize:100000 -b files:10` (no dissection overhead, best for sustained high-rate capture). Reach for `wireshark` from the shell only when you want the GUI to come up *primed* with a state.
- **Output policy.** Default output format is `pcapng` — supports nanosecond timestamps, per-interface metadata, capture comments. `-F` switches the type; `-F ""` (empty) lists supported types. `-w -` streams to stdout (only meaningful with `tshark`/`dumpcap`; wireshark's GUI ignores stdout). Ring-buffer mode (`-b`) writes a sequence of files and is the only way to capture continuously without unbounded disk growth.

# Minimal command

```sh
wireshark                                              # open empty GUI
wireshark -r capture.pcapng                            # load a pcap into GUI
wireshark -r capture.pcapng -Y 'http.request'          # load + preset display filter
wireshark -k -i en0 -f 'tcp port 443'                  # launch GUI, start capturing immediately, BPF filter
wireshark -k -i en0 -w /tmp/cap.pcapng \
          -b filesize:102400 -b files:10               # ring buffer: 10 × 100 MB files
```

# Knobs by group

Capture interface:
- `-D` / `--list-interfaces` — print interfaces and exit (sanity-check permissions first).
- `-i IFACE` — name or index from `-D`. Repeatable for multi-interface capture.
- `-L` / `--list-data-link-types` — link types available on `-i IFACE`. `-y TYPE` selects one (e.g., `EN10MB`, `IEEE802_11_RADIO`).
- `-p` / `--no-promiscuous-mode` — disable promisc (default is **on**; OS may still mute promisc on a managed interface).
- `-I` / `--monitor-mode` — WiFi monitor mode (hardware-dependent, captures 802.11 management/control frames; requires a card+driver that supports it).
- `-s N` / `--snapshot-length N` — truncate packets to N bytes. Default is full packet; useful when only headers matter and disk is a concern.
- `-B N` / `--buffer-size N` — kernel ring buffer in MiB. Raise above 2 on high-rate links to avoid `dropped by kernel` losses.
- `--time-stamp-type TYPE` — `host`, `adapter`, `adapter_unsynced` (depends on driver). `--list-time-stamp-types` to see options.

Capture filter (BPF, kernel-side):
- `-f 'EXPR'` — libpcap syntax. Primitives: `host`, `net`, `port`, `portrange`, `tcp`, `udp`, `icmp`, `vlan`, `ether host`. Combinators: `and`, `or`, `not`, parens. **No protocol-field access** (can't filter on HTTP method here — that's a display filter).

Capture stop & rotation:
- `-c N` — stop after N packets.
- `-a duration:N | filesize:N | files:N | packets:N` — autostop (`-a` repeatable; first hit wins).
- `-b duration:N | filesize:N | files:N | packets:N | interval:N` — ring buffer; switch files on condition. `files:N` caps total count (oldest deleted). `interval:N` aligns rotation to wall-clock multiples of N seconds — useful for hour-aligned forensics.
- `-k` — start capture immediately on launch. Without `-k`, `-i`/`-f` only preselect the dialog.

Input file:
- `-r FILE` — read pcap/pcapng. **No pipes or stdin** — that's a `tshark` capability, not wireshark's.

Processing / dissection:
- `-Y 'EXPR'` / `--display-filter` — wireshark display-filter syntax; dynamic.
- `-R 'EXPR'` / `--read-filter` — apply once at load; requires `-2` in `tshark`, but in `wireshark` is implicit on file open. Filtered-out packets are not re-dissectable without reload.
- `-n` — disable **all** name resolution. `-N FLAGS` enables specific ones: `m` MAC, `t` transport, `n` network, `N` external (DNS), `d` use captured DNS, `v` VLAN, `g` GeoIP, `s` snmp. Combine: `-N mNd`.
- `-d 'tcp.port==8888,http'` — "Decode As": tell the dissector a non-standard port carries a known protocol. Repeatable.
- `--enable-protocol NAME` / `--disable-protocol NAME` — toggle one dissector.
- `--only-protocols a,b,c` — disable everything except this list.
- `--disable-all-protocols` — start from zero; combine with `--enable-protocol` for surgical setups.
- `--enable-heuristic SHORTNAME` / `--disable-heuristic SHORTNAME` — toggle a heuristic dissector (e.g., `http_tcp`).

User interface / view state:
- `-C PROFILE` — start with named configuration profile (filters, columns, coloring rules live per profile).
- `-H` — hide the live capture-info dialog.
- `-g N` — after `-r`, scroll to packet #N.
- `-J 'EXPR'` — jump to first packet matching display filter (`-j` reverses search direction).
- `-t FMT` — timestamp display: `r` (rel. to first, default), `a` (abs), `ad` (abs+date), `d` (delta prev), `dd` (delta displayed prev), `e` (epoch), `u` (UTC), `ud`, `udoy`. Suffix `.N` sets decimal precision.
- `-u s|hms` — seconds vs HH:MM:SS for the seconds column.
- `-X key:value` — extension options. Common: `lua_script:/path/to.lua`, `read_format:Pcapng`, `stdin_descr:STR`.
- `-z STAT` — open a statistics window on launch (e.g., `-z io,stat,1`, `-z conv,tcp`, `-z http,tree`). See `man wireshark` → `-z`.
- `-o name:value` — override preference for this run (e.g., `-o tcp.relative_sequence_numbers:TRUE`, `-o tls.keylog_file:/path/sslkeys.log` to decrypt TLS with a key-log).

Output:
- `-w FILE` — write capture here (`-` is stdout but ignored by GUI).
- `-F TYPE` — output file type (`pcapng`, `pcap`, `nsecpcap`, `k12text`, …). `-F ""` lists all.
- `--capture-comment STR` — embed a comment block in the pcapng (`pcapng` only).
- `--temp-dir DIR` — relocate the temp file used during live capture (default goes to `$TMPDIR`).

Logging / diagnostics:
- `--log-level critical|warning|message|info|debug|noisy` — main log verbosity.
- `--log-domains LIST` / `--log-debug LIST` / `--log-noisy LIST` — per-domain control; prefix `!` excludes. Domains: `Main`, `Capture`, `Capchild`, `WSUtil`, `Epan`, `Qtui`, dissector-specific.
- `--log-file PATH` — mirror log to file.

Miscellaneous:
- `-P persconf:PATH` / `-P persdata:PATH` — override personal config / data dirs.
- `-K KEYTAB` — Kerberos keytab for decryption.
- `--fullscreen` — start maximized.

# Read it locally

```sh
wireshark --help                                       # one-page CLI summary
man wireshark                                          # full GUI reference
man wireshark-filter                                   # display-filter grammar (the one you'll need most)
man pcap-filter                                        # capture-filter (BPF) grammar
man tshark                                             # the headless cousin — shares most flags
man dumpcap                                            # bare-bones capture
wireshark -D                                           # interfaces visible to this user
wireshark -L -i en0                                    # link-layer types on en0
tshark -G fields | head                                # every dissector field (~250k lines) for -Y
tshark -G protocols                                    # registered protocol short-names for --enable/--disable
```

# Online references (curl-friendly)

Upstream AsciiDoc man-page sources when the local man page is missing or stale:

```sh
BASE=https://raw.githubusercontent.com/wireshark/wireshark/master/doc/man_pages

curl -sS $BASE/wireshark.adoc          # GUI flags
curl -sS $BASE/tshark.adoc             # headless CLI — has the -z catalog
curl -sS $BASE/dumpcap.adoc            # capture-only sibling
curl -sS $BASE/wireshark-filter.adoc   # display-filter grammar (-Y / -R)
curl -sS $BASE/capinfos.adoc           # pcap metadata / drop diagnosis
curl -sS $BASE/editcap.adoc            # slice / time-shift / dedupe pcaps
curl -sS $BASE/mergecap.adoc           # combine pcaps
curl -sS $BASE/text2pcap.adoc          # rebuild pcap from hex dump
curl -sS $BASE/rawshark.adoc           # raw packets in → fields out
curl -sS $BASE/reordercap.adoc         # sort by timestamp
curl -sS $BASE/randpkt.adoc            # generate fuzzed pcaps
curl -sS $BASE/extcap.adoc             # external capture plugin spec
```

# Long-running calls

Continuous packet capture runs until killed or autostop fires. Without ring buffering, a single output file grows unbounded.

- **Headless preferred.** For multi-hour captures, prefer `dumpcap` (no dissection, lowest overhead, lowest drop rate). `wireshark -k` keeps the GUI alive and dissects in real time — it can drop packets under load.
- **Ring buffer pattern.** `dumpcap -i en0 -b filesize:102400 -b files:24 -w /var/log/pcap/cap.pcapng` keeps the last 24 × 100 MB files. Open any individual file in wireshark while capture continues.
- **Background launch.** `Bash` with `run_in_background: true`. wireshark itself has no `--noninteractive`; for fire-and-forget use `dumpcap` or `tshark` and redirect `> /tmp/cap.log 2>&1`. Stop with `SIGINT` — both write a clean pcapng trailer on SIGINT, but **SIGKILL leaves a truncated file**.
- **Drop diagnosis.** After capture: `capinfos capture.pcapng` shows packet count, duration, drops, average rate. If `dropped by kernel` is non-zero, raise `-B`, lower the filter scope, or move to `dumpcap`.
- **No `--resume`.** wireshark has no scan-resume primitive. Use ring buffer + autostop + file naming (`-b filesize:…`) so each segment is self-contained and a crash loses at most one segment.
