# API

## Backend (`http://localhost:3010`)

| Endpoint                        | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/metrics`              | System metrics (CPU, RAM, Disk, VRAM) — cached 2s                            |
| `GET /api/weather?location=...` | Weather from wttr.in                                                         |
| `GET /api/docker`               | Docker container status — cached 5s                                          |
| `GET /api/backups`              | Backup status per tier, targets, schedule — cached 5s                        |
| `POST /api/backups/:id/run`     | Start a backup (409 while running)                                           |
| `POST /api/backups/:id/stop`    | Stop a running backup (SIGTERM to the process group)                         |
| `PUT /api/backups/:id/schedule` | Body `{preset: off\|daily\|weekly\|monthly}`, writes a systemd timer drop-in |
| `GET /api/backups/logs/:file`   | Tail of a backup log (strict file-name whitelist)                            |
| `GET /api/service-status`       | Aggregated Statuspage.io data                                                |
| `GET /api/connectivity`         | HTTP latency probes                                                          |
| `GET/POST /api/git/*`           | status, pull, push, fetch, commit, commit-message (Ollama), bulk             |
| `POST /api/scrape`              | Playwright scraper (SSRF-guarded)                                            |
| `GET /health`                   | Health check                                                                 |
| `WebSocket /ws`                 | Real-time metrics stream (2s broadcast)                                      |

All endpoints are rate-limited (1000 req/min general, stricter for the scraper).
When `DASHBOARD_TOKEN` is set, everything under `/api` plus the WebSocket requires the token —
only `GET /health` stays open.
