// Reads Claude Code transcripts (read-only) to show which model does what on a Kanban task.
// Transcript layout: <project dir>/<session>.jsonl, subagents in <project dir>/<session>/subagents/
// as agent-<id>.jsonl plus agent-<id>.meta.json (agentType, description, finished).
import { readdir, readFile, rename, stat, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { basename, join, resolve, sep } from 'path';
import type {
  KanbanAgent,
  KanbanModelUsage,
  KanbanTaskInsight,
  KanbanTimelineEntry,
} from '../../shared/types.js';

const TRANSCRIPT_ROOT = join(homedir(), '.claude', 'projects') + sep;
const TIMELINE_MAX = 60;
const MAIN_ACTOR = 'Haupt';
/** An unfinished subagent silent for longer than this counts as gone. */
const AGENT_IDLE_S = 600;

interface ParsedTranscript {
  model: string;
  usage: Map<string, KanbanModelUsage>;
  timeline: KanbanTimelineEntry[];
  first: number;
  last: number;
}

export interface RememberedSession {
  session: string;
  transcript: string;
  first: number;
  last: number;
}

/** `claude-opus-5-5-20261001` → `opus-5-5`. */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

/** Transcript paths come from files on disk; only accept ones inside ~/.claude/projects. */
export function safeTranscript(path: unknown): string {
  if (typeof path !== 'string' || !path.endsWith('.jsonl')) return '';
  const full = resolve(path);
  return full.startsWith(TRANSCRIPT_ROOT) ? full : '';
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const path = str(input.file_path) || str(input.notebook_path);
  const target =
    name === 'Bash'
      ? str(input.description) || str(input.command).split(' ')[0]
      : path
        ? basename(path)
        : str(input.pattern) || str(input.description);
  // mcp__<server>__<tool> → <tool>
  return `${name.replace(/^mcp__.*__/, '')} ${target.slice(0, 60)}`.trim();
}

const cache = new Map<string, { mtimeMs: number; size: number; result: ParsedTranscript }>();

async function parseTranscript(path: string, actor: string): Promise<ParsedTranscript> {
  const info = await stat(path);
  const key = `${actor}\0${path}`;
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.result;
  const result: ParsedTranscript = {
    model: '',
    usage: new Map(),
    timeline: [],
    first: 0,
    last: 0,
  };
  for (const line of (await readFile(path, 'utf-8')).split('\n')) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = Date.parse(entry.timestamp ?? '') / 1000;
    if (ts) {
      result.first = result.first || ts;
      result.last = ts;
    }
    const msg = entry.message;
    if (entry.type !== 'assistant' || !msg?.model || msg.model === '<synthetic>') continue;
    const model = shortModel(String(msg.model));
    result.model = model;
    const u = result.usage.get(model) ?? { model, input: 0, output: 0, cacheRead: 0, messages: 0 };
    u.input += Number(msg.usage?.input_tokens) || 0;
    u.output += Number(msg.usage?.output_tokens) || 0;
    u.cacheRead += Number(msg.usage?.cache_read_input_tokens) || 0;
    u.messages += 1;
    result.usage.set(model, u);
    for (const block of Array.isArray(msg.content) ? msg.content : []) {
      if (block?.type !== 'tool_use') continue;
      result.timeline.push({
        ts: ts || 0,
        actor,
        model,
        label: toolLabel(String(block.name), block.input ?? {}),
      });
    }
  }
  result.timeline = result.timeline.slice(-TIMELINE_MAX);
  cache.set(key, { mtimeMs: info.mtimeMs, size: info.size, result });
  return result;
}

/** Model of the main session's latest reply. */
export async function sessionModel(transcript: string): Promise<string> {
  return (await parseTranscript(transcript, MAIN_ACTOR)).model;
}

async function subagentTranscripts(
  transcript: string
): Promise<{ agent: KanbanAgent; parsed: ParsedTranscript }[]> {
  const dir = join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  let names: string[];
  try {
    names = (await readdir(dir)).filter(n => n.startsWith('agent-') && n.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const result = [];
  for (const name of names) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(await readFile(join(dir, name.replace(/\.jsonl$/, '.meta.json')), 'utf-8'));
    } catch {
      // no meta file: generic subagent
    }
    const type = typeof meta.agentType === 'string' ? meta.agentType : 'Subagent';
    try {
      const parsed = await parseTranscript(join(dir, name), type);
      result.push({
        agent: {
          type,
          description: typeof meta.description === 'string' ? meta.description : '',
          model: parsed.model,
          // killed or crashed agents never get `finished`, so also require recent output
          running: meta.finished !== true && Date.now() / 1000 - parsed.last < AGENT_IDLE_S,
        },
        parsed,
      });
    } catch {
      // vanished between readdir and read
    }
  }
  return result;
}

export async function runningAgents(transcript: string): Promise<KanbanAgent[]> {
  return (await subagentTranscripts(transcript)).map(s => s.agent).filter(a => a.running);
}

/** Upserts a session into sessions/<NNN>.json so a task keeps its history after the session ends. */
export async function rememberSession(
  sessionsDir: string,
  number: string,
  session: string,
  transcript: string
): Promise<void> {
  const file = join(sessionsDir, `${number}.json`);
  const list = await rememberedSessions(sessionsDir, number);
  const now = Math.round(Date.now() / 1000);
  const known = list.find(s => s.session === session);
  if (known && known.transcript === transcript && now - known.last < 60) return;
  if (known) {
    known.transcript = transcript;
    known.last = now;
  } else {
    list.push({ session, transcript, first: now, last: now });
  }
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(list, null, 2));
  await rename(`${file}.tmp`, file);
}

async function rememberedSessions(sessionsDir: string, number: string) {
  try {
    const list = JSON.parse(await readFile(join(sessionsDir, `${number}.json`), 'utf-8'));
    return Array.isArray(list) ? (list as RememberedSession[]) : [];
  } catch {
    return [];
  }
}

/** Models, subagents and recent actions of all sessions that worked on a task. */
export async function buildInsight(
  sessionsDir: string,
  number: string,
  liveSessions: Set<string>
): Promise<KanbanTaskInsight> {
  const usage = new Map<string, KanbanModelUsage>();
  const insight: KanbanTaskInsight = { sessions: [], models: [], agents: [], timeline: [] };
  const add = (parsed: ParsedTranscript) => {
    for (const u of parsed.usage.values()) {
      const sum = usage.get(u.model) ?? { ...u, input: 0, output: 0, cacheRead: 0, messages: 0 };
      sum.input += u.input;
      sum.output += u.output;
      sum.cacheRead += u.cacheRead;
      sum.messages += u.messages;
      usage.set(u.model, sum);
    }
    insight.timeline.push(...parsed.timeline);
  };
  for (const s of await rememberedSessions(sessionsDir, number)) {
    const transcript = safeTranscript(s.transcript);
    if (!transcript) continue;
    try {
      const main = await parseTranscript(transcript, MAIN_ACTOR);
      add(main);
      insight.sessions.push({
        id: s.session,
        first: main.first || s.first,
        last: main.last || s.last,
        live: liveSessions.has(s.session),
      });
      for (const sub of await subagentTranscripts(transcript)) {
        add(sub.parsed);
        insight.agents.push(sub.agent);
      }
    } catch {
      // transcript deleted: skip the session
    }
  }
  insight.models = [...usage.values()].sort((a, b) => b.output - a.output);
  insight.timeline = insight.timeline.sort((a, b) => a.ts - b.ts).slice(-TIMELINE_MAX);
  insight.sessions.sort((a, b) => a.first - b.first);
  return insight;
}
