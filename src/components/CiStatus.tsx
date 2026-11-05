import { useState, useEffect, useCallback } from 'react';
import { Circle, RefreshCw } from 'lucide-react';
import type { CiState, CiStatusResponse } from '../../shared/types';
import { apiFetch } from '../lib/api';
import { toast } from '../lib/toast';

const POLL_MS = 5 * 60_000;

const STATE_COLOR: Record<CiState, string> = {
  success: 'text-good',
  failure: 'text-bad',
  running: 'text-warn',
  cancelled: 'text-warn',
};

export function CiStatus() {
  const [data, setData] = useState<CiStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      const res = await apiFetch(`/api/ci/status${refresh ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: CiStatusResponse = await res.json();
      setData(body);
      if (body.error) toast(`CI-Status: ${body.error}`);
    } catch (err) {
      toast(`CI-Status: ${err instanceof Error ? err.message : 'Fehler'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-accent">
          CHECKING CI<span className="blink-cursor"></span>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-text-dim text-sm">CI-Status nicht verfügbar</div>;

  const green = data.repos.filter(r => r.state === 'success').length;
  const allGreen = data.repos.length > 0 && green === data.repos.length;
  const visible = allGreen && !showAll ? [] : data.repos;

  return (
    <div className="h-full overflow-y-auto @container">
      <div className="flex items-center justify-between gap-2 mb-2 text-xs text-text-dim">
        <span>
          {allGreen ? `Alle ${data.repos.length} Repos grün` : `${green}/${data.repos.length} grün`}
          {data.noCiCount > 0 && ` · ${data.noCiCount} ohne CI`}
          {` · ${new Date(data.fetchedAt).toLocaleTimeString()}`}
        </span>
        <span className="flex items-center gap-1">
          {allGreen && (
            <button className="ds-btn ghost" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Einklappen' : 'Liste'}
            </button>
          )}
          <button onClick={() => load(true)} className="ds-btn ghost icon" title="Aktualisieren">
            <RefreshCw className="w-4 h-4 text-text-dim hover:text-accent" />
          </button>
        </span>
      </div>

      {data.error && <div className="text-xs text-bad mb-2">{data.error}</div>}

      <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-2">
        {visible.map(r => {
          const failed = r.workflows.filter(w => w.state === 'failure');
          return (
            <a
              key={r.repo}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2 bg-bg rounded border border-line hover:border-accent transition-all"
            >
              <div className="flex items-center gap-2">
                <Circle className={`w-3.5 h-3.5 fill-current ${STATE_COLOR[r.state]}`} />
                <span className="font-mono text-sm truncate">{r.repo.split('/')[1]}</span>
              </div>
              {failed.length > 0 && (
                <div className="text-xs text-bad mt-1 ml-5 truncate">
                  {failed.map(w => w.name).join(', ')}
                </div>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
