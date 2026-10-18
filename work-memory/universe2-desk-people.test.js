import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deskPeopleAt } from './universe2-desk-people.js';
const data = { records: [{ id: 'r', first_seen_at: '2026-01-02' }, { id: 'future', first_seen_at: '2026-01-05' }], work_units: [] };
const snapshot = { as_of: '2026-01-03', connections: { nodes: [{ person_id: 'a' }, { person_id: 'b' }] }, task_states: [
  { owner_id: 'me', counterparty_id: 'a', title: 'My task', status: 'open', source_ids: ['r'] },
  { owner_id: 'a', counterparty_id: 'me', title: 'Their task', status: 'open', source_ids: ['r'] },
  { owner_id: 'b', counterparty_id: 'me', title: 'Done', status: 'completed', source_ids: ['r'] },
  { owner_id: 'b', counterparty_id: 'someone_else', title: 'Not ours', status: 'open', source_ids: ['r'] },
  { owner_id: 'b', counterparty_id: 'me', title: 'Not yet known', status: 'open', source_ids: ['future'] },
  { owner_id: 'unknown', counterparty_id: 'me', title: 'Unknown person', status: 'open', source_ids: ['r'] }]
};
let rows = deskPeopleAt(data, snapshot, 'me');assert.equal(rows.length, 1);assert.equal(rows[0].id, 'a');assert.equal(rows[0].mine.length, 1);assert.equal(rows[0].waiting.length, 1);
snapshot.task_states[0].status = 'completed';rows = deskPeopleAt(data, snapshot, 'me');assert.equal(rows[0].mine.length, 0);assert.equal(rows[0].waiting.length, 1, 'Waiting alone does not become a request to me');
assert.deepEqual(deskPeopleAt(data, { ...snapshot, as_of: '2026-01-01' }, 'me'), []);
for (const scenario of ['architect']) {
  const read = (name) => JSON.parse(readFileSync(new URL(`./data/scenarios/${scenario}/${name}.json`, import.meta.url)));
  const d = read('worklife'),c = read('scenario');
  for (const s of d.snapshots) {
    const rows = deskPeopleAt(d, s, c.persona_id),known = new Set(d.records.filter((r) => r.first_seen_at <= s.as_of).map((r) => r.id));
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'One figure per person');
    for (const row of rows) {
      assert.notEqual(row.id, c.persona_id);assert(s.connections.nodes.some((n) => n.person_id === row.id));
      for (const item of [...row.mine, ...row.waiting]) assert(known.has(item.recordId), 'Every item links to already-known evidence');
    }
  }
  if (scenario === 'architect') {
    const end = deskPeopleAt(d, d.snapshots.at(-1), c.persona_id);
    assert.deepEqual(end.map((r) => r.id).sort(), ['dian', 'hannah', 'robert', 'siyi']);
    assert.equal(end.find((r) => r.id === 'hannah').waiting.length, 1);
  }
}
console.log('PASS: one companion per person, task direction, completed/future exclusions and dated evidence for all three year-long archives.');
