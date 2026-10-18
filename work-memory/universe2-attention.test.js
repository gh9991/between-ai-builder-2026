import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attentionAt } from './universe2-attention.js';
const data = { records: [{ id: 'q', first_seen_at: '2026-01-03' }, { id: 'answer', first_seen_at: '2026-01-06' }, { id: 'task', first_seen_at: '2026-01-02' }], work_units: [
  { type: 'question', record_id: 'q', from_id: 'a', to_ids: ['me'], text: 'Question', status_history: [{ at: '2026-01-01', status: 'open', evidence_ids: ['q'] }, { at: '2026-01-04', status: 'answered', evidence_ids: ['answer'] }] },
  { type: 'question', record_id: 'q', from_id: 'b', to_ids: ['someone_else'], status_history: [{ at: '2026-01-01', status: 'open' }] },
  { type: 'promise', record_id: 'q', from_id: 'b', to_ids: ['me'], status_history: [{ at: '2026-01-01', status: 'late' }] },
  { type: 'feedback', record_id: 'q', from_id: 'b', to_ids: ['me'], status_history: [{ at: '2026-01-01', status: 'likely_addressed' }] }]
};
const snapshot = (as_of) => ({ as_of, connections: { nodes: [{ person_id: 'a' }, { person_id: 'b' }] }, task_states: [] });
assert.deepEqual(attentionAt(data, snapshot('2026-01-02'), 'me'), {});
assert.equal(attentionAt(data, snapshot('2026-01-03'), 'me').a.length, 1);
assert.equal(attentionAt(data, snapshot('2026-01-05'), 'me').a.length, 1, 'Resolution must be known, not only dated in the past');
assert.deepEqual(attentionAt(data, snapshot('2026-01-06'), 'me'), {}, 'Answered / others’ requests / their late promises / likely addressed are not demands on me');
const tasks = snapshot('2026-01-03');tasks.task_states = [{ owner_id: 'me', counterparty_id: 'a', status: 'open', source_ids: ['task'] }, { owner_id: 'b', counterparty_id: 'me', status: 'open', source_ids: ['task'] }];
assert.deepEqual(Object.keys(attentionAt({ ...data, work_units: [] }, tasks, 'me')), ['a']);
tasks.task_states[0].status = 'completed';assert.deepEqual(attentionAt({ ...data, work_units: [] }, tasks, 'me'), {});
const real = JSON.parse(fs.readFileSync(new URL('./data/scenarios/architect/worklife.json', import.meta.url)));
assert.deepEqual(Object.keys(attentionAt(real, real.snapshots.at(-1), 'grace')).sort(), ['dian', 'hannah', 'robert', 'siyi']);
assert.deepEqual(Object.keys(attentionAt(real, real.snapshots[0], 'grace')), ['dian'], 'Only the known onboarding task is due on day one');
console.log('PASS: request direction, delayed knowledge, resolved/uncertain exclusion, task completion and archive dates.');
