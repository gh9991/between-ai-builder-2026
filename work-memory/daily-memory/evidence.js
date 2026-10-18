// Evidence IDs select exact source fields; the model never has to retype quotations.
const FIELDS = ['title', 'body', 'path', 'revision', 'task_id', 'due_date', 'start_at', 'end_at', 'occurred_at', 'task_status'];
export function evidenceCatalog(records) {
  const result = [];
  for (const r of records) for (const field of FIELDS) {
    if (typeof r[field] !== 'string' || !r[field].trim()) continue;
    const parts = field === 'body' ? r[field].split(/\n+/).filter((s) => s.trim()) : [r[field]];
    parts.forEach((quote, i) => result.push({ id: `${r.id}#${field}:${i}`, record_id: r.id, field, quote }));
  }
  return result;
}
export function materializeFacts(facts, input) {
  if (!Array.isArray(facts)) throw new Error('Expected facts array');
  const catalog = new Map(evidenceCatalog(input.records).map((e) => [e.id, e]));
  return facts.map((f) => {
    if (!f || !Array.isArray(f.evidence_ids) || !f.evidence_ids.length || f.evidence_ids.some((id) => !catalog.has(id))) return { ...f, source_ids: [], evidence: [] };
    const evidence = [...new Set(f.evidence_ids)].map((id) => catalog.get(id));
    const result = { ...f, source_ids: [...new Set(evidence.map((e) => e.record_id))], evidence };delete result.evidence_ids;return result;
  });
}
export function quoteExists(e, r) {
  if (!r || !e || typeof e.quote !== 'string' || !e.quote.trim()) return false;
  return e.field ? FIELDS.includes(e.field) && typeof r[e.field] === 'string' && r[e.field].includes(e.quote) : (r.title + '\n' + r.body).includes(e.quote);
}
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function dateMentions(text, r) {
  const found = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((m) => m[0]);
  const base = (r.occurred_at || r.first_seen_at).slice(0, 10),year = +base.slice(0, 4);
  for (const m of text.matchAll(/\b(\d{1,2})\s+(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)(?:\s+(20\d{2}))?\b/gi)) {
    const month = months.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    // No guessed year rollover. Ambiguous year stays for review instead of inventing one.
    found.push(`${m[3] || year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  for (const m of text.matchAll(/\b(next\s+)?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi)) {
    const d = new Date(base + 'T12:00:00Z');let offset = (weekdays.indexOf(m[2].toLowerCase()) - d.getUTCDay() + 7) % 7;
    if (m[1] && offset === 0) offset = 7;d.setUTCDate(d.getUTCDate() + offset);found.push(d.toISOString().slice(0, 10));
  }
  if (/\b(today|tonight)\b/i.test(text)) found.push(base);
  return found;
}
export function supportedDate(field, value, evidence, sources, fact) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  if (new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) !== day) return false;
  for (const e of evidence) {
    const r = sources.get(e.record_id);if (!quoteExists(e, r)) continue;
    if (field === 'completed_at') {
      if (r.task_status === 'completed' && r.task_id === fact.business_id && value === r.occurred_at) return true;
      // A record's timestamp is not automatically the completion time of the work it describes.
      if (e.field === 'body' && /\b(completed|finished)\b/i.test(e.quote) && e.quote.includes(value)) return true;
      continue;
    }
    if (field === 'scheduled_at' && e.field === 'start_at' && r.start_at === value) return true;
    if (field === 'due_date' && r.due_date === value && (e.field === 'due_date' || /\bdue\b/i.test(e.quote))) return true;
    if (field === 'scheduled_at') continue;
    const cue = field === 'due_date' ? /\b(due|deadline|by|need\b.*\bby)\b/i : /\b(from|starts?|starting|begins?)\b/i;
    if ((!e.field || e.field === 'body' || e.field === 'title') && cue.test(e.quote) && dateMentions(e.quote, r).includes(value)) return true;
  }
  return false;
}
export function normalizeEvidenceFact(f, old, sources) {
  const warnings = [...(f.validation_notes || [])],rejectedFields = [];
  const evidence = [...(old?.evidence || []), ...f.evidence].filter((e, i, all) => all.findIndex((x) => x.record_id === e.record_id && x.field === e.field && x.quote === e.quote) === i);
  const sourceIds = [...new Set([...(old?.source_ids || []), ...f.source_ids])];
  const result = { ...f, source_ids: sourceIds, evidence };
  for (const field of ['due_date', 'planned_start_date', 'scheduled_at', 'completed_at']) {
    const value = f[field];
    if (value == null) {result[field] = old?.[field] || null;continue;}
    if (old?.[field] === value || supportedDate(field, value, f.evidence, sources, f)) {result[field] = value;continue;}
    result[field] = old?.[field] || null;rejectedFields.push({ field, value });warnings.push(`Withheld date without matching evidence: ${field}: ${value}`);
  }
  if (!['completed', 'kept', 'addressed', 'answered'].includes(result.status)) result.completed_at = null;
  for (const field of ['path', 'revision']) {
    const value = f[field];
    if (value == null) {result[field] = old?.[field] || null;continue;}
    if (typeof value !== 'string' || !f.evidence.some((e) => e.quote.includes(value))) {result[field] = old?.[field] || null;rejectedFields.push({ field, value });warnings.push(`Withheld field without source text: ${field}`);}
  }
  const business = f.business_id;
  if (!business) result.business_id = old?.business_id || null;
  if (business && !(f.evidence.some((e) => e.quote.includes(business)) || f.source_ids.some((id) => sources.get(id)?.task_id === business))) {result.business_id = old?.business_id || null;warnings.push('Withheld business identifier without source evidence');}
  if (old?.business_id && business && old.business_id !== business) {result.business_id = old.business_id;warnings.push('Business identifier change requires review');}
  if (['completed', 'kept', 'addressed', 'answered'].includes(result.status) && f.source_ids.every((id) => sources.get(id)?.kind === 'calendar')) {result.status = 'unknown';result.completed_at = null;warnings.push('Calendar invitations do not establish completion or attendance');}
  result.is_recurring = Boolean(old?.is_recurring || f.is_recurring);
  if (result.is_recurring && ['completed', 'cancelled'].includes(result.status)) {
    result.status = old?.status || 'open';result.completed_at = null;warnings.push('A single record cannot close a recurring task; create a separate occurrence');
  }
  if (f.occurrence_of && f.occurrence_of !== old?.occurrence_of) result.occurrence_of = f.occurrence_of;
  if (old && old.project_id !== f.project_id) warnings.push(`Project changed from ${old.project_id} to ${f.project_id}; requires review`);
  if (f.source_ids.some((id) => sources.get(id)?.project_id !== f.project_id)) warnings.push('Cross-project evidence requires review');
  if (rejectedFields.length) result.rejected_fields = rejectedFields;
  result.validation_notes = [...new Set(warnings)];return result;
}
