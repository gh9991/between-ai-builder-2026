import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rebuild, inputFor, known, currentFacts, handover, validateCandidates, reportMarkdown, createLedger, appendDay, authoredFacts, validateModelLedger } from './model.js';
import { requestFor, extractGemini } from './gemini.js';
import { evidenceCatalog } from './evidence.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/scenarios/architect/worklife.json', import.meta.url)));
const ledger = rebuild(data),byId = new Map(data.records.map((r) => [r.id, r]));
assert.equal(currentFacts(ledger, ledger.days[0]).filter((f) => f.kind === 'file_pointer').length, 1);
assert.equal(currentFacts(ledger).find((f) => f.entity_id === 'task:T-LK-08').due_date, '2026-10-05');
assert.equal(currentFacts(ledger).find((f) => f.entity_id === 'task:T-RV-09').due_date, '2026-10-02');
assert.equal(ledger.days.length, 365);assert.equal(ledger.days.at(-1).stats.records, 1337);
for (const day of ledger.days) {
  const ids = new Set(day.record_ids);assert.equal(ids.size, day.stats.records);
  for (const id of ids) assert(known(byId.get(id), day.date), `Future source ${id} at ${day.date}`);
  for (const f of currentFacts(ledger, day)) {
    assert(f.processed_date <= day.date);assert(f.source_ids.length);
    for (const id of f.source_ids) assert(ids.has(id));
    for (const person of f.participant_ids) assert(f.source_ids.some((id) => byId.get(id).participant_ids.includes(person)));
    if (f.completed_at) assert(f.status === 'completed');
  }
}
// Future snapshots, outcomes and annotations never affect a prefix.
const cutoff = '2026-04-01',prefix = rebuild(data, cutoff);
const truncated = structuredClone(data);truncated.records = truncated.records.filter((r) => known(r, cutoff));truncated.snapshots = [];
truncated.projects.forEach((p) => {p.status = 'invented future';p.outcome = 'invented future';});
truncated.work_units = truncated.work_units.filter((u) => truncated.records.some((r) => r.id === u.record_id));
assert.deepEqual(rebuild(truncated, cutoff).days, prefix.days);
assert.deepEqual(ledger.days.slice(0, prefix.days.length), prefix.days);
// A delayed source only enters on first_seen_at, including leave backfill.
const delayed = data.records.find((r) => r.first_seen_at.slice(0, 10) > r.occurred_at.slice(0, 10) && r.occurred_at.slice(0, 10) >= data.manifest.start);
assert(delayed);assert(!ledger.days.find((d) => d.date === delayed.occurred_at.slice(0, 10)).record_ids.includes(delayed.id));
assert(ledger.days.find((d) => d.date === delayed.first_seen_at.slice(0, 10)).record_ids.includes(delayed.id));
// Open task remains open past its promise until completion evidence arrives.
const task = data.tasks.find((t) => t.history.some((h) => h.status === 'completed' && byId.get(h.source_id)?.first_seen_at.slice(0, 10) > t.due_date));
assert(task);const due = ledger.days.find((d) => d.date === task.due_date);
assert.notEqual(currentFacts(ledger, due).find((f) => f.entity_id === `task:${task.id}`)?.status, 'completed');
const done = task.history.find((h) => h.status === 'completed'),doneDay = ledger.days.find((d) => d.date === byId.get(done.source_id).first_seen_at.slice(0, 10));
assert.equal(currentFacts(ledger, doneDay).find((f) => f.entity_id === `task:${task.id}`).status, 'completed');
assert(!handover(ledger, doneDay).my_tasks.some((f) => f.entity_id === `task:${task.id}`));
// Model payload contains only known identities and source material, no authored oracle.
const input = inputFor(data, data.manifest.start),request = requestFor(input, []),prompt = JSON.parse(request.contents[0].parts[0].text);
assert(!('work_units' in prompt));assert(!('snapshots' in prompt));assert(!('decisions' in prompt));
assert(prompt.new_records.every((r) => known(r, input.date)));assert(prompt.projects.every((p) => !('outcome' in p) && !('members' in p)));
const r = input.new_records.find((r) => r.kind === 'task_update');
const candidate = { entity_id: 'model-task-1', kind: 'task', title: r.title, project_id: r.project_id, source_ids: [r.id], participant_ids: r.participant_ids, owner_id: r.owner_id, due_date: r.due_date, completed_at: null, status: 'open', related_ids: [], evidence: [{ record_id: r.id, quote: r.body }], uncertainty: '' };
assert.equal(validateCandidates([candidate], input).accepted.length, 1);
for (const bad of [{ ...candidate, source_ids: ['nonexistent'] }, { ...candidate, participant_ids: ['not-a-participant'] }, { ...candidate, project_id: 'northgate' }, { ...candidate, evidence: [{ record_id: r.id, quote: 'fabricated quote' }] }, { ...candidate, completed_at: '2028-01-01T00:00:00Z' }, { ...candidate, related_ids: ['future-fact'] }]) assert.equal(validateCandidates([bad], input).accepted.length, 0);
const extracted = await extractGemini(input, [], { apiKey: 'test-only', model: 'test-model', fetcher: async (_url, init) => {assert.equal(init.headers['x-goog-api-key'], 'test-only');return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ facts: [{ ...candidate, evidence_ids: [evidenceCatalog([r]).find((e) => e.field === 'body').id] }] }) }] } }] }) };} });
assert.equal(extracted.accepted[0].review, 'pending');assert.equal(extracted.accepted[0].origin, 'gemini_candidate');
await assert.rejects(() => extractGemini(input, [], { apiKey: 'test-only', model: 'test-model', fetcher: async () => ({ ok: false, status: 429 }) }), /checkpoint preserved/);
await assert.rejects(() => extractGemini(input, [], {}), /Configure/);
const aiLedger = createLedger(data, 'gemini', 'test-model');appendDay(aiLedger, input, extracted.accepted);
assert.equal(validateModelLedger(aiLedger, data).facts.length, 1);
const invalidLedger = structuredClone(aiLedger);invalidLedger.facts[0].source_ids = ['future'];assert.throws(() => validateModelLedger(invalidLedger, data));
const sequential = createLedger(data);appendDay(sequential, input, authoredFacts(data, input));assert.throws(() => appendDay(sequential, input, []), /consecutively/);
assert(reportMarkdown(ledger, ledger.days[0]).includes('no AI calls'));
console.log(`PASS: ${ledger.days.length} daily evidence boundaries, prefix stability, delayed reading, due vs actual completion, participant attribution, model prompt isolation, rejected hallucinations, mocked Gemini and provider failure.`);
