import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadBetween } from './between-data.js';
import { createProjectReplay, projectProgressMarkup } from './project-replay.js';
globalThis.location = { search: '' };
globalThis.fetch = async (url) => ({ json: async () => JSON.parse(await readFile(url, 'utf8')) });
for (const scenario of ['architect']) {
  const d = await loadBetween(scenario, { allProjects: true });
  const replay = createProjectReplay(d);
  assert.equal(replay.scope('missing'), null);
  for (const [slot, project] of Object.entries(d.PROJ)) {
    const scope = replay.scope(slot);
    assert(scope && scope.start <= scope.end && scope.end <= d.days);
    assert(d.projectAt(slot, scope.start));
    if (scope.start > 1) assert.equal(d.projectAt(slot, scope.start - 1), null);
    assert.equal(scope.activity.length, scope.end - scope.start + 1);
    assert.equal(scope.activity.reduce((sum, n) => sum + n, 0), scope.recordsAt(scope.end).length);
    for (let day = scope.start; day <= scope.end; day++) {
      assert(scope.recordsAt(day).every((r) => r.project_id === project.id && r.kind !== 'calendar' && r.first_seen_at <= d.W.snapshots[day - 1].as_of));
    }
    const delayed = scope.recordsAt(scope.end).find((r) => r.occurred_at.slice(0, 10) < r.first_seen_at.slice(0, 10));
    if (delayed) {
      const before = d.W.snapshots.findIndex((s) => s.as_of >= delayed.first_seen_at);
      assert(!scope.recordsAt(before).some((r) => r.id === delayed.id));
      assert(scope.recordsAt(before + 1).some((r) => r.id === delayed.id));
    }
  }
  if (scenario === 'architect') {
    const scope = (id) => replay.scope(Object.keys(d.PROJ).find((k) => d.PROJ[k].id === id));
    assert.equal(d.dateOf(scope('lakeside').start), '2025-10-07');
    assert.equal(scope('lakeside').end, 365);
    assert.equal(d.dateOf(scope('harbour_library').end), '2025-12-05');
    assert.equal(d.dateOf(scope('bayside_hall').end), '2026-01-23'); // actual closure, not planned date
    assert.equal(d.dateOf(scope('westpark_hospital').end), '2026-09-14'); // follow-up after pause
    assert.equal(d.projectAt(scope('westpark_hospital').slot, scope('westpark_hospital').end).state, 'on_hold');
    const terminal = scope('harbour_library');
    assert.equal(d.projectAt(terminal.slot, terminal.end).active, false); // still a valid review endpoint
  }
}
assert(!projectProgressMarkup([{ id: 'R1', title: '<script>', body: '<img>', first_seen_at: '2026-01-01', kind: 'document' }]).includes('<script>'));
console.log('PASS: scoped project ranges, activity totals, delayed knowledge, actual closure, post-pause follow-up and escaped source previews.');
