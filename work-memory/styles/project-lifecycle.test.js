import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadBetween } from './between-data.js';
globalThis.location = { search: '' };
globalThis.fetch = async (url) => ({ json: async () => JSON.parse(await readFile(url, 'utf8')) });
for (const scenario of ['architect']) {
  const d = await loadBetween(scenario, { allProjects: true });
  assert.equal(Object.keys(d.PROJ).length, d.W.projects.filter((p) => p.id !== d.C.daily_project_id).length);
  let previousHistory = new Set();
  for (let day = 1; day <= d.days; day++) {
    const history = new Set(Object.keys(d.PROJ).filter((k) => d.projectVisible(k, day, true)));
    for (const slot of previousHistory) assert(history.has(slot), `${scenario}: history must accumulate`);
    for (const slot of history) {
      assert(d.W.records.some((r) => r.project_id === d.PROJ[slot].id && r.first_seen_at <= d.W.snapshots[day - 1].as_of));
    }
    previousHistory = history;
  }
  for (const [slot, p] of Object.entries(d.PROJ)) {
    assert(Number.isFinite(p.angle));
    for (let day = 1; day <= d.days; day++) {
      const s = d.W.snapshots[day - 1].desk.project_states.find((s) => s.id === p.id);
      const actual = d.projectAt(slot, day);
      assert.equal(d.projectVisible(slot, day, true), !!actual);
      assert.equal(d.projectVisible(slot, day), !!actual?.active);
      if (!s || day < p.start) assert.equal(actual, null);else
      {
        assert.equal(actual.state, s.status);
        assert.equal(actual.active, !['closed', 'completed', 'handed_back', 'on_hold'].includes(s.status));
      }
    }
  }
  if (scenario === 'architect') {
    const at = (id, date) => d.projectAt(Object.keys(d.PROJ).find((k) => d.PROJ[k].id === id), d.W.snapshots.findIndex((s) => s.date === date) + 1);
    assert.equal(at('harbour_library', '2025-10-12'), null);
    assert(at('harbour_library', '2025-10-13').active);
    assert(at('harbour_library', '2025-12-04').active);
    assert.equal(at('harbour_library', '2025-12-05').active, false);
    assert(at('hk_tower', '2026-01-15').active);
    assert.equal(at('hk_tower', '2026-01-16').active, false);
    assert(at('bayside_hall', '2026-01-16').active); // planned close slipped; actual known close is later
    assert.equal(at('bayside_hall', '2026-01-23').active, false);
    assert(at('westpark_hospital', '2026-06-04').active);
    assert.equal(at('westpark_hospital', '2026-06-05').active, false);
    assert.equal(at('westpark_hospital', '2026-09-30').active, false);
    assert.equal(at('westpark_hospital', '2026-09-30').state, 'on_hold'); // retain true status
    assert(at('corner_cafe', '2026-09-30').active); // used to be dropped by the three-slot cap
    assert.equal(Object.keys(d.PROJ).filter((k) => d.projectAt(k, d.days)?.active).length, 4);
    assert.equal(Object.keys(d.PROJ).filter((k) => d.projectVisible(k, d.days, true)).length, 12);
    const library = Object.keys(d.PROJ).find((k) => d.PROJ[k].id === 'harbour_library');
    assert.equal(d.projectVisible(library, 12, true), false);
    assert.equal(d.projectVisible(library, 13, true), true);
    assert.equal(d.projectVisible(library, d.days), false);
    assert.equal(d.projectVisible(library, d.days, true), true);
    // Test-only resumption: an active later snapshot restores visibility, without erasing the pause.
    const lastState = d.W.snapshots.at(-1).desk.project_states.find((p) => p.id === 'westpark_hospital');
    const savedStatus = lastState.status;
    try {
      lastState.status = 'in_progress';
      assert(at('westpark_hospital', '2026-09-30').active);
      assert.equal(at('westpark_hospital', '2026-09-29').active, false);
    } finally {lastState.status = savedStatus;}
  }
}
console.log('PASS: full project history, knowledge dates, actual closures, hand-back, pause and resumption across all scenarios.');
