---
name: devtunnel-cli
description: Run Microsoft Dev Tunnels from the shell to expose a local port on a public/private URL, manage persistent tunnels, control access, and connect remote ports back to localhost. Use whenever the user asks to invoke "devtunnel".
---

Binary: locate with `which devtunnel` (typical path: `/opt/homebrew/bin/devtunnel`). Confirm version with `devtunnel --version` — it also prints the bound service cluster (e.g. `euw`) and ToS/privacy notice. **A tunnel is a server-side object, not a process**: `devtunnel create` allocates a persistent tunnel in Microsoft's cloud (`global.rel.tunnels.api.visualstudio.com`) that survives after the CLI exits; `devtunnel host` is the process that pumps your local port through it. Almost everything requires login — `devtunnel user login` (browser by default; `-d` device-code over SSH, `-g` GitHub). Tokens and the default-tunnel pointer live under `~/Library/Application Support/DevTunnels/` on macOS (`devtunnels.json` = default tunnel + cluster; `devtunnels-tokens*` = cached auth). A logged-out CLI fails with "Login token expired"; the only no-login path is `-t/--access-token` (a scoped tunnel token) or hosting an `--allow-anonymous` tunnel you already own.

# Mental model

Each invocation flows through:

```
login (or -t token) → tunnel object (create/host) → ports → access-control entries → host process ⇄ service ⇄ client (browser URL or `connect`)
```

- **Defaults without flags.** No tunnel exists until you `create` or `host`. A fresh tunnel is **private** — only the owner's account can connect; nothing is public until you add an anonymous access rule. Port protocol defaults to `auto` (HTTP/HTTPS auto-detected). The CLI binds to the nearest service cluster automatically (`devtunnel clusters` lists all; `*` marks current). Web requests have their `Host` header rewritten to `localhost` and `Origin` to `http(s)://localhost` unless you pass `unchanged`.
- **Two central forks.** (1) *Ephemeral vs persistent*: `devtunnel host -p 3000` creates a throwaway tunnel inline and tears nothing down on its own (the object lingers server-side until expiration/delete); `create` + `port create` + `host <id>` is the reusable path where the same stable URL comes back every run. (2) *Host vs connect*: `host` pushes your local port **out**; `connect` pulls a remote tunnel's port **back in** as a local listener — the way to reach non-HTTP services (SSH, databases, raw TCP) that a browser URL can't.
- **Access is layered, ordered, and inheritable.** Access-control entries (ACEs) attach to the tunnel or to a single port (`-p`). Rules are evaluated in order (`-i` inserts at an index); a `--deny` rule can shadow a later allow. Anonymous (`-a`), whole Entra tenant (`--tenant`), GitHub org (`--org`), or repo-access-based (`-r owner/repo`) are the audiences. ACEs can themselves expire (`-e 1h`…`30d`).
- **Output policy.** Almost every command takes `-j/--json` for machine-readable output — use it whenever parsing IDs, URLs, or port lists. The human table from `host` prints both the public connect URL (`https://<id>-<port>.<cluster>.devtunnels.ms`) and an inspect URL; `port list -j` / `show -j` are the reliable way to extract those programmatically.

# Minimal command

```sh
devtunnel user login                              # one-time browser login
devtunnel host -p 3000                            # private tunnel for localhost:3000 (login required to reach)
devtunnel host -p 3000 -a                         # anonymous: anyone with the URL can reach it
devtunnel host -p 3000 -p 5000 -p 8080            # multiple local ports through one tunnel
devtunnel connect <id>                            # pull a tunnel's ports back as local listeners
```

Reusable named tunnel:

```sh
devtunnel create my-api -a -e 7d                  # persistent tunnel, anonymous, 7-day expiry
devtunnel port create my-api -p 3000              # register a port on it
devtunnel host my-api                             # host whenever you want; same URL returns
```

# Knobs by group

Auth (`devtunnel user …` + global `-t`):
- `user login` — `-b` browser (default), `-d` device-code (headless/SSH), `-e` Entra/Microsoft (default), `-g` GitHub. Service principal: `--sp-tenant-id/--sp-client-id` + `--sp-secret` or `--sp-certificate-file`. Azure Managed Identity: `--mi-client-id/--mi-object-id/--mi-resource-id`. Federated OIDC: `--federated-token`.
- `user show` / `user logout`.
- `-t, --access-token <token>` — present on nearly every command; authenticate with a scoped tunnel token instead of a user login (`-` reads from stdin). Mint with `devtunnel token`.

Tunnel lifecycle:
- `create [<id>]` — `-a` anonymous, `-r owner/repo` repo-gated, `-e 2h|7d` expiration, `-d` description, `-l` space-separated labels, `--request-timeout SEC` (0=disabled), `--host-header/--origin-header` (`unchanged` keeps original). ID is random if omitted.
- `host [<id>]` — same flags as create **plus** `-p/--port-numbers` (repeatable: `-p 3000 -p 5000`) and `--protocol http|https|auto`. No `<id>` → creates a new tunnel inline.
- `update [<id>]` — change `-d`, `-e`, headers, `--request-timeout`, and `--add-labels`/`--remove-labels`.
- `list` — `-l` filter by any label, `--all-labels` by all, `--limit N`, `-j`.
- `show <id>` / `delete <id>` / `delete-all`.
- `set <id>` / `unset` — set/clear the default tunnel so `<id>` can be omitted elsewhere.

Ports (`devtunnel port …`):
- `create <id> -p N` (REQUIRED port) — `--protocol`, `-d`, `-l`, header rewrites, `--request-timeout`.
- `update <id> -p N` — `-d`, `--add-labels`/`--remove-labels`, headers, timeout.
- `list <id>` / `show <id>` / `delete <id> -p N`.

Access control (`devtunnel access …`):
- `create <id>` — audience: `-a` anonymous, `--tenant` current Entra tenant, `--org NAME` GitHub org, `-r owner/repo` repo-access. `-p N` scopes the rule to one port. `-d/--deny` makes it a deny rule. `-e 1h…30d` expiry. `--scopes connect|host|inspect…` (default `connect`). `-i INDEX` inserts at a position (rules are ordered).
- `list <id>` / `delete <id>` / `reset <id>` (back to private default).

Tokens & scopes:
- `token <id> --scope <s>` (REQUIRED) — one or more of `create manage manage:ports host inspect connect`. Issues a tunnel token to hand off hosting/connecting without sharing your account. Pair with `-t -` on the consuming command to pipe via stdin.

Diagnostics:
- `echo <protocol>` — local echo server for testing; protocol `http` (default), `https`, `ssh`, `tcp`, `udp`. `-p` port, `-I` interface (default `127.0.0.1`), `-c/--certificate` + `-pwd` for TLS.
- `ping <uri>` — send probes to a remote echo server. `-s` message size, `-i` interval ms (default 1000).
- `limits` — account quotas (tunnel count, ports per tunnel, etc.). `clusters` — service regions with current marked `*`.

# Read it locally

```sh
devtunnel --help                  # top-level command list
devtunnel host --help             # the flag you'll reach for most
devtunnel access create --help    # the audience/deny/scope matrix
devtunnel token --help            # scope names for handoff tokens
devtunnel user show               # am I logged in / as whom
devtunnel clusters                # regions; * = the cluster you're bound to
devtunnel limits                  # quotas before you hit them
```

Online docs (not curl-friendly as raw text; open in a browser):

```
https://aka.ms/devtunnels/docs           # overview + concepts
https://aka.ms/devtunnels/docs/cli       # full CLI reference
https://aka.ms/devtunnels/issues         # bug tracker
```

# Long-running calls

`devtunnel host` is a foreground daemon — it blocks, streaming connection logs, and runs until `Ctrl-C`. The tunnel **object** outlives the process; only the live forwarding stops.

- **Fire-and-forget.** `Bash` with `run_in_background: true`, redirect both streams (`devtunnel host my-api > /tmp/devtunnel.log 2>&1`). Grep the log for the `https://…devtunnels.ms` connect URL once it's up. Use a named/created tunnel so the URL is stable and you can `delete` it deterministically on teardown.
- **Headless hosts (CI, servers).** Avoid the interactive browser login: either `devtunnel user login -d` (device-code) once, or mint a `host`-scoped token with `devtunnel token <id> --scope host` and run `devtunnel host <id> -t <token>` — no cached user session needed.
- **Reconnects.** The host process auto-reconnects to the service across transient network drops; the public URL is unchanged across reconnects because it's tied to the tunnel object, not the session.
- **Cleanup.** Killing the host frees nothing server-side. Set `-e` on create for auto-expiry, or explicitly `devtunnel delete <id>` (or `delete-all`) when done — tunnels count against `devtunnel limits`.
