import { execFile } from 'child_process';
import { readFile, readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join, matchesGlob } from 'path';
import { promisify } from 'util';
import { parse as parseYaml } from 'yaml';
import type {
  DriftCategory,
  DriftCheck,
  DriftReport,
  DriftRepo,
  DriftStatus,
} from '../../shared/types.js';
import { mapLimit } from './gitStatus.js';

const execFileAsync = promisify(execFile);

// Rules come from ~/Dev/CLAUDE.md ("Projects", "Design-Regel") and the Daidalos/Kalliope templates.
const DEV_ROOT = process.env.DRIFT_ROOT || join(homedir(), 'Dev');
const CACHE_MS = 10 * 60_000;
const CONCURRENCY = 4;
/** Abandoned (see ~/Dev/CLAUDE.md), not worth measuring. */
const EXCLUDED_REPOS = ['Geisterhand'];
/** Own design (see ~/Dev/CLAUDE.md "Design-Regel"): Harmonia is not required there. */
const HARMONIA_EXEMPT = [
  'PXLNGN.NET',
  'Wohlfuehlgesundheit',
  'Ahnentafel',
  'Echo',
  'Zeitgeber',
  'Harmonia',
];
const TEMPLATE_VERSION_WARN_MAX = 5;
const TOKEN_WARN_MAX = 10;
const WALK_MAX_DEPTH = 6;
const WALK_SKIP = new Set(['node_modules', 'dist', '.venv', '.git', '.astro', '__pycache__']);
const SOURCE_EXT = /\.(css|html|ts|tsx|astro|py|mjs)$/;
const STYLE_EXT = /\.(css|tsx|astro|html)$/;
const NODE_PACKAGES = ['vite', 'typescript', 'react', 'astro', 'tailwindcss'];
const CATEGORIES: DriftCategory[] = ['Vorlage', 'Design', 'Infrastruktur', 'Struktur', 'Toolchain'];

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const PX_RE =
  /\b(font-size|padding[\w-]*|margin[\w-]*|gap|row-gap|column-gap|letter-spacing|line-height|border-radius|inset|top|right|bottom|left)\s*:[^;{}]*\b\d+(\.\d+)?px/g;

interface Answers {
  _commit?: string;
  _src_path?: string;
  port?: number;
  caddy_port?: number;
  tailnet_port?: number;
  gateway?: boolean;
}

interface Context {
  kalliopeTag: string;
  daidalosHead: string;
  activePorts: Set<number>;
  tailnetText: string;
  pythonRef: number;
  nodeRef: Record<string, number>;
}

interface Repo {
  name: string;
  path: string;
  daidalos: Answers | null;
  kalliope: Answers | null;
  /** Files of the Daidalos template that are checked byte-for-byte; excluded from the token scan. */
  templateFiles: string[];
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 20_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readYaml<T>(path: string): Promise<T | null> {
  const text = await readText(path);
  return text === null ? null : (parse(text) as T);
}

function parse(text: string): unknown {
  return parseYaml(text);
}

async function walk(root: string, pattern: RegExp, depth = 0): Promise<string[]> {
  if (depth > WALK_MAX_DEPTH) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const e of entries) {
    if (WALK_SKIP.has(e.name)) continue;
    const full = join(root, e.name);
    if (e.isDirectory()) found.push(...(await walk(full, pattern, depth + 1)));
    else if (pattern.test(e.name)) found.push(full);
  }
  return found;
}

async function listOwnRepos(): Promise<Repo[]> {
  const entries = await readdir(DEV_ROOT, { withFileTypes: true });
  const repos: Repo[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || EXCLUDED_REPOS.includes(e.name)) continue;
    const path = join(DEV_ROOT, e.name);
    // A `.git` directory (not a file) excludes worktrees.
    const gitStat = await stat(join(path, '.git')).catch(() => null);
    if (!gitStat?.isDirectory()) continue;
    const kalliope = await readYaml<Answers>(join(path, '.copier-answers.kalliope.yml'));
    if (!kalliope && !(await isOwnWithoutUpstream(path))) continue;
    const daidalos = await readYaml<Answers>(join(path, '.copier-answers.yml'));
    repos.push({
      name: e.name,
      path,
      daidalos: daidalos?._src_path?.endsWith('Daidalos') ? daidalos : null,
      kalliope,
      templateFiles: [],
    });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

/** Own repos that never adopted Kalliope: origin under alainritter/ and no upstream remote (forks have one). */
async function isOwnWithoutUpstream(path: string): Promise<boolean> {
  const remotes = await git(path, ['remote', '-v']).catch(() => '');
  return remotes.includes('github.com/alainritter/') && !/^upstream\s/m.test(remotes);
}

function check(
  id: string,
  category: DriftCategory,
  label: string,
  status: DriftStatus,
  detail?: string,
  fix?: string
): DriftCheck {
  return { id, category, label, status, detail, fix };
}

// --- checks ---------------------------------------------------------------

function checkKalliope(repo: Repo, ctx: Context): DriftCheck {
  const label = 'Kalliope-README-Vorlage';
  if (repo.name === 'Kalliope') return check('kalliope', 'Struktur', label, 'na');
  const fix = `cd ${repo.path} && uvx copier update --trust --defaults --answers-file .copier-answers.kalliope.yml`;
  if (!repo.kalliope) {
    return check('kalliope', 'Struktur', label, 'fail', 'nicht eingebunden', fix);
  }
  if (repo.kalliope._commit === ctx.kalliopeTag) return check('kalliope', 'Struktur', label, 'ok');
  return check(
    'kalliope',
    'Struktur',
    label,
    'warn',
    `${repo.kalliope._commit}, aktuell ${ctx.kalliopeTag}`,
    fix
  );
}

async function checkDaidalosVersion(repo: Repo): Promise<DriftCheck> {
  const label = 'Daidalos-Vorlage aktuell';
  if (!repo.daidalos?._commit) return check('daidalos-version', 'Vorlage', label, 'na');
  const behind = Number(
    await git(join(DEV_ROOT, 'Daidalos'), [
      'rev-list',
      '--count',
      `${repo.daidalos._commit}..HEAD`,
      '--',
      'template',
      'copier.yml',
    ])
  );
  const status: DriftStatus =
    behind === 0 ? 'ok' : behind <= TEMPLATE_VERSION_WARN_MAX ? 'warn' : 'fail';
  return check(
    'daidalos-version',
    'Vorlage',
    label,
    status,
    behind ? `${behind} Commits hinter der Vorlage` : undefined,
    behind ? `cd ${repo.path} && uvx copier update --trust --defaults` : undefined
  );
}

/** Lists template files at the app's `_commit` and compares them byte for byte with the repo. */
async function checkDaidalosFiles(repo: Repo): Promise<DriftCheck> {
  const label = 'Vorlagendateien unverändert';
  const commit = repo.daidalos?._commit;
  if (!commit) return check('daidalos-files', 'Vorlage', label, 'na');
  const daidalosDir = join(DEV_ROOT, 'Daidalos');
  const [listing, copier] = await Promise.all([
    git(daidalosDir, ['ls-tree', '-r', '--name-only', commit, '--', 'template']),
    git(daidalosDir, ['show', `${commit}:copier.yml`]),
  ]);
  const skip = (parse(copier) as { _skip_if_exists?: string[] })._skip_if_exists ?? [];
  const isSkipped = (file: string) => {
    let skipped = false;
    for (const pattern of skip) {
      const negated = pattern.startsWith('!');
      if (matchesGlob(file, negated ? pattern.slice(1) : pattern)) skipped = !negated;
    }
    return skipped;
  };
  const files = listing
    .split('\n')
    .map(f => f.replace(/^template\//, ''))
    .filter(f => f && !f.endsWith('.jinja') && !f.includes('.ruff_cache/') && !isSkipped(f));
  repo.templateFiles = files;
  const changed: string[] = [];
  for (const file of files) {
    const [expected, actual] = await Promise.all([
      execFileAsync('git', ['-C', daidalosDir, 'show', `${commit}:template/${file}`], {
        encoding: 'buffer',
        maxBuffer: 20 * 1024 * 1024,
      }).then(r => r.stdout),
      readFile(join(repo.path, file)).catch(() => null),
    ]);
    if (!actual || !expected.equals(actual)) changed.push(file);
  }
  if (changed.length === 0) return check('daidalos-files', 'Vorlage', label, 'ok');
  const shown = changed.slice(0, 5).join(', ');
  return check(
    'daidalos-files',
    'Vorlage',
    label,
    'fail',
    `${changed.length} geändert: ${shown}${changed.length > 5 ? ', …' : ''}`,
    'Änderung nach ~/Dev/Daidalos verschieben, dann copier update'
  );
}

async function hasUi(repo: Repo): Promise<boolean> {
  if ((await walk(join(repo.path, 'static'), /\.(css|html)$/, WALK_MAX_DEPTH - 1)).length > 0) {
    return true;
  }
  const pkg = await readJson<PackageJson>(join(repo.path, 'package.json'));
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return 'vite' in deps || 'astro' in deps;
}

async function checkHarmoniaUsage(repo: Repo): Promise<DriftCheck> {
  const label = 'Harmonia eingebunden';
  if (HARMONIA_EXEMPT.includes(repo.name) || !(await hasUi(repo))) {
    return check('harmonia-usage', 'Design', label, 'na');
  }
  for (const file of await walk(repo.path, SOURCE_EXT)) {
    const text = await readText(file);
    if (text && (text.includes('Harmonia/') || text.includes('/ds/'))) {
      return check('harmonia-usage', 'Design', label, 'ok');
    }
  }
  return check(
    'harmonia-usage',
    'Design',
    label,
    'fail',
    'kein Verweis auf Harmonia gefunden',
    'Einbindung siehe ~/Dev/Harmonia/README.md'
  );
}

async function checkHarmoniaTokens(repo: Repo): Promise<DriftCheck> {
  const label = 'Keine Hex-Farben/px statt Tokens';
  if (HARMONIA_EXEMPT.includes(repo.name) || !(await hasUi(repo))) {
    return check('harmonia-tokens', 'Design', label, 'na');
  }
  const ignored = new Set(repo.templateFiles.map(f => join(repo.path, f)));
  const perFile: [string, number][] = [];
  let total = 0;
  for (const file of await walk(repo.path, STYLE_EXT)) {
    if (ignored.has(file)) continue;
    const text = (await readText(file))?.replace(/\/\*[\s\S]*?\*\//g, '');
    if (!text) continue;
    const count = (text.match(HEX_RE)?.length ?? 0) + (text.match(PX_RE)?.length ?? 0);
    if (count > 0) perFile.push([file.slice(repo.path.length + 1), count]);
    total += count;
  }
  if (total === 0) return check('harmonia-tokens', 'Design', label, 'ok');
  const top = perFile
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f, n]) => `${f} (${n})`)
    .join(', ');
  return check(
    'harmonia-tokens',
    'Design',
    label,
    total <= TOKEN_WARN_MAX ? 'warn' : 'fail',
    `${total} Funde: ${top}`,
    'durch Harmonia-Tokens ersetzen'
  );
}

function checkNetworkPorts(repo: Repo, ctx: Context): DriftCheck {
  const label = 'Ports in services.yaml';
  const a = repo.daidalos;
  if (!a) return check('netzwerk-ports', 'Infrastruktur', label, 'na');
  const missing: string[] = [];
  if (a.port && !ctx.activePorts.has(a.port)) missing.push(`port ${a.port}`);
  if (a.gateway) {
    if (a.caddy_port && !ctx.activePorts.has(a.caddy_port))
      missing.push(`caddy_port ${a.caddy_port}`);
    if (a.tailnet_port && !new RegExp(`:${a.tailnet_port}\\b`).test(ctx.tailnetText)) {
      missing.push(`tailnet_port ${a.tailnet_port}`);
    }
  }
  if (missing.length === 0) return check('netzwerk-ports', 'Infrastruktur', label, 'ok');
  return check(
    'netzwerk-ports',
    'Infrastruktur',
    label,
    'fail',
    `fehlt: ${missing.join(', ')}`,
    'Eintrag in ~/Dev/Netzwerk/services.yaml ergänzen'
  );
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

async function readJson<T>(path: string): Promise<T | null> {
  const text = await readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function major(version: string | undefined): number | null {
  const n = parseInt((version ?? '').replace(/^[\^~>=<\s]+/, ''), 10);
  return Number.isNaN(n) ? null : n;
}

/** `[tool.ruff] target-version`, else `requires-python`, as a comparable number (py312 → 312). */
async function pythonVersion(path: string): Promise<number | null> {
  const text = await readText(join(path, 'pyproject.toml'));
  if (!text) return null;
  const target = /target-version\s*=\s*"py(\d+)"/.exec(text);
  if (target) return Number(target[1]);
  const requires = /requires-python\s*=\s*"[^"\d]*(\d+)\.(\d+)/.exec(text);
  return requires ? Number(requires[1] + requires[2]) : null;
}

async function checkPython(repo: Repo, ctx: Context): Promise<DriftCheck> {
  const label = 'Python-Version';
  const version = await pythonVersion(repo.path);
  if (version === null) return check('python', 'Toolchain', label, 'na');
  if (version >= ctx.pythonRef) return check('python', 'Toolchain', label, 'ok');
  return check('python', 'Toolchain', label, 'warn', `py${version}, Referenz py${ctx.pythonRef}`);
}

function nodeVersions(pkg: PackageJson): Record<string, number> {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const result: Record<string, number> = {};
  for (const name of NODE_PACKAGES) {
    const v = major(deps[name]);
    if (v !== null) result[name] = v;
  }
  const pm = /^(\w+)@(\d+)/.exec(pkg.packageManager ?? '');
  if (pm) result[pm[1]] = Number(pm[2]);
  return result;
}

async function checkNode(repo: Repo, ctx: Context): Promise<DriftCheck> {
  const label = 'Node-Toolchain';
  const pkg = await readJson<PackageJson>(join(repo.path, 'package.json'));
  if (!pkg) return check('node', 'Toolchain', label, 'na');
  const behind = Object.entries(nodeVersions(pkg))
    .filter(([name, v]) => v < (ctx.nodeRef[name] ?? v))
    .map(([name, v]) => `${name} ${v} (${ctx.nodeRef[name]})`);
  if (behind.length === 0) return check('node', 'Toolchain', label, 'ok');
  return check('node', 'Toolchain', label, 'warn', behind.join(', '));
}

async function checkBasics(repo: Repo): Promise<DriftCheck> {
  const label = 'Grundstruktur';
  const missing: string[] = [];
  const has = (f: string) => exists(join(repo.path, f));
  if (!(await has('LICENSE.md'))) missing.push('LICENSE.md');
  if (!(await has('README.md'))) missing.push('README.md');
  if (!(await has('CLAUDE.md')) && !(await has('AGENTS.md'))) missing.push('CLAUDE.md/AGENTS.md');
  const workflows = await readdir(join(repo.path, '.github/workflows')).catch(() => []);
  if (!(await has('.githooks/pre-push')) && !workflows.some(f => /\.ya?ml$/.test(f))) {
    missing.push('Prüf-Gate (.githooks/pre-push oder Workflow)');
  }
  if (
    (await has('package.json')) &&
    !(await has('pnpm-lock.yaml')) &&
    !(await has('package-lock.json'))
  ) {
    missing.push('Lockfile');
  }
  const pyproject = await readText(join(repo.path, 'pyproject.toml'));
  if (pyproject && /^dependencies\s*=\s*\[\s*"/m.test(pyproject) && !(await has('uv.lock'))) {
    missing.push('uv.lock');
  }
  const remote = await git(repo.path, ['remote']).catch(() => '');
  if (remote && !(await has('.github/dependabot.yml'))) missing.push('.github/dependabot.yml');
  if (missing.length === 0) return check('basics', 'Struktur', label, 'ok');
  return check(
    'basics',
    'Struktur',
    label,
    missing.length === 1 ? 'warn' : 'fail',
    `fehlt: ${missing.join(', ')}`
  );
}

// --- scoring --------------------------------------------------------------

function scoreOf(checks: DriftCheck[]): number | null {
  const rated = checks.filter(c => c.status !== 'na');
  if (rated.length === 0) return null;
  const points = rated.reduce(
    (s, c) => s + (c.status === 'ok' ? 1 : c.status === 'warn' ? 0.5 : 0),
    0
  );
  return Math.round((100 * points) / rated.length);
}

/** A failing check must not tear down the whole report. */
async function safely(
  id: string,
  category: DriftCategory,
  fn: () => Promise<DriftCheck> | DriftCheck
) {
  try {
    return await fn();
  } catch (err) {
    return check(id, category, id, 'fail', (err as Error).message);
  }
}

async function buildContext(repos: Repo[]): Promise<Context> {
  const [kalliopeTag, daidalosHead, services] = await Promise.all([
    git(join(DEV_ROOT, 'Kalliope'), ['describe', '--tags', '--abbrev=0']).catch(() => ''),
    git(join(DEV_ROOT, 'Daidalos'), ['rev-parse', 'HEAD']).catch(() => ''),
    readYaml<{ services?: { port?: number; status?: string; url?: string; note?: string }[] }>(
      join(DEV_ROOT, 'Netzwerk', 'services.yaml')
    ),
  ]);
  const active = (services?.services ?? []).filter(s => s.status === 'active');
  const pythonRef = Math.max(
    0,
    ...(await Promise.all(repos.map(r => pythonVersion(r.path)))).map(v => v ?? 0)
  );
  const nodeRef: Record<string, number> = {};
  for (const repo of repos) {
    const pkg = await readJson<PackageJson>(join(repo.path, 'package.json'));
    if (!pkg) continue;
    for (const [name, v] of Object.entries(nodeVersions(pkg))) {
      nodeRef[name] = Math.max(nodeRef[name] ?? 0, v);
    }
  }
  return {
    kalliopeTag,
    daidalosHead,
    activePorts: new Set(active.flatMap(s => (s.port ? [s.port] : []))),
    tailnetText: active.map(s => `${s.url ?? ''} ${s.note ?? ''}`).join('\n'),
    pythonRef,
    nodeRef,
  };
}

async function checkRepo(repo: Repo, ctx: Context): Promise<DriftRepo> {
  // daidalos-files runs first: it fills `repo.templateFiles` for the token scan.
  const files = await safely('daidalos-files', 'Vorlage', () => checkDaidalosFiles(repo));
  const checks = [
    await safely('kalliope', 'Struktur', () => checkKalliope(repo, ctx)),
    await safely('daidalos-version', 'Vorlage', () => checkDaidalosVersion(repo)),
    files,
    await safely('harmonia-usage', 'Design', () => checkHarmoniaUsage(repo)),
    await safely('harmonia-tokens', 'Design', () => checkHarmoniaTokens(repo)),
    await safely('netzwerk-ports', 'Infrastruktur', () => checkNetworkPorts(repo, ctx)),
    await safely('python', 'Toolchain', () => checkPython(repo, ctx)),
    await safely('node', 'Toolchain', () => checkNode(repo, ctx)),
    await safely('basics', 'Struktur', () => checkBasics(repo)),
  ];
  return { name: repo.name, path: repo.path, score: scoreOf(checks) ?? 100, checks };
}

export async function computeDriftReport(): Promise<DriftReport> {
  try {
    const repos = await listOwnRepos();
    const ctx = await buildContext(repos);
    const results = await mapLimit(repos, CONCURRENCY, r => checkRepo(r, ctx));
    results.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    const all = results.flatMap(r => r.checks);
    return {
      score: Math.round(results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length)),
      categories: CATEGORIES.map(category => ({
        category,
        score: scoreOf(all.filter(c => c.category === category)) ?? 100,
      })),
      repos: results,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    return {
      score: 0,
      categories: [],
      repos: [],
      fetchedAt: Date.now(),
      error: (err as Error).message,
    };
  }
}

let cache: { at: number; promise: Promise<DriftReport> } | null = null;

export function getDriftReport(force = false): Promise<DriftReport> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.promise;
  const promise = computeDriftReport();
  cache = { at: Date.now(), promise };
  return promise;
}
