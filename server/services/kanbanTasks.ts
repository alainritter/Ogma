import { watch } from 'fs';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { mkdir, readdir, readFile, rename, stat, writeFile, open } from 'fs/promises';
import { homedir } from 'os';
import { basename, join } from 'path';
import { splitProjects } from '../../shared/kanban.js';
import type { KanbanActivity, KanbanStatus, KanbanTask } from '../../shared/types.js';

// Task files: one Markdown file per task in TASK_DIR, frontmatter title/status/project/created.
const TASK_DIR = process.env.KANBAN_DIR || join(homedir(), '.local/share/kanban/tasks');
const ARCHIVE_DIR = join(TASK_DIR, 'archive');
const ACTIVITY_DIR = join(TASK_DIR, '..', 'activity');
const ATTACHMENT_DIR = join(TASK_DIR, '..', 'attachments');
const PROJECTS_DIR = join(homedir(), 'Dev');
const STATUSES: readonly KanbanStatus[] = ['todo', 'doing', 'review', 'done'];
const FILE_RE = /^\d{3}-[a-z0-9-]+\.md$/;

function isTaskFile(name: string): boolean {
  return FILE_RE.test(name);
}

async function parseTask(file: string): Promise<KanbanTask> {
  const text = await readFile(join(TASK_DIR, file), 'utf-8');
  const meta: Record<string, string> = {};
  let body = text;
  if (text.startsWith('---\n') && text.slice(4).includes('\n---')) {
    const rest = text.slice(4);
    const end = rest.indexOf('\n---');
    body = rest.slice(end + 4).replace(/^\n+/, '');
    for (const line of rest.slice(0, end).split('\n')) {
      const i = line.indexOf(':');
      if (i >= 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const status = STATUSES.find(s => s === meta.status) ?? 'todo';
  return {
    file,
    number: file.split('-', 1)[0],
    title: meta.title || file.replace(/\.md$/, ''),
    status,
    project: meta.project ?? '',
    created: meta.created ?? '',
    body,
    idea: status === 'todo' && !/^## Plan\b/m.test(body),
    preview: meta.preview ?? '',
    previewCmd: meta.preview_cmd ?? '',
  };
}

async function saveTask(task: KanbanTask): Promise<void> {
  let head = `title: ${task.title}\nstatus: ${task.status}\nproject: ${task.project}\ncreated: ${task.created}`;
  if (task.preview) head += `\npreview: ${task.preview}`;
  if (task.previewCmd) head += `\npreview_cmd: ${task.previewCmd}`;
  await writeFile(join(TASK_DIR, task.file), `---\n${head}\n---\n\n${task.body.trim()}\n`, 'utf-8');
}

let cache: { tasks: KanbanTask[]; etag: string } | null = null;
let watching = false;
let debounce: NodeJS.Timeout | undefined;

function startWatching() {
  if (watching) return;
  try {
    watch(TASK_DIR, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        cache = null;
      }, 200);
    });
    watching = true;
  } catch {
    // Directory missing: retry on next request, no cache invalidation until then.
  }
}

export async function listTasks(): Promise<{ tasks: KanbanTask[]; etag: string }> {
  if (cache) return cache;
  let names: string[] = [];
  try {
    names = (await readdir(TASK_DIR)).filter(isTaskFile);
  } catch {
    // no board yet
  }
  startWatching();
  const stamps = await Promise.all(
    names.map(async n => `${n}:${(await stat(join(TASK_DIR, n))).mtimeMs}`)
  );
  // newest first: created desc, then task number desc
  const tasks = (await Promise.all(names.map(parseTask))).sort(
    (a, b) => b.created.localeCompare(a.created) || b.file.localeCompare(a.file)
  );
  const etag = `"${createHash('sha1').update(stamps.join('|')).digest('hex')}"`;
  cache = { tasks, etag };
  return cache;
}

export async function listProjects(): Promise<string[]> {
  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function findTask(file: string): Promise<KanbanTask> {
  if (!isTaskFile(file)) throw new Error('Invalid task file');
  return parseTask(file);
}

export async function setStatus(file: string, status: KanbanStatus): Promise<void> {
  const task = await findTask(file);
  task.status = status;
  await saveTask(task);
  cache = null;
}

export async function updateTask(
  file: string,
  input: { title: string; body: string }
): Promise<void> {
  const task = await findTask(file);
  if (!task.idea) throw new Error('Only ideas can be edited');
  task.title = input.title;
  task.body = input.body;
  await saveTask(task);
  cache = null;
}

export async function setProject(file: string, project: string): Promise<void> {
  const task = await findTask(file);
  task.project = project;
  await saveTask(task);
  cache = null;
}

const SLUG_MAP: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[äöüß]/g, c => SLUG_MAP[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return slug || 'aufgabe';
}

/** Create a task file with the next free number (tasks/ and archive/ together). */
export async function createTask(input: {
  title: string;
  project: string;
  body: string;
}): Promise<KanbanTask> {
  await mkdir(TASK_DIR, { recursive: true });
  const names = [
    ...(await readdir(TASK_DIR)),
    ...(await readdir(ARCHIVE_DIR).catch(() => [] as string[])),
  ].filter(isTaskFile);
  const next = Math.max(0, ...names.map(n => Number(n.slice(0, 3)))) + 1;
  const file = `${String(next).padStart(3, '0')}-${slugify(input.title)}.md`;
  const task: KanbanTask = {
    file,
    number: file.split('-', 1)[0],
    title: input.title,
    status: 'todo',
    project: input.project,
    created: new Date().toLocaleDateString('sv-SE'),
    body: input.body,
    idea: true,
    preview: '',
    previewCmd: '',
  };
  await saveTask(task);
  cache = null;
  return task;
}

/** Store an uploaded file under attachments/NNN/ and list its absolute path in the task's `## Anhänge` section. */
export async function addAttachment(file: string, name: string, data: Buffer): Promise<string> {
  const task = await findTask(file);
  const dir = join(ATTACHMENT_DIR, task.number);
  await mkdir(dir, { recursive: true });
  const safe =
    basename(name)
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/^\.+/, '_') || 'datei';
  const dot = safe.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ''];
  const taken = new Set(await readdir(dir));
  let target = safe;
  for (let i = 2; taken.has(target); i++) target = `${stem}-${i}${ext}`;
  const path = join(dir, target);
  await writeFile(path, data);
  const body = task.body.trimEnd();
  task.body = /^## Anhänge\s*$/m.test(body)
    ? `${body}\n- ${path}`
    : `${body}\n\n## Anhänge\n\n- ${path}`;
  await saveTask(task);
  cache = null;
  return path;
}

export async function archiveTask(file: string): Promise<void> {
  if (!isTaskFile(file)) throw new Error('Invalid task file');
  await mkdir(ARCHIVE_DIR, { recursive: true });
  await rename(join(TASK_DIR, file), join(ARCHIVE_DIR, file));
  cache = null;
}

// Loopback preview hosts are tried as 127.0.0.1, localhost and [::1].
async function reachableUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]', '::1'];
  const candidates = loopback.includes(parsed.hostname)
    ? ['127.0.0.1', 'localhost', '[::1]'].map(h => {
        const u = new URL(url);
        u.hostname = h;
        return u.toString();
      })
    : [url];
  for (const c of candidates) {
    try {
      await fetch(c, { signal: AbortSignal.timeout(1500) });
      return c;
    } catch {
      // try next
    }
  }
  return null;
}

/** Start the preview server if needed (not stopped again), return the reachable URL. */
export async function startPreview(file: string): Promise<string> {
  const task = await findTask(file);
  if (!task.preview) throw new Error('No preview set');
  let target = await reachableUrl(task.preview);
  if (target) return target;
  if (!task.previewCmd) throw new Error(`${task.preview} is not reachable`);

  const log = join(TASK_DIR, '..', `preview-${splitProjects(task.project)[0] || 'task'}.log`);
  const out = await open(log, 'w');
  const child = spawn(task.previewCmd, {
    shell: true,
    cwd: join(PROJECTS_DIR, splitProjects(task.project)[0] ?? ''),
    detached: true,
    stdio: ['ignore', out.fd, out.fd],
  });
  child.unref();
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  const deadline = Date.now() + 90_000;
  while (!(target = await reachableUrl(task.preview))) {
    if (exited) throw new Error(`Preview server exited, see ${log}`);
    if (Date.now() > deadline) throw new Error(`Preview server did not start, see ${log}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  await out.close();
  return target;
}

/** A `working` session silent for longer than this is treated as stuck (long builds stay below it). */
const ACTIVITY_STUCK_S = 600;

/**
 * Live state of Claude sessions, written per session by ~/.claude/hooks/kanban-activity.sh.
 * A session belongs to the task named in its `/kanban NNN` prompt; otherwise to the `doing`
 * task of the project it runs in. Sessions matching neither are not shown.
 */
export async function listActivity(): Promise<KanbanActivity[]> {
  let names: string[] = [];
  try {
    names = (await readdir(ACTIVITY_DIR)).filter(n => n.endsWith('.json'));
  } catch {
    return [];
  }
  const doing = (await listTasks()).tasks.filter(t => t.status === 'doing');
  const now = Date.now() / 1000;
  const result: KanbanActivity[] = [];
  for (const name of names) {
    try {
      const a = JSON.parse(await readFile(join(ACTIVITY_DIR, name), 'utf-8'));
      const inProject = doing.filter(t =>
        splitProjects(t.project).includes(basename(String(a.cwd ?? '')))
      );
      const number = a.task || (inProject.length === 1 ? inProject[0].number : '');
      if (!number) continue;
      const age = Math.max(0, Math.round(now - Number(a.ts)));
      let state: KanbanActivity['state'] =
        a.state === 'working' || a.state === 'asking' || a.state === 'error' ? a.state : 'idle';
      let summary = String(a.summary ?? '');
      if (state === 'working' && age > ACTIVITY_STUCK_S) {
        state = 'error';
        summary = `Keine Meldung seit ${Math.round(age / 60)} min`;
      }
      result.push({ number, state, summary, age });
    } catch {
      // half-written or foreign file: skip
    }
  }
  return result;
}
