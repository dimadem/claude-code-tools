---
name: nmap-cli
description: Run nmap from the shell to find hosts, scan ports, identify services and operating systems, and run NSE scripts. Use when the user tells you to run "nmap". Also use it when the user tells you to find open ports, the devices on a network, the service versions or the TLS ciphers of a host, and does not write "nmap".
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/nmap-summary.sh *)
---

Binary: `which nmap` (Homebrew on macOS: `/opt/homebrew/bin/nmap`, Linux: `/usr/bin/nmap`). Version: `nmap --version`.

The NSE scripts and the data files are in `share/nmap/` near the binary (for example `/opt/homebrew/share/nmap/`). After you add or remove a script, run `nmap --script-updatedb`.

Scan only the hosts that you have permission to scan. Use the evasion flags only when you have written permission for the scan.

# Mental model

The main stages of a scan:

```
targets → host discovery → port scan → service/OS detection → NSE → output
```

- Defaults: Without flags, nmap scans the 1000 most common TCP ports with `-T3` timing. Thus an important port can be not in the scan. The sequence of the ports is random.
- Root: Without root, the default scan is `-sT` (TCP connect). You must have root for `-sS`, `-sU`, `-sA`, `-sN`, `-sF`, `-sX`, `-sO`, `-O` and `-f`. Without root, nmap stops with the error `QUITTING!`.
- Root and `-A`: Without root, `-A` does not do OS detection and traceroute, and nmap does not show an error.
- Root and `-D`: Without root, nmap ignores `-D` and shows `These options will not be honored`.
- Capabilities: If nmap has raw socket access without root (for example, Linux `cap_net_raw`), put `--privileged` before the other flags.
- `-A`: This flag is the same as `-O -sV -sC --traceroute`. With `-A`, a scan takes much more time.
- Host discovery: Without root, `-sn` sends TCP connect probes to ports 80 and 443. With root on a local Ethernet network, nmap uses ARP, also with `-Pn`. To stop ARP, use `--disable-arp-ping`.
- Output: `-oA <basename>` writes the normal, XML and grepable output in one scan. `-oX -` writes XML to stdout. Use XML as input for a script.

# Procedure

1. Make sure that the user has permission to scan the targets. For a target that is not on the local network, get approval from the user.
2. Find the hosts that are up with `-sn`, or scan a small port list with `--top-ports 100`.
3. Run `-sV` only on the open ports from step 2.
4. Read the result with `nmap-summary.sh`. The normal output is long and uses many tokens.
5. If a scan can run for more than 2 minutes, use `nmap-run.sh` with `run_in_background: true`. For example, use it for `-p-`, `-sV` on a `/24` network, `-A` or `--script=vuln`.
6. If the scan must have root, tell the user to type `! sudo -v`. Then use `sudo -n nmap` or `nmap-run.sh --sudo`. You cannot type a sudo password.

# Minimal command

```sh
nmap -n --top-ports 100 -oX - target | ${CLAUDE_PLUGIN_ROOT}/scripts/nmap-summary.sh -        # quick look, no root
nmap -n -sV -p 22,80,443 -oX - target | ${CLAUDE_PLUGIN_ROOT}/scripts/nmap-summary.sh -       # versions on known ports
sudo -n nmap -n -sn -oX - 192.168.1.0/24 | ${CLAUDE_PLUGIN_ROOT}/scripts/nmap-summary.sh -    # LAN hosts with ARP (after ! sudo -v)
${CLAUDE_PLUGIN_ROOT}/scripts/nmap-run.sh --sudo -- -sS -sV -O -p- target                   # full audit in the background
```

# Scripts

`${CLAUDE_PLUGIN_ROOT}/scripts/nmap-summary.sh FILE.xml`: Show a short summary of the XML output. The summary has one line for each port, the OS and the NSE output. Use `-` for stdin. Use it in place of the normal output.

Flags of `nmap-summary.sh`:
- `--all`: Show also the ports with the state `closed` or `filtered`.
- `--lines N`: Show a maximum of N lines for each NSE script. The default is 5. `0` gives no NSE output.
- `--json`: Show the same data as JSON. Use it with `jq` to filter many hosts. To show a table in `nu`, pipe the JSON to `nu --stdin -c 'from json | get hosts | each {|h| $h.ports | insert addr $h.addr} | flatten | select addr port proto state service version'`.

`${CLAUDE_PLUGIN_ROOT}/scripts/nmap-run.sh -- NMAP_ARGS`: Run a long scan. The script adds `--noninteractive`, `--stats-every 30s` and `-oA DIR/scan`. At the end, it shows the summary and `rc=`.

Flags of `nmap-run.sh`:
- `--sudo`: Run nmap with `sudo -n`. If sudo must have a password, the script stops. Then tell the user to type `! sudo -v`.
- `--dir DIR`, `--stats TIME`: Set the directory and the time between status lines. Do not add `-o` flags to `NMAP_ARGS`.

# Flags by group

Targets:
- `-iL FILE`: Read the targets from a file. nmap also scans the targets on the command line.
- `-n -sL`: Show the list of targets. nmap does not send packets to the targets. Without `-n`, nmap does reverse DNS.
- `--exclude HOSTS`, `--excludefile FILE`: Do not scan these hosts.
- `--exclude-ports RANGE`: Do not scan these ports.
- `--resolve-all`: Scan all addresses of a hostname. The default is the first address only.
- `-6`: Scan IPv6 addresses. The syntax of the other flags does not change.

Host discovery:
- `-sn`: Find the hosts that are up. Do not scan ports.
- `-Pn`: Do not do host discovery. nmap scans each target as a host that is up. Use it when the targets block ICMP. On a large network with few hosts, the scan is very slow.
- `-PS[ports]`, `-PA`, `-PU`, `-PE`, `-PP`, `-PM`: Send TCP SYN, TCP ACK, UDP, ICMP echo, timestamp or netmask probes.
- `-n`, `-R`: Never or always do reverse DNS.
- `--traceroute`: Find the path to each host.
- `--discovery-ignore-rst`: Ignore RST replies. Use it when a firewall sends RST for each address.

Scan technique:
- `-sS`: TCP SYN scan. nmap does not open the full TCP connection.
- `-sT`: TCP connect scan. nmap opens the full TCP connection.
- `-sU`: UDP scan. Many hosts send a small number of ICMP port unreachable messages each second, thus a UDP scan is slow. Use it with `--top-ports 20` or `-p`.
- `-sA`: TCP ACK scan. It shows the port state `filtered` or `unfiltered`. It does not show the state `open`.
- `-sN`, `-sF`, `-sX`: TCP Null, FIN and Xmas scans. The result is different for each operating system.

Ports:
- `-p RANGE`: For example `22,80,443` or `1-1024`.
- `-sU -sS -p U:53,T:80`: Scan UDP and TCP ports in one scan. The prefixes `U:` and `T:` do not start a UDP or TCP scan.
- `-p-`: All 65535 ports.
- `-F`: The 100 most common ports.
- `--top-ports N`: The N most common ports.
- `-r`: Scan the ports in sequence.

Detection:
- `-sV`: Find the service and version on each open port. `--version-intensity 0-9` sets which probes nmap sends. A high value sends also the rare probes. `--version-light` is 2, `--version-all` is 9.
- `-O`: Find the operating system. `--osscan-guess` gives more guesses. `--osscan-limit` examines only the hosts with one or more open and closed TCP ports.

NSE:
- `-sC`: The same as `--script=default`.
- `--script=<list>`: Run scripts. The list contains files, directories, categories or expressions, for example `"default and safe"`.
- Main categories: `default`, `safe`, `discovery`, `version`, `vuln`, `auth`, `brute`, `intrusive`, `exploit`, `dos`, `external`, `broadcast`. Scripts in `external` send data to external services.
- `vuln`: This category has approximately 100 scripts. Set `--script-timeout` for these scripts.
- `--script-args=k=v,...`, `--script-args-file=FILE`: Give arguments to the scripts.
- `--script-trace`: Show all data that the scripts send and receive.
- `--script-timeout TIME`: Stop each script after this time. `0` gives no limit.

Timing and performance:
- `TIME`: A number of seconds, or a number with `ms`, `s`, `m` or `h`, for example `30m`.
- `-T0` to `-T5`: The timing template. `-T0` waits 5 minutes between probes. `-T5` can miss ports. The default is `-T3`. On a reliable network, `-T4` is usually safe.
- `--min-rate N`, `--max-rate N`: The minimum and maximum number of packets each second.
- `--host-timeout TIME`: Stop the scan of a host after this time.
- `--max-retries N`: The maximum number of retransmissions for a probe.
- `--scan-delay TIME`, `--max-scan-delay TIME`: The minimum and maximum delay between probes. These flags change the values from `-T`.
- `--min-hostgroup N`, `--max-hostgroup N`: The number of hosts that nmap scans at the same time.
- `--defeat-icmp-ratelimit`: Make a UDP scan faster. A port that does not send a reply shows as `closed|filtered`, thus the result is less accurate.

Evasion (only with written permission):
- `-f`, `--mtu N`: Send fragmented packets. `N` is a multiple of 8.
- `-D decoy1,decoy2,ME`: Add decoy source addresses. `RND:5,ME` adds 5 random addresses and your address.
- `-S IP`: Use a different source address.
- `-e IFACE`: Send packets through this interface.
- `-g PORT`, `--source-port PORT`: Use this source port, for example `53`.
- `--proxies socks4://host:port,...`: Send the connections through HTTP or SOCKS4 proxies. Only `-sV` and NSE use the proxies. Host discovery, the port scan and OS detection do not use the proxies, thus they show your real address.
- `--spoof-mac MAC|prefix|vendor`: Use a different MAC address.

Output:
- `-oN file`, `-oX file`, `-oG file`, `-oA basename`: Normal, XML, grepable or all three formats. Use `-` as the file name for stdout.
- `--append-output`: Add the results to the end of the output files. Without this flag, nmap writes over the files. An XML file with added results is not correct XML.
- `--open`: Show only the ports with the state `open`, `open|filtered` or `unfiltered`. nmap does not show the hosts without these ports.
- `--reason`: Show why a port has its state, for example `syn-ack` or `conn-refused`.
- `-v`, `-vv`: More output. `-d`, `-dd`: Debug output.
- `--packet-trace`: Show each packet that nmap sends and receives.

# Read it locally

```sh
nmap --help                                  # one-page summary
man nmap                                     # full manual (≈3000 lines)
nmap --script-help "vuln"                    # scripts in a category
nmap --script-help ssl-enum-ciphers          # what one script does
nmap --iflist                                # interfaces and routes nmap will use
nmap --script-help all | grep -c '^Categories'   # NSE scripts available locally
```

# Long scans

A full port scan can run for hours. A scan with `-A` on a `/24` network or with `--script=vuln` can also run for hours. When nmap gets a signal, it does not show its status.

- Terminal: When you press a key in the terminal, nmap shows a `Stats:` line with the time, the percent done and the ETC. The keys `v`/`V`, `d`/`D` and `p`/`P` change the verbosity, the debug level and the packet trace. The `?` key shows the help.
- Background: Run `nmap-run.sh` with `run_in_background: true`. The first lines show `dir=DIR` and `pid=PID`. To stop the scan, run `kill PID`. A background scan ignores SIGINT. To see the progress, read the last lines of `DIR/log`. To see the open ports before the end, run `nmap-summary.sh DIR/scan.xml`.
- Resume: `nmap --resume <output-file>` continues a scan that stopped. Use the normal, grepable or XML output file, for example `DIR/scan.gnmap`. The output file contains the command line of the scan. Thus, do not add other flags. nmap starts again from the first host without a full result.
- NSE limits: nmap stops a script thread that runs for more than 5 seconds without a yield to the NSE engine. A script that uses more than 400 MB of memory gets an error.
