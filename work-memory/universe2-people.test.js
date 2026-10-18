import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalPeopleAt } from './universe2-people.js';
const config = { persona_id: 'me', daily_project_id: 'daily' };
const ids = ['past', 'both', 'daily', 'request', 'task', 'agent', 'unknown'];
const record = (id, project_id, actor_id, first_seen_at = '2026-01-01') => ({ id, project_id, actor_id, participant_ids: ['me'], first_seen_at });
const data = { people: ids.map((id) => ({ id, kind: id === 'agent' ? 'agent' : 'human' })), projects: [{ id: 'old' }, { id: 'current' }], records: [
  ...ids.map((id) => record(id, 'old', id)), record('both-current', 'current', 'both'), record('daily-work', 'daily', 'daily'),
  record('unclassified', null, 'unknown'), record('future', 'current', 'past', '2026-02-01'),
  record('resolved', 'old', 'request', '2026-01-20')],
  work_units: [{ type: 'question', record_id: 'request', from_id: 'request', to_ids: ['me'], status_history: [
    { at: '2026-01-01', status: 'open', evidence_ids: ['request'] }, { at: '2026-01-10', status: 'answered', evidence_ids: ['resolved'] }]
  }] };
const snap = (date) => ({ as_of: date, connections: { nodes: ids.map((person_id) => ({ person_id })) }, desk: { project_states: [{ id: 'old', status: 'completed' }, { id: 'current', status: 'active' }] }, task_states: [{ owner_id: 'task', counterparty_id: 'me', status: 'open', source_ids: ['task'] }] });
assert.deepEqual([...historicalPeopleAt(data, config, snap('2026-01-15'))], ['past'], 'Keep current, daily, unknown, agent and unfinished work; future membership and unread resolution must not affect filtering');
assert.deepEqual([...historicalPeopleAt(data, config, snap('2026-01-20'))], ['past', 'request']);
assert.deepEqual([...historicalPeopleAt(data, config, snap('2026-02-01'))], ['request'], 'Known current-project participation restores a person');
const completed = snap('2026-01-20');completed.task_states[0].status = 'completed';
assert(historicalPeopleAt(data, config, completed).has('task'), 'Resolved waiting-for-other task allows archival');
for (const status of ['active', 'on_hold', 'completed', 'handed_back', 'closed']) {
  const s = snap('2026-01-15');s.desk.project_states[0].status = status;
  assert.equal(historicalPeopleAt(data, config, s).has('past'), status !== 'active');
}
const read = (n) => JSON.parse(readFileSync(new URL(`./data/scenarios/architect/${n}.json`, import.meta.url)));
const real = read('worklife'),cfg = read('scenario');
const final = historicalPeopleAt(real, cfg, real.snapshots.at(-1));
assert(final.size > 0);console.log('Historical-only contacts:', real.people.filter((p) => final.has(p.id)).map((p) => p.name).join(', '));
for (const s of real.snapshots) {
  const hidden = historicalPeopleAt(real, cfg, s);
  assert([...hidden].every((id) => s.connections.nodes.some((n) => n.person_id === id)));
}
assert.equal(historicalPeopleAt(real, cfg, real.snapshots[0]).size, 0);
console.log('PASS: dated people filtering, mixed memberships, daily contacts, unfinished work both directions, late-known evidence and all 365 archive dates.');
