import assert from 'node:assert/strict';
import { relationshipGraph } from './fusion-relations.js';

const record = (id, first_seen_at, participant_ids, extra = {}) => ({ id, first_seen_at, participant_ids, actor_id: participant_ids[0], kind: 'chat', ...extra });
const D = { persona: { id: 'me' }, P: [{ id: 'a', first: 1 }, { id: 'b', first: 2 }, { id: 'c', first: 3 }], W: {
    snapshots: [{ as_of: '2026-01-01T23:59:59Z' }, { as_of: '2026-01-02T23:59:59Z' }, { as_of: '2026-01-03T23:59:59Z' }],
    records: [
    record('1', '2026-01-01T08:00:00Z', ['me', 'a']),
    record('2', '2026-01-02T08:00:00Z', ['me', 'a', 'b']),
    record('3', '2026-01-02T09:00:00Z', ['a', 'b']),
    record('4', '2026-01-03T08:00:00Z', ['me', 'c'], { occurred_at: '2025-12-01T00:00:00Z' }),
    record('5', '2026-01-01T08:00:00Z', ['me', 'a', 'b'], { kind: 'calendar' })]
  } };
const first = relationshipGraph(D, 1);
assert.deepEqual(first.ids, ['a']);assert.deepEqual(first.counts, { a: 1 });assert.deepEqual(first.edges, []);
const second = relationshipGraph(D, 2);
assert.deepEqual(second.counts, { a: 2, b: 1 }, 'Co-participation without the viewer is not counted as direct contact');
assert.deepEqual(second.edges, [{ a: 'a', b: 'b', count: 2 }]);
assert.equal('c' in second.scores, false, 'An old event read later stays hidden');
assert.equal(relationshipGraph(D, 3).counts.c, 1);
assert.deepEqual(relationshipGraph(D, 1), first, 'Scrubbing backward restores the same graph');
const before = JSON.stringify(D);relationshipGraph(D, 3);assert.equal(JSON.stringify(D), before, 'Presentation must not mutate source data');
assert.ok(second.scores.a > second.scores.b);
console.log('fusion relationship knowledge boundary checks passed');
