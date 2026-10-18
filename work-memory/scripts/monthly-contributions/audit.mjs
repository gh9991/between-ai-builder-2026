// Independent checks against the original archive, not the runner's input copy.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const [directory, archive] = process.argv.slice(2);
if (!directory || !archive) throw Error('Usage: audit.mjs OUTPUT_DIRECTORY ARCHIVE_JSON');
const bytes = await fs.readFile(archive);
const data = JSON.parse(bytes);
const hash = createHash('sha256').update(bytes).digest('hex');
const index = JSON.parse(await fs.readFile(path.join(directory, 'verified-index.json')));
const monthOf = (r) => new Date(Date.parse(r.first_seen_at) + 8 * 3600000).toISOString().slice(0, 7);
const sources = new Map(data.records.map((r) => [r.id, r]));
const people = new Set(data.people.map((p) => p.id));
const projects = new Set(data.projects.map((p) => p.id));
const seen = new Set();
let cards = 0,claims = 0,quotes = 0;
assert(data.manifest.synthetic && data.records.every((r) => r.synthetic));
for (const entry of index.months) {
  const result = JSON.parse(await fs.readFile(path.join(directory, `${entry.month}-verified.json`)));
  const input = JSON.parse(await fs.readFile(path.join(directory, `${entry.month}-input.json`)));
  assert.equal(result.input_sha256, hash);
  assert.equal(result.report.month, entry.month);
  assert.equal(result.review_status, 'pending_semantic_review');
  const expected = data.records.filter((r) => monthOf(r) === entry.month).map((r) => r.id).sort();
  assert.deepEqual(input.records.map((r) => r.id).sort(), expected);
  for (const r of input.records) {
    assert(!seen.has(r.id));seen.add(r.id);
    for (const key of Object.keys(r)) {
      assert(['id', 'kind', 'project_id', 'actor_id', 'owner_id', 'participant_ids', 'first_seen_at', 'occurred_at', 'title', 'body', 'task_id', 'task_status', 'due_date', 'path', 'revision', 'linked_record_ids'].includes(key));
      assert.deepEqual(r[key], sources.get(r.id)[key]);
    }
  }
  for (const p of input.people) assert.deepEqual(Object.keys(p).sort(), ['id', 'name']);
  for (const p of input.projects) assert.deepEqual(Object.keys(p).sort(), ['id', 'name']);
  for (const card of result.report.cards) {
    cards++;assert(projects.has(card.project_id));assert(card.grace_contributions.length);
    if (!card.independence_basis) assert.equal(card.independence, 'not_established');
    for (const claim of [...card.grace_contributions, ...card.guidance_and_collaboration, ...card.outputs_and_status, ...card.methods_and_tools, ...(card.independence_basis ? [card.independence_basis] : [])]) {
      claims++;assert(claim.evidence.length);
      const participants = new Set();let direct = false;
      for (const evidence of claim.evidence) {
        quotes++;const r = sources.get(evidence.source_id);
        assert(r);assert.equal(monthOf(r), entry.month);
        assert(['title', 'body'].includes(evidence.field));
        assert(evidence.quote.trim().length && r[evidence.field].includes(evidence.quote));
        assert([card.project_id, 'studio'].includes(r.project_id));
        if (r.project_id === card.project_id) direct = true;
        for (const id of [...(r.participant_ids || []), r.actor_id, r.owner_id].filter(Boolean)) participants.add(id);
      }
      assert(direct);
      for (const id of claim.person_ids) assert(people.has(id) && participants.has(id));
    }
  }
  const represented = new Set([...result.report.cards, ...result.report.uncovered_projects].map((p) => p.project_id));
  for (const p of input.projects) assert(represented.has(p.id));
}
const expectedMonths = [...new Set(data.records.map(monthOf))].filter((m) => m >= index.from && m <= index.through).sort();
assert.deepEqual(index.months.map((m) => m.month).sort(), expectedMonths, 'Extraction has unfinished months');
console.log(JSON.stringify({ passed: true, months: index.months.length, records: seen.size, cards, claims, quotes, semantic_review: 'still_required' }));
