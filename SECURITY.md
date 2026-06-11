# Security

## Model

CLARMY is a **local, single-operator tool**. It exposes, over HTTP/WS:

- a PTY (a real shell on the host) per piloted session,
- unauthenticated session control (spawn / kill / fork),
- an MCP bridge guarded by a shared key (`~/.claude/cockpit/mcp.key`, mode 600).

Because of the first two, the server binds **127.0.0.1 by default**. Setting
`COCKPIT_HOST=0.0.0.0` (or any non-loopback host) without putting your own
authentication in front (reverse proxy, tailscale + auth, VPN) means anyone who
can reach the port can run commands on your machine. Do not do that.

## Secrets

- Cron/email secrets are stored AES-256-GCM encrypted in
  `~/.claude/cockpit/secrets.json`; the master key lives in
  `~/.claude/cockpit/secret.key` (or `COCKPIT_SECRET_KEY`). Plaintext is never
  persisted and never returned by the API.
- The MCP shared key is per-machine, persisted at `~/.claude/cockpit/mcp.key`
  (overridable with `COCKPIT_MCP_KEY`).

## Reporting

Open a GitHub security advisory (Security tab → Report a vulnerability) or a
private issue. Please do not post exploitable details in public issues.
