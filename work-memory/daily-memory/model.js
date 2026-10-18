// Daily evidence ledger. No final-day snapshots or project outcomes are consumed.
import { quoteExists, normalizeEvidenceFact } from './evidence.js';
export const VERSION = '4';
export const KINDS = ['task', 'feedback', 'decision', 'file_pointer', 'promise', 'question', 'update'];
export const CLOSED = new Set(['completed', 'addressed', 'answered', 'kept', 'cancelled']);
export const unique = (xs) => [...new Set(xs.filter(Boolean))];
export const endOfDay = (date) => `${date}T23:59:59+08:00`;
const time = (value) => Date.parse(value);
export const known = (r, date) => Boolean(r.first_seen_at) && time(r.first_seen_at) <= time(endOfDay(date));
export function dates(start, end) {
  const result = [];
  for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) result.push(d.toISOString().slice(0, 10));
  return result;
}
export function inputFor(data, date, previous = null) {
  const records = data.records.filter((r) => known(r, date)).sort((a, b) => time(a.first_seen_at) - time(b.first_seen_at) || a.id.localeCompare(b.id));
  const before = new Set(previous?.record_ids || []),incoming = records.filter((r) => !before.has(r.id));
  const personIds = new Set(records.flatMap((r) => r.participant_ids || [])),projectIds = new Set(records.map((r) => r.project_id));
  // Strict identity allowlist: no final project status, outcome, future membership or milestones.
  return { date, new_records: incoming, records,
    people: data.people.filter((p) => personIds.has(p.id)).map(({ id, name }) => ({ id, name })),
    projects: data.projects.filter((p) => projectIds.has(p.id)).map(({ id, name, name_zh }) => ({ id, name, name_zh })) };
}
const base = (id, kind, title, project, sources, extra = {}) => ({ id, entity_id: id, kind, title, project_id: project,
  source_ids: sources.map((r) => r.id), participant_ids: unique(sources.flatMap((r) => r.participant_ids)),
  owner_id: null, due_date: null, completed_at: null, status: 'recorded', related_ids: [], ...extra });

// Explicit baseline adapter: these are existing authored annotations, never AI output.
export function authoredFacts(data, input) {
  const byId = new Map(input.records.map((r) => [r.id, r])),tasks = new Map();
  for (const r of input.records.filter((r) => r.kind === 'task_update' && r.task_id)) {
    const id = `task:${r.task_id}`,old = tasks.get(id);
    const sources = unique([...(old?.source_ids || []), r.id]).map((id) => byId.get(id));
    tasks.set(id, base(id, 'task', old?.title || r.title, r.project_id, sources, {
      status: r.task_status || old?.status || 'open', owner_id: r.owner_id || old?.owner_id || null,
      due_date: Object.hasOwn(r, 'due_date') ? r.due_date : old?.due_date || null,
      completed_at: r.task_status === 'completed' ? r.occurred_at : null,
      related_ids: unique([...(old?.related_ids || []), ...(r.linked_record_ids || []).filter((id) => byId.has(id)).map((id) => 'source:' + id)]),
      known_at: r.first_seen_at, origin: 'structured_source_not_ai' }));
  }
  const result = [...tasks.values()];
  const seenUnits = new Set();
  for (const u of data.work_units || []) {
    if (!KINDS.includes(u.type) || u.type === 'task' && u.task_id || u.type === 'decision' && u.decision_id) continue;
    const primary = byId.get(u.record_id);if (!primary) continue;
    const signature = JSON.stringify([u.record_id, u.type, u.text, u.path, u.revision, u.status_history]);
    if (seenUnits.has(signature)) continue;seenUnits.add(signature);
    const history = (u.status_history || []).filter((h) => time(h.at) <= time(endOfDay(input.date)) && (h.evidence_ids || []).every((id) => byId.has(id))).sort((a, b) => time(a.at) - time(b.at));
    const last = history.at(-1),sources = unique([u.record_id, ...(last?.evidence_ids || [])]).map((id) => byId.get(id));
    result.push(base(`unit:${u.id}`, u.type, u.text, u.project_id, sources, {
      status: last?.status || (['feedback', 'promise', 'question'].includes(u.type) ? 'open' : 'recorded'),
      due_date: u.due_date || null, path: u.path || null, revision: u.revision || null,
      known_at: sources.map((r) => r.first_seen_at).sort((a, b) => time(a) - time(b)).at(-1), origin: 'authored_annotation_not_ai' }));
  }
  for (const d of data.decisions || []) {
    if (time(d.known_at) > time(endOfDay(input.date)) || !d.source_ids?.length || !d.source_ids.every((id) => byId.has(id))) continue;
    const sources = d.source_ids.map((id) => byId.get(id));
    result.push(base(`decision:${d.id}`, 'decision', d.value, d.project_id, sources, {
      explanation: d.explanation, owner_id: d.decided_by || null,
      related_ids: d.supersedes_id && result.some((f) => f.entity_id === `decision:${d.supersedes_id}`) ? [`decision:${d.supersedes_id}`] : [],
      known_at: sources.map((r) => r.first_seen_at).sort((a, b) => time(a) - time(b)).at(-1), origin: 'authored_annotation_not_ai' }));
  }
  return result;
}

export function validateCandidates(candidates, input, previousFacts = []) {
  if (!Array.isArray(candidates)) throw new Error('Expected a facts array');
  const sources = new Map(input.records.map((r) => [r.id, r])),people = new Set(input.people.map((p) => p.id)),projects = new Set(input.projects.map((p) => p.id));
  const prior = new Map(previousFacts.map((f) => [f.entity_id, f]));
  const accepted = [],rejected = [],ids = new Set();
  for (const f of candidates) {
    let error = null;
    if (!f || typeof f !== 'object') error = 'Invalid fact';else
    if (typeof f.entity_id !== 'string' || !f.entity_id || ids.has(f.entity_id)) error = 'Missing or duplicate entity';else
    if (!KINDS.includes(f.kind) || typeof f.title !== 'string' || !f.title.trim()) error = 'Invalid kind or title';else
    if (!projects.has(f.project_id)) error = 'Unknown project';else
    if (!Array.isArray(f.source_ids) || !f.source_ids.length || f.source_ids.some((id) => !sources.has(id))) error = 'Missing, future or unrelated source';else
    if (![...f.source_ids, ...(prior.get(f.entity_id)?.source_ids || [])].some((id) => sources.get(id)?.project_id === f.project_id)) error = 'No source anchors the selected project';else
    if (f.source_ids.some((id) => sources.get(id).project_id !== f.project_id && sources.get(id).project_id !== 'studio')) error = 'Unrelated project evidence';else
    if (!f.source_ids.some((id) => input.new_records.some((r) => r.id === id))) error = 'No new evidence for this day';else
    if (!Array.isArray(f.participant_ids) || !f.participant_ids.length || f.participant_ids.some((id) => !people.has(id) || !f.source_ids.some((s) => sources.get(s).participant_ids.includes(id)))) error = 'Unsupported participant';else
    if (f.owner_id && !f.participant_ids.includes(f.owner_id)) error = 'Unsupported owner';else
    if (!['recorded', 'open', 'in_progress', 'waiting', 'blocked', 'completed', 'addressed', 'likely_addressed', 'answered', 'kept', 'late', 'cancelled', 'unknown'].includes(f.status)) error = 'Invalid status';else
    if (!Array.isArray(f.evidence) || f.source_ids.some((id) => !f.evidence.some((e) => e.record_id === id && quoteExists(e, sources.get(id))) && !prior.get(f.entity_id)?.source_ids.includes(id))) error = 'Missing exact source quote';else
    if (f.evidence.some((e) => !f.source_ids.includes(e.record_id) || !quoteExists(e, sources.get(e.record_id)))) error = 'Invalid evidence reference';else
    if (f.completed_at && (!Number.isFinite(time(f.completed_at)) || time(f.completed_at) > time(endOfDay(input.date)))) error = 'Future or invalid completion date';else
    if (!Array.isArray(f.related_ids) || f.related_ids.some((id) => !prior.has(id))) error = 'Unknown related fact';else
    if (f.occurrence_of && !prior.get(f.occurrence_of)?.is_recurring) error = 'Unknown recurring task';else
    if (prior.has(f.entity_id) && (prior.get(f.entity_id).kind !== f.kind || prior.get(f.entity_id).project_id !== f.project_id && prior.get(f.entity_id).project_id !== 'studio')) error = 'Identity changed across unrelated projects or kinds';
    if (error) {rejected.push({ entity_id: f?.entity_id || null, reason: error });continue;}
    ids.add(f.entity_id);
    accepted.push({ ...normalizeEvidenceFact(f, prior.get(f.entity_id), sources), id: f.entity_id, origin: 'gemini_candidate', review: 'pending', known_at: f.source_ids.map((id) => sources.get(id).first_seen_at).sort((a, b) => time(a) - time(b)).at(-1) });
  }
  return { accepted, rejected };
}
export function createLedger(data, provider = 'authored', model = null) {
  return { manifest: { version: VERSION, scenario: 'architect', provider, model, start: data.manifest.start, end: data.manifest.end,
      persona_id: data.manifest.persona.id, synthetic: true, knowledge_policy: 'first_seen_at',
      disclosure: provider === 'authored' ? 'Daily reconstruction from authored annotations and structured sources; no AI calls' : `${provider === 'lmstudio' ? 'Local LM Studio' : 'Gemini'} candidates; require review, not confirmed facts` }, days: [], facts: [] };
}
export function currentFacts(ledger, day = ledger.days.at(-1)) {
  const byId = new Map(ledger.facts.map((f) => [f.version_id, f]));
  return (day?.fact_ids || []).map((id) => byId.get(id)).filter(Boolean);
}
export function appendDay(ledger, input, candidates, rejected = []) {
  const previous = ledger.days.at(-1);
  const expected = previous ? dates(previous.date, ledger.manifest.end)[1] : ledger.manifest.start;
  if (input.date !== expected) throw new Error('Days must be processed consecutively');
  const latest = new Map(currentFacts(ledger).map((f) => [f.entity_id, f]));
  const added = [];
  for (const candidate of candidates) {
    const clean = { ...candidate };delete clean.version_id;delete clean.processed_date;delete clean.previous_version_id;
    const old = latest.get(clean.entity_id);
    const oldClean = old ? { ...old } : null;if (oldClean) {delete oldClean.version_id;delete oldClean.processed_date;delete oldClean.previous_version_id;}
    if (JSON.stringify(clean) === JSON.stringify(oldClean)) continue;
    const fact = { ...clean, version_id: `${clean.entity_id}@${input.date}`, processed_date: input.date, previous_version_id: old?.version_id || null };
    ledger.facts.push(fact);latest.set(fact.entity_id, fact);added.push(fact.version_id);
  }
  const all = [...latest.values()],covered = new Set(all.flatMap((f) => f.source_ids));
  const day = { date: input.date, new_record_ids: input.new_records.map((r) => r.id), record_ids: input.records.map((r) => r.id),
    fact_ids: all.map((f) => f.version_id), changed_fact_ids: added, unlinked_record_ids: input.records.filter((r) => !covered.has(r.id)).map((r) => r.id),
    project_ids: input.projects.map((p) => p.id), person_ids: input.people.map((p) => p.id), rejected,
    stats: { records: input.records.length, new_records: input.new_records.length, facts: all.length, changed: added.length, linked_records: covered.size, pending_review: all.filter((f) => f.review === 'pending').length } };
  ledger.days.push(day);return day;
}
export function rebuild(data, through = data.manifest.end) {
  const ledger = createLedger(data);
  for (const date of dates(data.manifest.start, through)) {
    const input = inputFor(data, date, ledger.days.at(-1));appendDay(ledger, input, authoredFacts(data, input));
  }
  return ledger;
}
export function handover(ledger, day) {
  const facts = currentFacts(ledger, day),persona = ledger.manifest.persona_id;
  const mine = (f) => f.owner_id === persona,other = (f) => f.owner_id && f.owner_id !== persona && f.participant_ids.includes(persona);
  const open = (f) => f.kind === 'task' && !CLOSED.has(f.status);
  return { my_tasks: facts.filter((f) => open(f) && mine(f)), waiting: facts.filter((f) => open(f) && other(f)),
    unresolved: facts.filter((f) => ['feedback', 'promise', 'question'].includes(f.kind) && !CLOSED.has(f.status)),
    decisions: facts.filter((f) => f.kind === 'decision'), files: facts.filter((f) => f.kind === 'file_pointer'),
    pending: facts.filter((f) => f.review === 'pending' || f.status === 'likely_addressed' || f.status === 'unknown') };
}
export function reportMarkdown(ledger, day, names = {}) {
  const h = handover(ledger, day),facts = currentFacts(ledger, day),changed = facts.filter((f) => day.changed_fact_ids.includes(f.version_id));
  const line = (f) => `- ${f.title} · ${f.status}${f.owner_id ? ' · ' + (names[f.owner_id] || f.owner_id) : ''}${f.planned_start_date ? ' · Planned start ' + f.planned_start_date : ''}${f.scheduled_at ? ' · Scheduled event ' + f.scheduled_at : ''}${f.due_date ? ' · Due ' + f.due_date : ''}${f.completed_at ? ' · Actually completed ' + f.completed_at.slice(0, 10) : ''}${f.business_id ? ' · ID ' + f.business_id : ''}${f.path ? ' · File ' + f.path : ''}${f.revision ? ' · Revision ' + f.revision : ''}${f.is_recurring ? ' · Recurring task' : ''} [${f.source_ids.join(', ')}]${f.validation_notes?.length ? ' · Review: ' + f.validation_notes.join('；') : ''}`;
  const section = (title, rows) => `\n## ${title}\n\n${rows.length ? rows.map(line).join('\n') : 'No known items.'}\n`;
  return `# ${day.date} · Daily work memory and handover\n\n${ledger.manifest.disclosure}\n\nNew sources: ${day.stats.new_records}; total sources: ${day.stats.records}; work nodes: ${day.stats.facts}.\nSources not linked to work nodes: ${day.unlinked_record_ids.length}; these may still be useful.\n` +
    section('New or changed today', changed) + section('To do', h.my_tasks) + section('Awaiting others', h.waiting) + section('Unresolved feedback, promises and questions', h.unresolved) + section('Decisions and historical evidence', h.decisions) + section('File references (not proof of authorship)', h.files) + section('Pending review', h.pending) +
    '\n## Handover scope\n\nThis is a review of records known at the selected date. It does not appoint a successor or confirm a transfer of responsibility. Receipt or processing does not establish that an employee has read a record. Historical visibility follows first_seen_at.\n';
}

// Validate imported model ledgers by replaying their daily commits against local sources.
export function validateModelLedger(value, data) {
  if (value.manifest?.version !== VERSION || value.manifest.scenario !== 'architect' || value.manifest.persona_id !== data.manifest.persona.id || !['gemini', 'lmstudio'].includes(value.manifest.provider) || !Array.isArray(value.days) || !value.days.length || !Array.isArray(value.facts)) throw new Error('Select a ledger.json generated by this version of the AI pipeline.');
  if (new Set(value.facts.map((f) => f.version_id)).size !== value.facts.length) throw new Error('Duplicate fact version.');
  const clean = createLedger(data, value.manifest.provider, value.manifest.model),allowed = new Set(dates(data.manifest.start, data.manifest.end));
  for (const day of value.days) {
    if (!allowed.has(day.date)) throw new Error('Date outside archive range.');
    const input = inputFor(data, day.date, clean.days.at(-1));
    const proposed = value.facts.filter((f) => f.processed_date === day.date).map((f) => {const result = { ...f };delete result.version_id;delete result.processed_date;delete result.previous_version_id;return result;});
    const checked = validateCandidates(proposed, input, currentFacts(clean));
    if (checked.rejected.length) throw new Error('Results contain unverifiable sources, people or links.');
    const rejected = Array.isArray(day.rejected) ? day.rejected.map((r) => ({ entity_id: typeof r.entity_id === 'string' ? r.entity_id : null, reason: typeof r.reason === 'string' ? r.reason : 'Validation failed' })) : [];
    const rebuilt = appendDay(clean, input, checked.accepted.map((f) => ({ ...f, origin: value.manifest.provider + '_candidate' })), rejected);
    if (JSON.stringify(rebuilt.record_ids) !== JSON.stringify(day.record_ids) || JSON.stringify(rebuilt.fact_ids) !== JSON.stringify(day.fact_ids)) throw new Error('Daily index does not match sources or fact versions.');
  }
  if (clean.facts.length !== value.facts.length) throw new Error('Fact versions are missing from daily snapshots.');
  return clean;
}
