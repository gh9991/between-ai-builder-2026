import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { personWorkItems } from './universe2-work-list.js';

const record = (id, first_seen_at = '2026-01-01') => ({ id, first_seen_at, occurred_at: '2026-01-01', project_id: 'school' });
const unit = (id, type, status = 'open', extra = {}) => ({ id, type, record_id: 'r1', project_id: 'school', from_id: 'dian', to_ids: ['grace'], text: id, status_history: [{ at: '2026-01-01', status }], ...extra });
const data = { records: [record('r1'), record('late-evidence', '2026-03-01')], work_units: [
  unit('file', 'file_pointer'), unit('update', 'update'),
  unit('task', 'task', undefined, { task_id: 't1', status_history: [] }),
  unit('fb1', 'feedback', 'open', { group_id: 'g1' }),
  unit('fb2', 'feedback', 'likely_addressed', { group_id: 'g1' }),
  unit('fb3', 'feedback', 'addressed', { group_id: 'g1' }),
  unit('question', 'question', 'open', { status_history: [{ at: '2026-01-01', status: 'open' }, { at: '2026-02-01', status: 'answered', evidence_ids: ['late-evidence'] }] }),
  unit('other-project', 'task', 'open', { project_id: 'office' }),
  unit('other-person', 'task', 'open', { from_id: 'someone', to_ids: ['grace'] }),
  unit('future-source', 'promise', 'open', { record_id: 'late-evidence' })]
};
const snapshot = { as_of: '2026-02-15', task_states: [{ id: 't1', status: 'completed' }] };
const rows = personWorkItems(data, snapshot, 'dian', 'school');
assert.equal(rows.find((r) => r.unit.id === 'file').bucket, 'history');
assert.equal(rows.find((r) => r.unit.id === 'update').bucket, 'history');
assert.equal(rows.find((r) => r.unit.id === 'task').label, 'Done');
assert.deepEqual(rows.filter((r) => r.feedback).map((r) => r.bucket), ['pending', 'review', 'history']);
assert.equal(rows.find((r) => r.unit.id === 'question').bucket, 'pending', 'Unseen completion evidence must not clear a request');
assert(!rows.some((r) => ['other-project', 'other-person', 'future-source'].includes(r.unit.id)));
const later = personWorkItems(data, { ...snapshot, as_of: '2026-03-02' }, 'dian', 'school');
assert.equal(later.find((r) => r.unit.id === 'question').label, 'Done');
assert(later.some((r) => r.unit.id === 'future-source'));
const all = personWorkItems(data, snapshot, 'dian');
assert(all.some((r) => r.unit.id === 'other-project'));
// The user's example: Davin's metro diagram was pending on the 29th, done on the 30th.
const architect = JSON.parse(readFileSync(new URL('./data/scenarios/architect/worklife.json', import.meta.url)));
for (const date of ['2026-09-29', '2026-09-30']) {
  const day = architect.snapshots.find((s) => s.date === date);
  const diagram = personWorkItems(architect, day, 'davin', 'riverside').find((r) => r.unit.text.startsWith('Redraw the metro link'));
  assert(diagram);
  assert.equal(diagram.bucket, date === '2026-09-29' ? 'pending' : 'history');
}
console.log('Universe 2 work list: source visibility, person/project scope, task completion, and feedback states passed.');
