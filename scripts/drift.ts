import type { DriftRepo } from '../shared/types.js';
import { computeDriftReport } from '../server/services/drift.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const repoFlag = args.indexOf('--repo');
const onlyRepo = repoFlag >= 0 ? args[repoFlag + 1] : undefined;

const report = await computeDriftReport();
if (onlyRepo) report.repos = report.repos.filter(r => r.name === onlyRepo);

function printRepo(repo: DriftRepo) {
  console.log(`\n${String(repo.score).padStart(3)}  ${repo.name}`);
  for (const c of repo.checks) {
    if (!onlyRepo && (c.status === 'ok' || c.status === 'na')) continue;
    console.log(`       ${c.status.padEnd(4)} ${c.label}${c.detail ? `: ${c.detail}` : ''}`);
    if (c.fix) console.log(`            fix: ${c.fix}`);
  }
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.error) {
  console.error(report.error);
} else {
  console.log(`Drift score: ${report.score}`);
  for (const c of report.categories) console.log(`  ${c.category.padEnd(14)} ${c.score}`);
  report.repos.forEach(printRepo);
}
