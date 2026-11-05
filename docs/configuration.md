# Configuration and security

## Configuration

The dashboard works out of the box with defaults. For overrides, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable               | Default                         | Purpose                                                                                                                                             |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BIND_HOST`            | `127.0.0.1`                     | Network interface to bind the backend to (loopback default)                                                                                         |
| `BACKUP_SCRIPTS_DIR`   | `~/Dev/_scripts`                | Repo with `backup-scripts/run-tier.sh` and `backup-logs/`                                                                                           |
| `BACKUP_STATE_DIR`     | `~/.local/state/backup-scripts` | Per-tier JSON status written by the scripts                                                                                                         |
| `PORT`                 | `3010`                          | Backend port (also picked up by the Vite proxy + Electron)                                                                                          |
| `DASHBOARD_TOKEN`      | _(empty)_                       | Shared token for destructive endpoints. Empty = open (loopback default). **Required** when `BIND_HOST=0.0.0.0`.                                     |
| `OGMA_ALLOWED_HOSTS`   | _(empty)_                       | Extra host names the Vite dev server accepts (comma-separated), e.g. a reverse proxy's public name.                                                 |
| `OGMA_ALLOWED_ORIGINS` | _(empty)_                       | Exact page origins (`https://host:port`) allowed to open the metrics WebSocket besides loopback. Only for an authenticating reverse proxy in front. |

> Frontend dev is `5180`, Vite preview is `4173`.

## Security defaults

The backend **binds to loopback (`127.0.0.1`) by default** — only your local browser can reach it. This is intentional: there is **no authentication** on any endpoint, and several can act on your behalf (`/api/git/push|commit`, `/api/scrape`).

Additional guards:

- **Host-header allowlist** against DNS-rebinding attacks (active on loopback binds).
- **SSRF guard** on the scraper: literal + DNS-resolved private-range checks, re-checked after redirects.
- **Path validation**: git endpoints resolve paths and block sensitive system prefixes (`/etc`, `/proc`, `/root`, …).

- **Optional token gate**: set `DASHBOARD_TOKEN` to require an `X-Dashboard-Token` header on
  **the entire `/api` surface — reads included**, plus a `?token=` query param on the metrics
  WebSocket (browsers cannot set headers on a WS handshake). Reads are gated because endpoints
  like `/api/git/scan` and `/api/docker` expose filesystem layout and running containers — gating only the destructive half would leave an exposed instance wide
  open. `/health` stays open for uptime probes. Configure the matching token under
  **Settings → General → Dashboard Token** in the browser. When unset, the API stays open
  (fine for the loopback default). The token is compared in constant time.

If you really need LAN access, opt in explicitly **and set a token**:

```bash
DASHBOARD_TOKEN=$(openssl rand -hex 16) BIND_HOST=0.0.0.0 pnpm dev:server   # exposes backend — token now required
```

The server logs a loud warning on startup if it binds to a non-loopback interface without a token.

## Optional system tools

Widgets degrade gracefully if a tool is missing, and report the reason in their JSON response.

| Tool                | Required by  | Install hint                   |
| ------------------- | ------------ | ------------------------------ |
| Docker daemon       | DockerWidget | user in `docker` group         |
| Playwright Chromium | WebScraper   | `pnpm exec playwright install` |

## Customization

Open **Settings** (gear icon in the header) to configure the GitHub username, weather location, dashboard token, sound and git roots. Everything is persisted in `localStorage`.

### Colors and styles

Colors, font sizes, spacing and radii are tokens from the shared design system (Harmonia)
(`src/index.css` imports `../Harmonia/*.css`). Change them there, not in this app;
app-specific Tailwind settings and keyframes live in the `@theme {}` block of `src/index.css`.
