import { execFile } from 'child_process';
import { promisify } from 'util';
import type { CiRepo, CiState, CiStatusResponse, CiWorkflow } from '../../shared/types.js';
import { mapLimit } from './gitStatus.js';

const execFileAsync = promisify(execFile);

const GH_TIMEOUT_MS = 30_000;
const CACHE_MS = 3 * 60_000;
const CONCURRENCY = 6;
const SEVERITY: Record<CiState, number> = { failure: 0, running: 1, cancelled: 2, success: 3 };

interface GhRepo {
  nameWithOwner: string;
  isPrivate: boolean;
  defaultBranchRef: { name: string } | null;
}

interface GhRun {
  workflowName: string;
  status: string;
  conclusion: string;
  url: string;
  createdAt: string;
  event: string;
}

async function gh<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync('gh', args, {
    timeout: GH_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

function toState(run: GhRun): CiState {
  if (run.status !== 'completed') return 'running';
  switch (run.conclusion) {
    case 'failure':
    case 'timed_out':
    case 'startup_failure':
    case 'action_required':
      return 'failure';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'success';
  }
}

async function repoCi(repo: GhRepo): Promise<CiRepo | null> {
  const branch = repo.defaultBranchRef?.name;
  if (!branch) return null;
  const runs = await gh<GhRun[]>([
    'run',
    'list',
    '--repo',
    repo.nameWithOwner,
    '--branch',
    branch,
    '--limit',
    '20',
    '--json',
    'workflowName,status,conclusion,url,createdAt,event',
  ]);
  // Runs come newest first; the first run per workflow is its current state.
  // `dynamic` runs are GitHub-managed jobs (Dependabot updates), not the repo's CI.
  const latest = new Map<string, CiWorkflow>();
  for (const run of runs) {
    if (run.event === 'dynamic' || latest.has(run.workflowName)) continue;
    latest.set(run.workflowName, {
      name: run.workflowName,
      state: toState(run),
      url: run.url,
      createdAt: run.createdAt,
    });
  }
  const workflows = [...latest.values()];
  if (workflows.length === 0) return null;
  const worst = workflows.reduce((a, b) => (SEVERITY[b.state] < SEVERITY[a.state] ? b : a));
  return {
    repo: repo.nameWithOwner,
    branch,
    isPrivate: repo.isPrivate,
    state: worst.state,
    workflows,
    url: worst.url,
  };
}

async function fetchCiStatus(): Promise<CiStatusResponse> {
  try {
    const repos = await gh<GhRepo[]>([
      'repo',
      'list',
      '--source',
      '--no-archived',
      '--limit',
      '200',
      '--json',
      'nameWithOwner,defaultBranchRef,isPrivate',
    ]);
    const results = await mapLimit(repos, CONCURRENCY, r => repoCi(r).catch(() => null));
    const withCi = results.filter((r): r is CiRepo => r !== null);
    withCi.sort((a, b) => SEVERITY[a.state] - SEVERITY[b.state] || a.repo.localeCompare(b.repo));
    return { repos: withCi, noCiCount: repos.length - withCi.length, fetchedAt: Date.now() };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const text = (e.stderr || e.message || 'gh failed').trim().split('\n')[0];
    return { repos: [], noCiCount: 0, fetchedAt: Date.now(), error: text };
  }
}

let cache: { at: number; promise: Promise<CiStatusResponse> } | null = null;

export function getCiStatus(force = false): Promise<CiStatusResponse> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.promise;
  const promise = fetchCiStatus();
  cache = { at: Date.now(), promise };
  return promise;
}
