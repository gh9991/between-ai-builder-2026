import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectsAt } from './universe2-project-data.js';
const read = (name) => JSON.parse(readFileSync(new URL(`./data/scenarios/architect/${name}`, import.meta.url)));
const data = read('worklife.json'),config = read('scenario.json');
const first = projectsAt(data, config, data.snapshots[0]);
assert.equal(first.length, 0, 'No future projects at onboarding');
const final = projectsAt(data, config, data.snapshots.at(-1));
assert.equal(final.filter((p) => p.active).length, 4);
assert.equal(final.filter((p) => !p.active).length, 8);
assert.equal(final.length, 12, 'Full history includes ended/paused work');
for (const snapshot of data.snapshots) {
  for (const p of projectsAt(data, config, snapshot)) {
    assert(data.records.some((r) => r.project_id === p.id && r.first_seen_at <= snapshot.as_of));
    const source = snapshot.desk.project_states.find((s) => s.id === p.id);
    assert.equal(p.state, source.status);
    assert.equal(p.active, !['closed', 'completed', 'handed_back', 'on_hold'].includes(source.status));
    const raw = data.projects.find((x) => x.id === p.id),phase = raw.phases?.find((x) => x.id === source.phase);
    assert.equal(p.phase, phase?.label_zh || phase?.label_en || phase?.id || '');
  }
}
const paused = final.find((p) => p.state === 'on_hold');
assert(paused, 'Paused project retains its state');
const activeBefore = data.snapshots.some((s) => projectsAt(data, config, s).some((p) => p.id === paused.id && p.active));
assert(activeBefore, 'Replay restores work before its pause was known');
console.log('PASS: Universe 2 project visibility across 365 days, active/archive counts, dated phases and pause history.');

// Replay forwards and backwards through actual lifecycle transitions, including
// phase-only changes while a coarse status stays unchanged.
const at = (id, date) => projectsAt(data, config, data.snapshots.find((s) => s.date === date)).find((p) => p.id === id);
for (const [date, status, phase] of [
['2025-10-23', 'competition', 'Two weeks of design'],
['2025-10-24', 'submitted', 'Two weeks of design'],
['2025-10-27', 'submitted', 'Wait for the jury'],
['2025-12-05', 'closed', 'Result: not shortlisted; closed'],
['2025-10-23', 'competition', 'Two weeks of design']])
{
  const p = at('harbour_library', date);
  assert.equal(p.state, status);
  assert.equal(p.phase, phase);
  assert.equal(p.summary, status === 'closed' ? 'Closed' : `${config.status_labels[status]} · ${phase}`);
  assert.equal(p.date, date);
}
assert.equal(at('lakeside', '2026-09-20').state, 'pre_start');
assert.equal(at('lakeside', '2026-09-21').state, 'on_site');
assert.equal(at('westpark_hospital', '2026-06-04').active, true);
assert.equal(at('westpark_hospital', '2026-06-05').state, 'on_hold');
assert.equal(at('westpark_hospital', '2026-06-05').active, false);
assert.equal(at('hk_tower', '2026-01-16').state, 'handed_back');
console.log('PASS: replay labels change with dated status AND phase, including reverse playback, construction, pause and handback.');
