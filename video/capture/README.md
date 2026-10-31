# Captures for the showcase video

`capture.mjs` takes the screenshots in `../public/captures/{light,dark}/` (full page at 2x plus `layout.json` with
the widget boxes). It never talks to the Ogma backend: Playwright answers every `/api/**` request, the metrics
WebSocket and the GitHub API with the fictional data in `fixtures.mjs` (host-free paths, repos, containers and tasks
are made up). Redo the captures when the dashboard changes visibly.

## Endpoints the dashboard calls

`/api/metrics` (also pushed over `/ws`), `/api/docker`, `/api/git/scan`, `/api/service-status`, `/api/connectivity`,
`/api/weather`, `/api/backups`, `/api/kanban/{tasks,activity,projects}`; `api.github.com` is requested directly by
the GitHub widget. Settings (`git-roots`, `github-username`, `weather-location`, theme) are set per run in
`localStorage`.

## Run

```sh
pnpm dev                      # frontend on :5180 (the backend is not needed)
cd video && pnpm install --ignore-workspace
pnpm capture                  # OGMA_URL / CHROMIUM_PATH override the defaults
pnpm render && pnpm poster    # out/ogma{,-dark}.mp4 and .png
```
