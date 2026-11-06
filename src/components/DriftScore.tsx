import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, RefreshCw } from 'lucide-react';
import type { DriftReport, DriftStatus } from '../../shared/types';
import { apiFetch } from '../lib/api';
import { toast } from '../lib/toast';

const POLL_MS = 10 * 60_000;
const GOOD_MIN = 90;
const WARN_MIN = 70;

function scoreColor(score: number): string {
  return score >= GOOD_MIN ? 'text-good' : score >= WARN_MIN ? 'text-warn' : 'text-bad';
}

function barColor(score: number): string {
  return score >= GOOD_MIN ? 'bg-good' : score >= WARN_MIN ? 'bg-warn' : 'bg-bad';
}

const STATUS_COLOR: Record<DriftStatus, string> = {
  ok: 'text-good',
  warn: 'text-warn',
  fail: 'text-bad',
  na: 'text-text-dim',
};

export function DriftScore() {
  const [data, setData] = useState<DriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      const res = await apiFetch(`/api/drift${refresh ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: DriftReport = await res.json();
      setData(body);
      if (body.error) toast(`Drift: ${body.error}`);
    } catch (err) {
      toast(`Drift: ${err instanceof Error ? err.message : 'Fehler'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Kopiert');
    } catch {
      toast('Kopieren fehlgeschlagen');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-accent">
          CHECKING DRIFT<span className="blink-cursor"></span>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-text-dim text-sm">Drift nicht verfügbar</div>;

  const repos = showAll ? data.repos : data.repos.filter(r => r.score < 100);

  return (
    <div className="h-full overflow-y-auto @container">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-col @md:flex-row @md:items-center gap-3 flex-1 min-w-0">
          <div className={`text-4xl font-mono ${scoreColor(data.score)}`}>{data.score}</div>
          <div className="grid grid-cols-1 @md:grid-cols-5 gap-x-3 gap-y-1 flex-1 min-w-0">
            {data.categories.map(c => (
              <div key={c.category} className="min-w-0">
                <div className="flex justify-between text-xs text-text-dim">
                  <span className="truncate">{c.category}</span>
                  <span>{c.score}</span>
                </div>
                <div className="h-1.5 bg-bg rounded">
                  <div
                    className={`h-full rounded ${barColor(c.score)}`}
                    style={{ width: `${c.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <span className="flex items-center gap-1">
          <button className="ds-btn ghost" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Nur Funde' : 'Alle zeigen'}
          </button>
          <button onClick={() => load(true)} className="ds-btn ghost icon" title="Aktualisieren">
            <RefreshCw className="w-4 h-4 text-text-dim hover:text-accent" />
          </button>
        </span>
      </div>

      {data.error && <div className="text-xs text-bad mb-2">{data.error}</div>}

      <div className="flex flex-col gap-1">
        {repos.map(r => {
          const expanded = open === r.name;
          const findings = r.checks.filter(c => c.status === 'warn' || c.status === 'fail');
          return (
            <div key={r.name} className="bg-bg rounded border border-line">
              <button
                className="flex items-center gap-2 w-full p-2 text-left"
                onClick={() => setOpen(expanded ? null : r.name)}
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-text-dim" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-text-dim" />
                )}
                <span className={`font-mono text-sm w-8 ${scoreColor(r.score)}`}>{r.score}</span>
                <span className="font-mono text-sm truncate">{r.name}</span>
                <span className="text-xs text-text-dim ml-auto">{findings.length}</span>
              </button>
              {expanded && (
                <div className="px-2 pb-2 flex flex-col gap-1">
                  {findings.length === 0 && (
                    <div className="text-xs text-text-dim">Keine Funde</div>
                  )}
                  {findings.map(c => (
                    <div key={c.id} className="flex items-start gap-2 text-xs">
                      <span className={`font-mono w-8 shrink-0 ${STATUS_COLOR[c.status]}`}>
                        {c.status}
                      </span>
                      <span className="flex-1 min-w-0">
                        {c.label}
                        {c.detail && <span className="text-text-dim">: {c.detail}</span>}
                      </span>
                      {c.fix && (
                        <button
                          className="ds-btn ghost icon"
                          title={c.fix}
                          onClick={() => copy(c.fix!)}
                        >
                          <Copy className="w-3.5 h-3.5 text-text-dim hover:text-accent" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
