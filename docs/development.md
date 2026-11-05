# Development

```bash
pnpm build      # typechecks frontend (tsc -b) AND backend (tsconfig.server.json), then vite build
pnpm typecheck:server  # backend typecheck only
pnpm preview    # Preview production build (port 4173)
pnpm lint       # ESLint (browser globals for src/, node globals for server/)
pnpm format     # Prettier
pnpm desktop    # Electron dev (spawns server + vite)
pnpm desktop:prod  # vite build, then Electron loads backend-served bundle on :3010
```

No test framework. CI (GitHub Actions) runs `pnpm lint`, `pnpm format:check` and `pnpm build`; the same commands are the local verification gates.

## Project Structure

```
Ogma/
├── shared/
│   └── types.ts                  # Wire types shared by server + frontend
├── server/
│   ├── index.ts                  # Express API (all routes inline)
│   └── services/                 # One file per concern
│       ├── systemMetrics.ts
│       ├── weather.ts
│       ├── docker.ts
│       ├── backups.ts
│       ├── gitStatus.ts
│       ├── scraper.ts
│       └── netGuard.ts           # SSRF guard (literal + DNS checks)
├── src/
│   ├── components/               # One file per widget (+ Toaster)
│   │   └── metrics/              # Six metric widgets (CPU, Memory, Graph, VRAM, Storage, Temp)
│   ├── lib/
│   │   ├── settings.ts           # useSetting/useSettingJSON hooks (localStorage + sync)
│   │   ├── metricsStore.ts       # Singleton metrics store (one WS + HTTP-polling fallback)
│   │   ├── api.ts                # apiFetch wrapper (attaches optional dashboard token)
│   │   └── toast.ts              # toast() notifications
│   ├── App.tsx                   # Main dashboard grid layout
│   ├── index.css                 # Tailwind + Harmonia imports
│   └── main.tsx                  # React entry point
├── electron/
│   └── main.cjs                  # Electron shell (spawns server + vite)
├── .env.example
├── eslint.config.js              # ESLint flat config (browser + node blocks)
├── tsconfig.server.json          # Backend typecheck (run by pnpm build)
├── package.json
└── README.md
```

## Optional Integrations

Widgets degrade gracefully if the underlying tool is missing.

| Widget       | Requires                                                               |
| ------------ | ---------------------------------------------------------------------- |
| WebScraper   | `pnpm exec playwright install` (NixOS: see below)                      |
| DockerWidget | Docker daemon socket access                                            |
| BackupWidget | `_scripts/systemd/install.sh` once for schedules (systemd user timers) |
| Git          | shells out; paths validated server-side (blocked system prefixes)      |

### NixOS Note (Playwright)

NixOS doesn't ship standard glibc paths Playwright expects. Use [`playwright-nix`](https://github.com/nginx-nixos/playwright-nix) or run Chromium via a FHS env. See [NixOS wiki: Playwright](https://nixos.wiki/wiki/Playwright).
