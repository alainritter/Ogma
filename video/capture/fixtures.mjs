// Fictional data for the showcase capture. Nothing here comes from a real machine.
const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 60_000).toISOString();

// Deterministic pseudo-random so every capture run looks the same.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

let tick = 0;
export function metrics() {
  tick += 1;
  const wave = (base, amp, phase) => base + amp * Math.sin((tick + phase) / 3);
  const cores = Array.from({ length: 16 }, (_, i) => ({
    usage: Math.max(3, Math.min(97, wave(24 + (i % 5) * 9, 14, i * 1.7) + rnd() * 6)).toFixed(1),
  }));
  const cpu = (cores.reduce((s, c) => s + Number(c.usage), 0) / cores.length).toFixed(1);
  const total = 64 * 1024 ** 3;
  const used = Math.round(wave(27, 2, 0) * 1024 ** 3);
  return {
    cpu: { usage: cpu, cores },
    memory: { total, used, free: total - used, percentage: ((used / total) * 100).toFixed(1) },
    disk: [
      { fs: '/dev/nvme0n1p2', mount: '/', size: 1000e9, used: 412e9, percentage: 41.2 },
      { fs: '/dev/nvme1n1p1', mount: '/home', size: 2000e9, used: 1180e9, percentage: 59 },
      { fs: '/dev/sda1', mount: '/mnt/archive', size: 4000e9, used: 3320e9, percentage: 83 },
    ],
    temperature: { main: Math.round(wave(52, 6, 2)), max: 71, cores: [], available: true },
    vram: {
      gpus: [{ vendor: 'AMD', model: 'Radeon RX 7900 XTX', totalMb: 24576, usedMb: Math.round(wave(9200, 600, 1)), percentage: '38.0' }],
      available: true,
      dynamic: true,
    },
    platform: 'linux',
    timestamp: NOW + tick * 2000,
  };
}

export const docker = {
  containers: [
    ['postgres', 'postgres:17-alpine', 'running', 'Up 6 days', ['127.0.0.1:5432->5432/tcp'], 1.2, 3.4],
    ['redis', 'redis:7-alpine', 'running', 'Up 6 days', ['127.0.0.1:6379->6379/tcp'], 0.4, 0.6],
    ['nginx', 'nginx:1.27', 'running', 'Up 2 days', ['0.0.0.0:8080->80/tcp'], 0.2, 0.3],
    ['grafana', 'grafana/grafana:11', 'running', 'Up 2 days', ['127.0.0.1:3000->3000/tcp'], 2.1, 4.8],
    ['minio', 'minio/minio:latest', 'running', 'Up 4 hours', ['127.0.0.1:9000->9000/tcp'], 0.8, 2.2],
    ['mailpit', 'axllent/mailpit:v1', 'exited', 'Exited (0) 3 days ago', [], undefined, undefined],
  ].map(([name, image, state, status, ports, cpu, memory], i) => ({
    id: `c0ffee${i}`.padEnd(12, '0'),
    name,
    image,
    state,
    status,
    created: Math.floor(NOW / 1000) - 86400 * (7 - i),
    started: Math.floor(NOW / 1000) - 86400 * (6 - i),
    ports,
    mounts: [],
    cpu,
    memory,
  })),
  running: 5,
  stopped: 1,
  total: 6,
  available: true,
};

const repo = (name, branch, state, o = {}) => ({
  path: `/home/dev/projects/${name}`,
  name,
  root: '/home/dev/projects',
  branch,
  state,
  ahead: 0,
  behind: 0,
  changedFiles: 0,
  stagedCount: 0,
  unstagedCount: 0,
  untrackedCount: 0,
  hasUpstream: true,
  lastCommit: { hash: 'a1b2c3d', message: 'Tidy up release notes', date: iso(180), author: 'Demo Dev' },
  ...o,
});
export const gitRepos = [
  repo('aurora-web', 'feature/onboarding', 'dirty', { changedFiles: 5, unstagedCount: 3, stagedCount: 1, untrackedCount: 1, lastCommit: { hash: '4f9e2a1', message: 'Add onboarding checklist', date: iso(42), author: 'Demo Dev' } }),
  repo('ledger-api', 'main', 'ahead', { ahead: 2, lastCommit: { hash: '9be03c7', message: 'Cache exchange rates for one hour', date: iso(95), author: 'Demo Dev' } }),
  repo('pixel-forge', 'main', 'clean', { lastCommit: { hash: '12ac8f0', message: 'Bump sharp to 0.34', date: iso(1500), author: 'Demo Dev' } }),
  repo('harbor-cli', 'main', 'behind', { behind: 3, lastCommit: { hash: '7d4410e', message: 'Fix flaky retry test', date: iso(2900), author: 'Demo Dev' } }),
  repo('notes-sync', 'fix/conflict-markers', 'diverged', { ahead: 1, behind: 2, changedFiles: 1, unstagedCount: 1 }),
  repo('dotfiles', 'main', 'clean'),
];

export const services = {
  timestamp: iso(0),
  services: [
    ['Claude', 'operational', 'All systems operational'],
    ['Cloudflare', 'operational', 'All systems operational'],
    ['GitHub', 'operational', 'All systems operational'],
    ['Vercel', 'degraded', 'Minor delays in build queue'],
    ['Tailscale', 'operational', 'All systems operational'],
    ['npm', 'operational', 'All systems operational'],
  ].map(([name, status, description]) => ({ name, status, description, statusUrl: '#' })),
};

export const connectivity = {
  timestamp: iso(0),
  checks: [
    ['Cloudflare DNS', 11], ['Google', 18], ['GitHub', 34], ['npm Registry', 41], ['Anthropic API', 63], ['Vercel', 29],
  ].map(([name, latencyMs]) => ({ name, reachable: true, latencyMs })),
};

export const weather = {
  current_condition: [{ temp_C: '14', weatherDesc: [{ value: 'Partly cloudy' }], humidity: '68', windspeedKmph: '14', FeelsLikeC: '12' }],
  nearest_area: [{ areaName: [{ value: 'Berlin' }], country: [{ value: 'Germany' }] }],
};

const avatar =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3b4a6b"/><circle cx="32" cy="25" r="11" fill="#d7dff0"/><path d="M10 60c2-14 12-20 22-20s20 6 22 20z" fill="#d7dff0"/></svg>'
  );
export const githubUser = { login: 'demo-dev', name: 'Demo Dev', avatar_url: avatar, public_repos: 38, followers: 214, following: 41, bio: 'Building small tools for big workflows.' };
export const githubRepos = [
  ['aurora-web', 412, 38, 'TypeScript', 'Onboarding-first web app starter'],
  ['pixel-forge', 268, 21, 'Rust', 'Batch image pipeline with a tiny CLI'],
  ['ledger-api', 154, 12, 'Go', 'Double-entry ledger over HTTP'],
  ['harbor-cli', 97, 9, 'Python', 'Container housekeeping from the terminal'],
  ['notes-sync', 63, 4, 'TypeScript', 'Markdown notes that sync themselves'],
].map(([name, s, f, language, description], i) => ({ name, stargazers_count: s, forks_count: f, watchers_count: s, open_issues_count: [3, 1, 0, 2, 0][i], language, description }));

const tier = (id, label, state, ageDays, maxAgeDays, preset, hist) => ({
  id,
  label,
  state,
  lastRun: { started: iso(ageDays * 1440 + 40), finished: iso(ageDays * 1440 + 22), durationS: 1080, exit: 0, errors: 0 },
  ageDays,
  maxAgeDays,
  targets: [{ path: '/mnt/backup', mounted: true, totalBytes: 4e12, freeBytes: 1.9e12 }],
  schedule: { preset, nextRun: new Date(NOW + 86400_000 * 0.4).toISOString() },
  history: hist.map((ok, i) => ({ file: `${id}-${i}.log`, started: iso((ageDays + i * 2) * 1440), ok })),
});
export const backups = {
  scriptsDir: '/home/dev/backup',
  available: true,
  tiers: [
    tier('daily', 'Daily snapshot', 'ok', 0.4, 2, 'daily', [true, true, true, true, true]),
    tier('weekly', 'Weekly archive', 'ok', 3, 9, 'weekly', [true, true, true, true, true]),
    tier('monthly', 'Monthly offsite', 'ok', 12, 35, 'monthly', [true, true, true, true, true]),
  ],
};

const task = (n, status, project, title, created, body = '') => ({
  file: `${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}.md`,
  number: n,
  title,
  status,
  project,
  created,
  body,
  idea: status === 'todo' && !body.includes('## Plan'),
  preview: '',
  previewCmd: '',
});
const plan = (done, total) => '## Plan\n\n' + Array.from({ length: total }, (_, i) => `- [${i < done ? 'x' : ' '}] Step ${i + 1}`).join('\n');
export const kanbanTasks = [
  task('041', 'todo', 'aurora-web', 'Dark mode for the settings page', '2026-10-27'),
  task('042', 'todo', 'ledger-api', 'Rate limit the export endpoint', '2026-10-28', plan(0, 4)),
  task('043', 'todo', 'harbor-cli', 'Add --dry-run to prune', '2026-10-29', plan(0, 3)),
  task('044', 'todo', 'pixel-forge', 'Idea: WebP quality presets', '2026-10-30'),
  task('038', 'doing', 'aurora-web', 'Onboarding checklist component', '2026-10-24', plan(3, 5)),
  task('039', 'doing', 'ledger-api', 'Cache exchange rates', '2026-10-25', plan(2, 4)),
  task('035', 'review', 'pixel-forge', 'Upgrade sharp and rebuild fixtures', '2026-10-21', plan(4, 4)),
  task('036', 'review', 'notes-sync', 'Resolve conflict markers on pull', '2026-10-22', plan(3, 3)),
  task('030', 'done', 'harbor-cli', 'Retry flaky network calls', '2026-10-15', plan(3, 3)),
  task('031', 'done', 'dotfiles', 'Move shell aliases to one file', '2026-10-16', plan(2, 2)),
  task('033', 'done', 'aurora-web', 'Replace icon set', '2026-10-18', plan(5, 5)),
];
export const kanbanActivity = [
  { number: '038', state: 'working', summary: 'Writing tests', age: 12 },
  { number: '039', state: 'asking', summary: 'Which cache TTL?', age: 40 },
];
export const kanbanProjects = ['aurora-web', 'ledger-api', 'pixel-forge', 'harbor-cli', 'notes-sync', 'dotfiles'];
