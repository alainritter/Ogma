import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Copy,
  ExternalLink,
  Inbox,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import type {
  KanbanActivity,
  KanbanAgent,
  KanbanStatus,
  KanbanTask,
  KanbanTaskInsight,
} from '../../shared/types';
import { apiFetch } from '../lib/api';
import { toast } from '../lib/toast';
import { useSettingJSON } from '../lib/settings';
import { splitProjects } from '../../shared/kanban';

const COLUMNS: { status: KanbanStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'Offen', color: 'var(--sig-grey)' },
  { status: 'doing', label: 'In Arbeit', color: 'var(--sig-blue)' },
  { status: 'review', label: 'Review', color: 'var(--sig-yellow)' },
  { status: 'done', label: 'Erledigt', color: 'var(--sig-green)' },
];
const POLL_MS = 3000;
// A working session that stopped reporting (crash, closed terminal) is no longer shown as live.
const CATEGORY_COLORS = 10;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const formatSize = (b: number) =>
  b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024))} KB`
    : `${(b / 1024 / 1024).toFixed(1)} MB`;

// Stable colour per project name from the design-system category palette.
const projectColor = (name: string) => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % CATEGORY_COLORS;
  return `var(--cat-${hash + 1})`;
};

function NewTaskDialog({
  projects,
  onClose,
  onCreated,
}: {
  projects: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [projectList, setProjectList] = useState<string[]>([]);
  const [projectInput, setProjectInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [devProjects, setDevProjects] = useState<string[]>([]);

  useEffect(() => {
    ref.current?.showModal();
    apiFetch('/api/kanban/projects')
      .then(r => (r.ok ? r.json() : []))
      .then(setDevProjects)
      .catch(() => {});
  }, []);

  const addProject = (raw: string) => {
    const name = raw.trim();
    if (name && !projectList.includes(name)) setProjectList([...projectList, name]);
    setProjectInput('');
  };

  const addFiles = (list: FileList | File[]) => {
    const picked = Array.from(list);
    const tooBig = picked.find(f => f.size > MAX_UPLOAD_BYTES);
    setError(tooBig ? `${tooBig.name} ist größer als 25 MB` : '');
    setFiles(prev => [...prev, ...picked.filter(f => f.size <= MAX_UPLOAD_BYTES)]);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files).map(f =>
      f.name === 'image.png' ? new File([f], `clipboard-${Date.now()}.png`, { type: f.type }) : f
    );
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/kanban/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          project: [...projectList, projectInput.trim()].filter(Boolean).join(', '),
          body,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Request failed');
      const task: KanbanTask = await res.json();
      // The task exists now; a failed upload must not make a retry create a duplicate.
      for (const f of files) {
        const up = await apiFetch(
          `/api/kanban/tasks/${encodeURIComponent(task.file)}/attachments?name=${encodeURIComponent(f.name)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f }
        );
        if (!up.ok) toast(`Anhang ${f.name} konnte nicht hochgeladen werden`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      setSaving(false);
    }
  };

  return (
    <dialog ref={ref} className="ds-dialog" onClose={onClose}>
      <form className="ds-dialog-body" onSubmit={submit} onPaste={onPaste}>
        <h3 className="ds-dialog-title">Neue Idee</h3>
        <p className="ds-dialog-text">
          Roh festhalten genügt. Claude formuliert die Idee sauber und plant sie mit /kanban-new.
          Dateien landen als Pfade unter Anhänge in der Aufgabe.
        </p>
        <label className="flex flex-col gap-1">
          <span className="ds-label">Titel</span>
          <input
            className="ds-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ds-label">Projekte (das erste ist das Hauptprojekt)</span>
          {projectList.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {projectList.map(p => (
                <button
                  key={p}
                  type="button"
                  className="ds-chip"
                  style={{ '--c': projectColor(p) } as React.CSSProperties}
                  title="Entfernen"
                  onClick={() => setProjectList(projectList.filter(x => x !== p))}
                >
                  {p}
                  <X size={12} />
                </button>
              ))}
            </span>
          )}
          <input
            className="ds-input"
            list="kanban-projects"
            value={projectInput}
            placeholder="Projekt hinzufügen"
            onChange={e => {
              const v = e.target.value;
              // Picking a datalist entry fires a replacement event, typing a character does not.
              if (!(e.nativeEvent as InputEvent).inputType && v) addProject(v);
              else setProjectInput(v);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addProject(projectInput);
              }
            }}
            maxLength={100}
          />
          <datalist id="kanban-projects">
            {[...new Set([...devProjects, ...projects])].sort().map(p => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="ds-label">Idee</span>
          <textarea
            className="ds-input"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={20000}
          />
        </label>
        <div
          className="flex flex-col gap-1"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <span className="ds-label">Dateien (auch per Drop oder Einfügen)</span>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="truncate">{f.name}</span>
              <span className="text-text-muted">{formatSize(f.size)}</span>
              <button
                type="button"
                className="ds-btn sm icon ghost ml-auto"
                aria-label={`${f.name} entfernen`}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                <X />
              </button>
            </div>
          ))}
          <label className="ds-btn sm">
            Dateien wählen
            <input
              type="file"
              multiple
              hidden
              onChange={e => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="ds-dialog-error">{error}</p>
        <div className="ds-dialog-actions">
          <button type="button" className="ds-btn" onClick={() => ref.current?.close()}>
            Abbrechen
          </button>
          <button type="submit" className={`ds-btn primary ${saving ? 'busy' : ''}`}>
            Festhalten
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Plan steps are `- [ ]` / `- [x]` lines under `## Plan`; Claude ticks them off while implementing.
const planProgress = (body: string) => {
  const plan = body.split(/^## Plan\b.*$/m)[1]?.split(/^## /m)[0] ?? '';
  const boxes = plan.match(/^\s*- \[[ xX]\]/gm) ?? [];
  const done = boxes.filter(b => !b.endsWith('[ ]')).length;
  return { done, total: boxes.length };
};

const PlanProgress = ({ body, color }: { body: string; color: string }) => {
  const { done, total } = planProgress(body);
  if (total === 0) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-text-muted">
      <span
        className="ds-progress flex-1"
        style={{ '--v': done / total, '--c': color } as React.CSSProperties}
      >
        <span />
      </span>
      <span className="tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
};

const ACTIVITY_LABEL: Record<Exclude<KanbanActivity['state'], 'idle'>, string> = {
  working: 'Arbeitet',
  asking: 'Rückfrage nötig',
  error: 'Problem',
};

const ACTIVITY_COLOR: Record<Exclude<KanbanActivity['state'], 'idle'>, string> = {
  working: 'text-good',
  asking: 'text-warn',
  error: 'text-bad',
};

const ActivityDot = ({ activity }: { activity?: KanbanActivity }) => {
  if (!activity || activity.state === 'idle') return null;
  const label = `${ACTIVITY_LABEL[activity.state]}${activity.summary ? `: ${activity.summary}` : ''}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`absolute top-2 right-2 w-2 h-2 rounded-full bg-current ${ACTIVITY_COLOR[activity.state]} ${
        activity.state === 'asking' ? 'kanban-blink' : ''
      }`}
    />
  );
};

// Model family → signal colour, so the same model reads the same everywhere on the board.
const MODEL_FAMILIES = [
  { key: 'opus', label: 'Opus', color: 'var(--sig-orange)' },
  { key: 'sonnet', label: 'Sonnet', color: 'var(--sig-blue)' },
  { key: 'haiku', label: 'Haiku', color: 'var(--sig-green)' },
  { key: 'fable', label: 'Fable', color: 'var(--sig-yellow)' },
];
const modelFamily = (model: string) => {
  const f = MODEL_FAMILIES.find(m => model.includes(m.key));
  return { label: f?.label ?? model, color: f?.color ?? 'var(--sig-grey)' };
};

const ModelChip = ({ model }: { model: string }) => {
  if (!model) return null;
  const f = modelFamily(model);
  return (
    <span
      className="ds-chip shrink-0"
      title={model}
      style={{ '--c': f.color } as React.CSSProperties}
    >
      {f.label}
    </span>
  );
};

const agentLine = (a: KanbanAgent) =>
  `${a.type}${a.description ? ` – ${a.description}` : ''}${a.model ? ` (${a.model})` : ''}`;

const LiveActivity = ({ activity }: { activity?: KanbanActivity }) => {
  if (!activity || activity.state === 'idle') return null;
  const agents = activity.agents ?? [];
  return (
    <span className={`flex items-center gap-1 min-w-0 text-xs ${ACTIVITY_COLOR[activity.state]}`}>
      <span className="truncate">{activity.summary || ACTIVITY_LABEL[activity.state]}</span>
      <ModelChip model={activity.model ?? ''} />
      {agents.length > 0 && (
        <span className="ds-chip shrink-0" title={agents.map(agentLine).join('\n')}>
          +{agents.length} {agents.length === 1 ? 'Agent' : 'Agents'}
        </span>
      )}
    </span>
  );
};

const fmtTokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n);
const fmtTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
// Time only for today, otherwise with date.
const fmtWhen = (ts: number) =>
  new Date(ts * 1000).toDateString() === new Date().toDateString()
    ? fmtTime(ts)
    : new Date(ts * 1000).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

const ModelDot = ({ model }: { model: string }) => (
  <span
    className="shrink-0 w-2 h-2 rounded-full"
    title={model}
    style={{ background: modelFamily(model).color }}
  />
);

// Who worked on the task with which model: token share per model, subagents, recent actions.
const TaskInsight = ({ number }: { number: string }) => {
  const [insight, setInsight] = useState<KanbanTaskInsight | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await apiFetch(`/api/kanban/tasks/${number}/insight`);
        if (res.ok && !cancelled) setInsight(await res.json());
      } catch {
        // the detail view works without insight
      }
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [number]);

  if (!insight) return null;
  const live = insight.sessions.some(s => s.live);
  const totalOut = insight.models.reduce((n, m) => n + m.output, 0) || 1;
  return (
    <section className="flex flex-col gap-3 p-3 text-xs bg-elevated border border-line rounded-lg">
      <header className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-text">Aktivität</span>
        {live && (
          <span className="flex items-center gap-1 text-good">
            <span className="w-2 h-2 rounded-full bg-current" />
            live
          </span>
        )}
        {insight.sessions.length > 0 && (
          <span className="ml-auto truncate text-text-muted">
            {insight.sessions.length} {insight.sessions.length === 1 ? 'Session' : 'Sessions'} ·
            seit {fmtWhen(insight.sessions[0].first)}
          </span>
        )}
      </header>
      {!insight.sessions.length ? (
        <p className="text-text-muted">Noch keine Sessions erfasst</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-active">
              {insight.models.map(m => (
                <span
                  key={m.model}
                  style={{
                    width: `${(m.output / totalOut) * 100}%`,
                    background: modelFamily(m.model).color,
                  }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {insight.models.map(m => (
                <li
                  key={m.model}
                  className="flex items-center gap-1"
                  title={`${m.model}: ${fmtTokens(m.output)} Output, ${fmtTokens(m.input + m.cacheRead)} Input, ${m.messages} Antworten`}
                >
                  <ModelDot model={m.model} />
                  <span className="text-text">{modelFamily(m.model).label}</span>
                  <span className="text-text-muted tabular-nums">
                    {Math.round((m.output / totalOut) * 100)} % · {fmtTokens(m.output)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {insight.agents.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-text-muted">Agents</span>
              <ul className="flex flex-col gap-1">
                {insight.agents.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 min-w-0" title={agentLine(a)}>
                    <ModelDot model={a.model} />
                    <span className="shrink-0 text-text">{a.type}</span>
                    <span className="truncate text-text-muted">{a.description}</span>
                    <span
                      className={`ml-auto shrink-0 ${a.running ? 'text-good' : 'text-text-muted'}`}
                    >
                      {a.running ? 'läuft' : 'fertig'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insight.timeline.length > 0 && (
            <div className="flex flex-col gap-1 min-h-0">
              <span className="text-text-muted">Verlauf</span>
              <ol className="flex flex-col gap-1 max-h-48 overflow-auto">
                {[...insight.timeline].reverse().map((e, i) => (
                  <li key={i} className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-text-muted tabular-nums">{fmtTime(e.ts)}</span>
                    <ModelDot model={e.model} />
                    <span className="truncate text-text-dim">
                      {e.actor !== 'Haupt' && <span className="text-text-muted">{e.actor} · </span>}
                      {e.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
};

// Slash command that starts work on the task; copying it is a deliberate act of focusing on one task.
const kanbanCommand = (t: KanbanTask): string | null => {
  if (t.status === 'done') return null;
  if (t.status === 'review') return `/kanban-review ${t.number}`;
  return t.idea ? `/kanban-new ${t.number}` : `/kanban ${t.number}`;
};

const CopyCommand = ({ task }: { task: KanbanTask }) => {
  const cmd = kanbanCommand(task);
  if (!cmd) return null;
  return (
    <button
      type="button"
      className="ds-btn sm icon"
      draggable={false}
      aria-label={`Befehl kopieren: ${cmd}`}
      title={cmd}
      onClick={async e => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(cmd);
          toast(`Kopiert: ${cmd}`, 'success');
        } catch {
          toast('Kopieren fehlgeschlagen');
        }
      }}
    >
      <Copy />
    </button>
  );
};

const ProjectChips = ({ project }: { project: string }) => (
  <>
    {splitProjects(project).map(name => (
      <span
        key={name}
        className="ds-chip"
        style={{ '--c': projectColor(name) } as React.CSSProperties}
      >
        {name}
      </span>
    ))}
  </>
);

function ProjectEditor({
  project,
  options,
  disabled,
  onChange,
}: {
  project: string;
  options: string[];
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const [input, setInput] = useState('');
  const list = splitProjects(project);
  const add = (raw: string) => {
    const name = raw.trim();
    setInput('');
    if (name && !list.includes(name)) onChange([...list, name].join(', '));
  };
  return (
    <>
      {list.map(name => (
        <button
          key={name}
          type="button"
          className="ds-chip"
          style={{ '--c': projectColor(name) } as React.CSSProperties}
          title="Entfernen"
          disabled={disabled}
          onClick={() => onChange(list.filter(x => x !== name).join(', '))}
        >
          {name}
          <X size={12} />
        </button>
      ))}
      <input
        className="ds-input sm max-w-full"
        list="kanban-detail-projects"
        value={input}
        disabled={disabled}
        placeholder="+ Projekt"
        maxLength={100}
        onChange={e => {
          const v = e.target.value;
          // Picking a datalist entry fires a replacement event, typing a character does not.
          if (!(e.nativeEvent as InputEvent).inputType && v) add(v);
          else setInput(v);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(input);
          }
        }}
      />
      <datalist id="kanban-detail-projects">
        {options.map(p => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ file: string; title: string; body: string } | null>(
    null
  );
  const [creating, setCreating] = useState(false);
  const [hidden, setHidden] = useSettingJSON<KanbanStatus[]>('kanban-hidden-columns', []);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<KanbanStatus | null>(null);
  const [activity, setActivity] = useState<KanbanActivity[]>([]);
  const etag = useRef('');

  const loadActivity = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await apiFetch('/api/kanban/activity');
      if (res.ok) setActivity(await res.json());
    } catch {
      // the board works without live state
    }
  }, []);

  const load = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const headers: Record<string, string> = etag.current ? { 'If-None-Match': etag.current } : {};
      const res = await apiFetch('/api/kanban/tasks', { headers });
      if (res.status === 304) return;
      if (!res.ok) throw new Error('Failed to load Kanban tasks');
      etag.current = res.headers.get('ETag') ?? '';
      setTasks(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      loadActivity();
    }
  }, [loadActivity]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', load);
    };
  }, [load]);

  const post = async (file: string, action: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/kanban/tasks/${file}/${action}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      return data;
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Request failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const move = async (task: KanbanTask, delta: number) => {
    const next = COLUMNS[COLUMNS.findIndex(c => c.status === task.status) + delta];
    if (next && (await post(task.file, 'status', { status: next.status }))) await load();
  };

  const drop = async (status: KanbanStatus) => {
    const task = tasks.find(t => t.file === dragging);
    setDragging(null);
    setDropTarget(null);
    if (!task || task.status === status) return;
    setTasks(prev => prev.map(t => (t.file === task.file ? { ...t, status } : t)));
    if (await post(task.file, 'status', { status })) etag.current = '';
    await load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (await post(editing.file, 'edit', { title: editing.title, body: editing.body })) {
      setEditing(null);
      etag.current = '';
      await load();
    }
  };

  const archive = async (task: KanbanTask) => {
    if (await post(task.file, 'archive')) {
      setSelected(null);
      await load();
    }
  };

  const openPreview = async (task: KanbanTask) => {
    toast('Starte Vorschau …', 'info');
    const data = await post(task.file, 'preview');
    if (data?.url) window.open(data.url, '_blank');
  };

  const projects = [...new Set(tasks.flatMap(t => splitProjects(t.project)))].sort();
  const visible = tasks.filter(t => !project || splitProjects(t.project).includes(project));
  const shownColumns = COLUMNS.filter(c => !hidden.includes(c.status));
  const detail = tasks.find(t => t.file === selected);

  if (error && tasks.length === 0) {
    return <div className="flex items-center justify-center h-full text-bad text-sm">{error}</div>;
  }

  if (detail) {
    const index = COLUMNS.findIndex(c => c.status === detail.status);
    const col = COLUMNS[index];
    const edit = editing?.file === detail.file ? editing : null;
    return (
      <div className="flex flex-col h-full gap-3 min-h-0">
        <div className="flex items-start gap-2">
          <button className="ds-btn sm icon" onClick={() => setSelected(null)} aria-label="Zurück">
            <X />
          </button>
          <div className="min-w-0 flex-1">
            {edit ? (
              <input
                className="ds-input"
                aria-label="Titel"
                value={edit.title}
                maxLength={200}
                onChange={e => setEditing({ ...edit, title: e.target.value })}
              />
            ) : (
              <div className="text-base font-semibold text-text">{detail.title}</div>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-muted">
              <span className="ds-chip" style={{ '--c': col.color } as React.CSSProperties}>
                {col.label}
              </span>
              {detail.idea && <span className="ds-badge warn">Idee</span>}
              <ProjectEditor
                project={detail.project}
                options={projects}
                disabled={busy}
                onChange={async next => {
                  if (await post(detail.file, 'project', { project: next })) {
                    etag.current = '';
                    await load();
                  }
                }}
              />
              <span>
                {detail.number} · {detail.created}
              </span>
            </div>
          </div>
          <button
            className="ds-btn sm icon"
            disabled={busy || index === 0}
            onClick={() => move(detail, -1)}
            aria-label="Status zurück"
          >
            <ArrowLeft />
          </button>
          <button
            className="ds-btn sm icon"
            disabled={busy || index === COLUMNS.length - 1}
            onClick={() => move(detail, 1)}
            aria-label="Status vor"
          >
            <ArrowRight />
          </button>
          {detail.preview && (
            <button
              className="ds-btn sm icon"
              disabled={busy}
              onClick={() => openPreview(detail)}
              aria-label="Vorschau"
            >
              <ExternalLink />
            </button>
          )}
          {detail.idea && !edit && (
            <button
              className="ds-btn sm icon"
              disabled={busy}
              onClick={() =>
                setEditing({ file: detail.file, title: detail.title, body: detail.body })
              }
              aria-label="Bearbeiten"
              title="Bearbeiten"
            >
              <Pencil />
            </button>
          )}
          <CopyCommand task={detail} />
          <button
            className="ds-btn sm icon"
            disabled={busy}
            onClick={() => archive(detail)}
            aria-label="Archivieren"
          >
            <Archive />
          </button>
        </div>
        <LiveActivity activity={activity.find(a => a.number === detail.number)} />
        <PlanProgress body={detail.body} color={col.color} />
        <TaskInsight number={detail.number} />
        {edit ? (
          <>
            <textarea
              className="ds-input flex-1 min-h-0 text-sm"
              aria-label="Text"
              value={edit.body}
              maxLength={20_000}
              onChange={e => setEditing({ ...edit, body: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                className="ds-btn sm primary"
                disabled={busy || !edit.title.trim()}
                onClick={saveEdit}
              >
                Speichern
              </button>
              <button className="ds-btn sm" disabled={busy} onClick={() => setEditing(null)}>
                Abbrechen
              </button>
            </div>
          </>
        ) : (
          <pre className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap text-sm text-text-dim bg-elevated border border-line rounded-lg p-3">
            {detail.body}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="ds-select min-w-0 flex-1 @xl:flex-none"
          value={project}
          onChange={e => setProject(e.target.value)}
          aria-label="Projekt"
        >
          <option value="">Alle Projekte</option>
          {projects.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="hidden @md:inline shrink-0 whitespace-nowrap text-xs text-text-muted">
          {visible.length} Aufgaben
        </span>
        <div
          className="flex flex-wrap items-center gap-1 order-last w-full @xl:order-none @xl:w-auto @xl:ml-2"
          role="group"
          aria-label="Spalten"
        >
          {COLUMNS.map(col => {
            const shown = !hidden.includes(col.status);
            return (
              <button
                key={col.status}
                aria-pressed={shown}
                onClick={() =>
                  setHidden(shown ? [...hidden, col.status] : hidden.filter(s => s !== col.status))
                }
                className={`ds-chip cursor-pointer ${shown ? '' : 'empty'}`}
                style={{ '--c': shown ? col.color : undefined } as React.CSSProperties}
              >
                {col.label}
              </button>
            );
          })}
        </div>
        <button className="ds-btn sm primary ml-auto" onClick={() => setCreating(true)}>
          <Plus />
          Idee
        </button>
      </div>
      <div
        className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-(--cols) gap-3 @4xl:flex-1 @4xl:min-h-0"
        style={
          { '--cols': `repeat(${shownColumns.length || 1}, minmax(0, 1fr))` } as React.CSSProperties
        }
      >
        {shownColumns.map(col => {
          const items = visible.filter(t => t.status === col.status);
          const isTarget = dropTarget === col.status;
          return (
            <div
              key={col.status}
              onDragOver={e => {
                e.preventDefault();
                setDropTarget(col.status);
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
              }}
              onDrop={e => {
                e.preventDefault();
                drop(col.status);
              }}
              className={`flex flex-col gap-2 p-2 min-w-0 rounded-lg border bg-bg-sidebar transition-colors @4xl:min-h-0 ${
                isTarget ? 'border-accent bg-hover' : 'border-line'
              }`}
            >
              <div className="flex items-center gap-2 px-1 py-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: col.color }}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-text">{col.label}</span>
                <span className="ds-badge">{items.length}</span>
              </div>
              <div className="flex flex-col gap-3 @4xl:overflow-auto @4xl:min-h-0">
                {items.map(t => {
                  const act = activity.find(a => a.number === t.number);
                  return (
                    <div
                      key={t.file}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={() => setDragging(t.file)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      onClick={() => setSelected(t.file)}
                      onKeyDown={e => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSelected(t.file);
                        }
                      }}
                      className={`relative flex flex-col gap-3 p-4 text-left rounded-md border border-line bg-elevated shadow-sm cursor-grab transition hover:border-line-strong hover:shadow-md active:cursor-grabbing ${
                        dragging === t.file ? 'opacity-40' : ''
                      } ${act?.state === 'working' ? 'kanban-working' : ''}`}
                    >
                      <ActivityDot activity={act} />
                      <span className="flex items-start gap-2 pr-4">
                        <span className="flex-1 text-base font-medium text-text line-clamp-3">
                          {t.title}
                        </span>
                        {t.idea && <span className="ds-badge warn">Idee</span>}
                      </span>
                      <LiveActivity activity={act} />
                      {t.status !== 'done' && <PlanProgress body={t.body} color={col.color} />}
                      <span className="flex flex-wrap gap-1">
                        <ProjectChips project={t.project} />
                      </span>
                      <span className="flex items-center gap-2 min-w-0 text-xs text-text-muted">
                        <span className="whitespace-nowrap">
                          {t.number} · {t.created}
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          <CopyCommand task={t} />
                          {t.status === 'done' && (
                            <button
                              type="button"
                              className="ds-btn sm icon"
                              draggable={false}
                              disabled={busy}
                              aria-label="Archivieren"
                              title="Archivieren"
                              onClick={e => {
                                e.stopPropagation();
                                archive(t);
                              }}
                            >
                              <Archive />
                            </button>
                          )}
                        </span>
                      </span>
                    </div>
                  );
                })}
                {col.status === 'todo' && (
                  <button
                    className="ds-btn sm ghost justify-start text-text-muted"
                    onClick={() => setCreating(true)}
                  >
                    <Plus />
                    Idee hinzufügen
                  </button>
                )}
                {items.length === 0 && (
                  <div className="flex flex-col items-center gap-1 py-6 text-xs text-text-muted border border-dashed border-line rounded-md">
                    <Inbox className="w-4 h-4" />
                    Keine Aufgaben
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {creating && (
        <NewTaskDialog
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            etag.current = '';
            load();
          }}
        />
      )}
    </div>
  );
}
