# Widgets

## Widgets (real backend data)

| Widget                                                                                                                             | Data Source                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **System Metrics** — CPU · Memory · Performance graph · VRAM · Storage · Temperature (six independent widgets, shared data stream) | `systeminformation` + nvidia-smi/amdgpu sysfs                                                                          |
| **Weather**                                                                                                                        | wttr.in API (proxied through the backend)                                                                              |
| **Docker Monitoring**                                                                                                              | Docker socket                                                                                                          |
| **Backups**                                                                                                                        | status files + logs of `_scripts/backup-scripts` (`BACKUP_SCRIPTS_DIR`, `BACKUP_STATE_DIR`), systemd user timers       |
| **Kanban Board**                                                                                                                   | task files in `~/.local/share/kanban/tasks` (`KANBAN_DIR`)                                                             |
| **Git Widget**                                                                                                                     | status, pull, push, fetch, commit (message suggested by local Ollama, committed as Ogma), bulk operations              |
| **Web Scraper**                                                                                                                    | Playwright/Chromium (see NixOS note below)                                                                             |
| **GitHub Stats**                                                                                                                   | GitHub API (set your username in Settings)                                                                             |
| **CI Status**                                                                                                                      | GitHub Actions runs of all own repos via the server's logged-in `gh` CLI (`gh repo list`, `gh run list`; cached 3 min) |
| **Drift Score**                                                                                                                    | own repos under `~/Dev` (`DRIFT_ROOT`) vs. Daidalos, Kalliope, Harmonia, `Netzwerk/services.yaml`; cached 10 min       |
| **Service Status**                                                                                                                 | Statuspage.io API (Cloudflare, GitHub, OpenAI, etc.)                                                                   |
| **Connectivity Monitor**                                                                                                           | HTTP latency checks to internet endpoints                                                                              |
| **Network Outage Map**                                                                                                             | visualizes connectivity status                                                                                         |

Drift Score: the same report as `pnpm drift` (`--repo <Name>` for one repo with all checks, `--json` for raw output). Nine checks per repo (Kalliope version, Daidalos template version, locally changed template files, Harmonia usage, hex/px instead of tokens, ports in `Netzwerk/services.yaml`, Python version, Node toolchain, basics such as LICENSE/README/gate/lockfile/Dependabot). Each is `ok`, `warn` (half a point), `fail` or `na` (not applicable); repo score = points / rated checks, total = mean of repo scores. Every finding carries a copyable fix. Rules and exemptions are constants at the top of `server/services/drift.ts`.

Kanban Board: columns can be hidden, ideas are captured raw with several projects (comma-separated in `project`, the first is the main one) and file attachments (stored in `~/.local/share/kanban/attachments/NNN/`, listed as absolute paths under `## Anhänge`) (badge "Idee" until `/kanban-new NNN` formulates and plans them), plan steps written as `- [ ]` checklist show a progress bar, and the hook `~/.claude/hooks/kanban-activity.sh` (registered in `~/.claude/settings.json`) shows what Claude is doing right now on the card. Every card and the detail view has a copy button that puts the matching command on the clipboard (`/kanban NNN`, `/kanban-review NNN` in review, `/kanban-new NNN` for ideas).

## Local-only widgets (no backend)

| Widget              | Storage                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Markdown Editor** | `localStorage`                                                                                                                            |
| **Sound Manager**   | `<audio>` loop — drop a file at `public/audio/ambiance-legal.ogg` (not shipped in the repo); the widget shows a disabled state without it |

## Design

- **Shared design system**: colors, type scale, spacing and `ds-` components come from a shared design system (Harmonia) used by all my internal apps (a private sibling checkout at `../Harmonia`)
- **Drag & resize grid** on desktop, saved per browser; the tablet view for half a screen (< 1280px) has its own editable layout
- **Single-column phone view** below 768px, in desktop reading order
- **Widget visibility panel** with a live health status per widget
