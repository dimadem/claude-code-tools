---
name: devtunnel-cli
description: Run Microsoft Dev Tunnels (devtunnel) from the shell to share a local port through a public or private URL, keep a tunnel with a permanent URL, control access, and connect remote ports to localhost. Use when the user tells you to run "devtunnel". Also use it when the user tells you to share a local dev server, to get a URL for localhost or to receive webhooks on localhost.
---

Binary: `which devtunnel` (Homebrew on macOS: `brew install --cask devtunnel`). `devtunnel --version` shows the CLI version, the service URI and the cluster.

A tunnel is an object on the Microsoft service, not a process. `devtunnel create` makes the tunnel. The tunnel stays after the CLI stops. `devtunnel host` is the process that sends the traffic between the tunnel and the local port.

# Mental model

The main stages:

```
login → tunnel (create or host) → ports → access control entries → host process ⇄ local service ⇄ client (URL or connect)
```

- Login: Almost all commands must have a login. `devtunnel user login` opens a browser. The agent cannot do this step. When the login token expires, the commands show `Login token expired.`
- Private: A new tunnel is private. Only the account of the owner can open the URL. A client without a login gets HTTP 302 to a login page.
- Anonymous: `-a` lets all persons with the URL open it. Get approval from the user before you make an anonymous tunnel.
- Ephemeral and persistent: `devtunnel host -p 3000` makes a new tunnel with a random ID. `create` + `port create` + `host ID` gives a tunnel with a permanent URL.
- Host and connect: `host` sends a local port to the tunnel. `connect` makes a local port for a remote tunnel. Use `connect` for SSH, databases and other TCP services.
- Tunnel ID: The full ID has the cluster, for example `my-api.asse`. If you do not give an ID, the CLI uses the last tunnel that you used.
- Headers: For HTTP traffic, the tunnel changes the `Host` header to `localhost` and the `Origin` header to `http(s)://localhost`. To keep the headers, use `--host-header unchanged` and `--origin-header unchanged`.
- JSON: Most commands have `-j`. `host` and `connect` do not have `-j`. The URLs are in `devtunnel show ID -j`, in `tunnel.ports[].portUri`. `port list -j` does not show the URLs. Sometimes the CLI writes `Welcome to dev tunnels!` and the version before the JSON. Thus remove the lines before the first `{`, for example with `sed -n '/^{/,$p'`.

# Procedure

1. Run `devtunnel user show`. If it shows `Login token expired.` or `Login required.`, tell the user to type `! devtunnel user login -g` (GitHub) or `! devtunnel user login` (Microsoft).
2. To share a port one time, run `devtunnel-up.sh PORT`. The tunnel expires after 1 day.
3. If the user must have the same URL each time, run `devtunnel-up.sh --name ID PORT`.
4. Give the `url=` lines to the user.
5. To test a private URL, use a connect token (see "Test a private URL").
6. When the user does not need the tunnel, run `devtunnel-down.sh DIR`. Add `--delete` for a tunnel without `--name`.

# Scripts

`host` and `connect` do not stop. Thus use these scripts. They start the host in the background and return when the URLs are ready.

`${CLAUDE_PLUGIN_ROOT}/scripts/devtunnel-up.sh [PORT...]`: Start a host for the local ports. The script shows `dir=`, `pid=`, `tunnel=` and one `url=PORT URI` line for each port. Then it stops, and the host continues in the background. If the start fails, the script stops the host and deletes a tunnel that it made.

Flags of `devtunnel-up.sh`:
- `--name ID`: Use a persistent tunnel. If the tunnel or a port does not exist, the script makes it. The URL does not change.
- `--anon`: Make a new tunnel anonymous. For a tunnel that exists, use `devtunnel access create ID -a`.
- `--expire TIME`: The expiration of a new tunnel, for example `2h` or `7d`. The default is `1d`.
- `--dir DIR`: The directory for `host.log`, `pid` and `tunnel`. The default is a new temporary directory. If the host of a directory did not stop, the script gives an error.
- `--timeout SEC`: The maximum time to wait for the host. The default is 30.

`${CLAUDE_PLUGIN_ROOT}/scripts/devtunnel-down.sh [--delete] DIR`: Stop the host. `--delete` also deletes the tunnel. Without `--delete`, the tunnel and its URL stay until the expiration. You can run `--delete` after the host stopped.

# Minimal command

```sh
devtunnel user show                                # login status
${CLAUDE_PLUGIN_ROOT}/scripts/devtunnel-up.sh 3000 # one-time private URL for localhost:3000
${CLAUDE_PLUGIN_ROOT}/scripts/devtunnel-up.sh --name my-api 3000 5000   # permanent URLs
${CLAUDE_PLUGIN_ROOT}/scripts/devtunnel-down.sh --delete DIR            # stop and delete
devtunnel list -j                                  # all tunnels of the account
```

Persistent tunnel without the scripts:

```sh
devtunnel create my-api -e 7d                      # private tunnel, 7-day expiration
devtunnel port create my-api -p 3000               # add a port
devtunnel host my-api                              # host it; the URL is the same each time
```

# Test a private URL

```sh
tok=$(devtunnel token ID --scope connect -j | sed -n '/^{/,$p' | jq -r .token)
curl -H "X-Tunnel-Authorization: tunnel $tok" https://<id>-<port>.<cluster>.devtunnels.ms/
```

A token is a credential. Write it to a file or into the conversation only when the user tells you to do it.

# Commands by group

Login (`devtunnel user ...`):
- `user login`: `-b` browser (default), `-d` device code (for SSH), `-e` Entra or Microsoft account (default), `-g` GitHub. There are also flags for a service principal (`--sp-*`), a managed identity (`--mi-*`) and a federated token (`--federated-token`).
- `user show`, `user logout`: Show the login status, or log out.
- `-t, --access-token TOKEN`: Use a tunnel token in place of the login. `-` reads the token from stdin. Most commands have this flag.

Tunnels:
- `create [ID]`: `-a` anonymous, `-r owner/repo` access for the users of a repository, `-e 2h|7d` expiration. Other flags: `-d` description, `-l` labels (with spaces between them), `--request-timeout SEC` (`0` gives no limit), `--host-header`, `--origin-header`. Without `ID`, the ID is random.
- `host [ID]`: `-p PORT` (one or more times), `--protocol http|https|auto`, `-a`, `-e`, `-d`, `-l`, `-r`, `--host-header`, `--origin-header`. Without `ID`, `host` makes a new tunnel. With the ID of a tunnel that exists, `-p` gives an error. Add the ports with `port create`.
- `update [ID]`: Change `-d`, `-e`, the headers, `--request-timeout`, `--add-labels` and `--remove-labels`.
- `list`: `-l` labels (one or more), `--all-labels` (all), `--limit N`, `-j`.
- `show [ID]`, `delete [ID]`, `delete-all`: `-f` deletes without a question.
- `set ID`, `unset`: Set or clear the default tunnel.

Ports (`devtunnel port ...`):
- `port create ID -p N`: `--protocol`, `-d`, `-l`, the headers, `--request-timeout`. A port that exists gives an error.
- `port update ID -p N`: `-d`, `--add-labels`, `--remove-labels`, the headers, `--request-timeout`.
- `port list ID`, `port show ID`, `port delete ID -p N`.

Access control (`devtunnel access ...`):
- `access create ID`: The audience is `-a` anonymous, `--tenant` the current Entra tenant, `--org NAME` a GitHub organization, or `-r owner/repo` the users of a repository. `-p N` applies the rule to one port. `-d` makes a deny rule. `-e 1h` to `30d` sets an expiration. `--scopes` sets the scopes (the default is `connect`). `-i INDEX` puts the rule at a position, because the rules have an order.
- `access list ID`: Show the rules.
- `access delete ID -i INDEX`: Delete the rule at this position.
- `access reset ID`: Go back to the default (only the owner).

Tokens:
- `token ID --scope SCOPES`: Make a tunnel token with one or more scopes: `create`, `manage`, `manage:ports`, `host`, `inspect`, `connect`. Use the token with `-t` on a different computer, or with the `X-Tunnel-Authorization` header.

Connect:
- `connect ID`: Make local ports for the ports of the tunnel. If a local port is in use, `connect` uses the next free port. Read the port from the output, for example `Forwarding from 127.0.0.1:18100 to host port 18099`. `connect` does not stop. Run it in the background.

Diagnostics:
- `echo [http|https|ssh|tcp|udp]`: Start a local echo server for tests. `-p` port, `-I` interface (default `127.0.0.1`), `-c` and `-pwd` for TLS.
- `ping URI`: Send messages to a remote echo server. `-s` size, `-i` interval in ms (default 1000).
- `limits`: The limits of the account, for example the bandwidth.
- `clusters`: The service regions. `*` shows the current cluster.

# Read it locally

```sh
devtunnel --help                  # all commands
devtunnel host --help             # flags of one command
devtunnel access create --help    # audiences, deny rules and scopes
devtunnel token --help            # scope names
devtunnel limits                  # limits of the account
```

The online documentation is at https://aka.ms/devtunnels/docs (CLI reference: https://aka.ms/devtunnels/docs/cli).

# Long-running calls

- Host: `devtunnel-up.sh` starts `devtunnel host` with `nohup`. The host continues after the Bash call. Its log is `DIR/host.log`.
- Reconnect: After a network problem, the host connects again. The URL does not change, because the URL belongs to the tunnel.
- Cleanup: When you stop the host, the tunnel stays on the service. A tunnel without `--name` expires after 1 day. To delete a tunnel immediately, use `devtunnel-down.sh --delete DIR` or `devtunnel delete ID -f`.
- Headless computer: Use `devtunnel user login -d` (device code) one time. Or make a token with `devtunnel token ID --scope host`, and run `devtunnel host ID -t -` with the token on stdin.
