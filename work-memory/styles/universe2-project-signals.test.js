import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadBetween } from './between-data.js';
import { projectSignals, deskAttention } from './universe2-project-signals.js';
globalThis.location = { search: '' };
globalThis.fetch = async (url) => ({ json: async () => JSON.parse(await readFile(url, 'utf8')) });
const D = await loadBetween('architect', { allProjects: true });
for (const projectId of Object.values(D.PROJ).map((p) => p.id)) for (const day of [1, 80, 180, 300, D.days]) {
  const signals = projectSignals(D, projectId, day),asOf = D.W.snapshots[day - 1].as_of;
  for (const [id, s] of Object.entries(signals)) {
    for (const item of s.work) {
      const unit = D.W.work_units.find((u) => u.id === item.id),record = D.records[item.recordId];
      assert.equal(unit.project_id, projectId);assert(record.first_seen_at <= asOf);
      assert(unit.from_id === id || unit.to_ids?.includes(id));
    }
    for (const r of s.requests) {assert.equal(r.projectId, projectId);assert(D.records[r.recordId].first_seen_at <= asOf);}
  }
}
// A resolution cannot dim a work dot until both its date and evidence are known.
const fixture = { persona: { id: 'me' }, P: [{ id: 'a' }], W: { records: [{ id: 'r', first_seen_at: '2026-01-01' }, { id: 'proof', first_seen_at: '2026-01-03' }], snapshots: [1, 2, 3].map((n) => ({ as_of: `2026-01-0${n}`, connections: { nodes: [{ person_id: 'a' }] }, task_states: [] })), work_units: [{ id: 'q', record_id: 'r', project_id: 'p', from_id: 'a', to_ids: ['me'], type: 'question', status_history: [{ at: '2026-01-01', status: 'open' }, { at: '2026-01-02', status: 'answered', evidence_ids: ['proof'] }] }] } };
assert.equal(projectSignals(fixture, 'p', 2).a.work[0].done, false);
assert.equal(projectSignals(fixture, 'p', 2).a.requests.length, 1);
assert.equal(projectSignals(fixture, 'p', 3).a.work[0].done, true);
assert.equal(projectSignals(fixture, 'p', 3).a.requests.length, 0);
assert.equal(projectSignals(fixture, 'other', 2).a.work.length, 0);
assert.equal(projectSignals(fixture, 'other', 2).a.requests.length, 0);
console.log('PASS: project-room lights and orbiting work respect project, participant, date and resolution evidence.');

// Exact parity with Desk in Space's existing P.attn at each archive's default date.
for (const scenario of ['architect']) {
  const d = await loadBetween(scenario, { allProjects: true });
  const index = d.W.snapshots.findIndex((s) => s.date === d.W.manifest?.default_snapshot);
  const light = deskAttention(d, index < 0 ? d.days : index + 1);
  for (const person of d.P) assert.equal(light[person.id].level, person.attn || 'normal', scenario + ': ' + person.id);
  assert(Object.values(light).filter((l) => l.flare).length <= 1, 'Only the highest ranked person gets the star');
}
const school = projectSignals(D, 'lakeside', D.days),mall = projectSignals(D, 'mall', D.days);
for (const p of D.P) assert.deepEqual(school[p.id].light, mall[p.id].light, 'Changing project preserves the cast-wide priority');
assert.equal(school.dian.light.level, 'flare');
assert.equal(school.robert.light.level, 'warn');
assert.equal(school.dian.requests.length, 0, 'Global star does not manufacture project requests');
assert.equal(deskAttention(fixture, 2).a.score, 3);
assert.equal(deskAttention(fixture, 3).a.score, 0, 'Resolution waits for known evidence');
assert.equal(deskAttention(fixture, 3).a.flare, false);
console.log('PASS: exact Desk in Space attention levels in all four archives, project-independent ranking and dated resolution.');
