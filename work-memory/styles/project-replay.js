// Project review uses knowledge dates, including delayed reads and later follow-up.
// It never treats a promised completion date as the end of the available history.
import { EN, t as tr, MONTHS_LONG, fullDate } from '../i18n.js';
export function createProjectReplay(D) {
  const cache = new Map();
  const indexAt = (at) => D.W.snapshots.findIndex((s) => s.as_of >= at) + 1;
  function scope(slot) {
    if (cache.has(slot)) return cache.get(slot);
    const project = D.PROJ[slot];
    if (!project) return null;
    const states = D.W.snapshots.map((s, i) => D.projectAt(slot, i + 1));
    const start = states.findIndex(Boolean) + 1;
    if (!start) return null;
    const records = D.W.records.filter((r) => r.project_id === project.id && r.kind !== 'calendar').
    map((record) => ({ record, day: indexAt(record.first_seen_at) })).filter((r) => r.day > 0).
    sort((a, b) => a.record.first_seen_at.localeCompare(b.record.first_seen_at) || a.record.id.localeCompare(b.record.id));
    let lastChange = start;
    for (let i = start; i < states.length; i++) {
      if (states[i] && (states[i].state !== states[i - 1]?.state || states[i].now !== states[i - 1]?.now)) lastChange = i + 1;
    }
    const end = states.at(-1)?.active ? D.days : Math.max(start, lastChange, ...records.map((r) => r.day));
    const activity = Array(end - start + 1).fill(0);
    for (const r of records) if (r.day <= end) activity[Math.max(start, r.day) - start]++;
    const markers = [{ date: D.dateOf(start), text: D.dateOf(start) }];
    for (let day = start + 1; day < end; day++) {
      const date = D.dateOf(day);
      if (date.endsWith('-01')) markers.push({ date, text: MONTHS_LONG[+date.slice(5, 7) - 1] });
    }
    if (end !== start) markers.push({ date: D.dateOf(end), text: D.dateOf(end) });
    const result = { slot, projectId: project.id, name: project.name, start, end, activity, markers,
      recordsAt: (day) => records.filter((r) => r.day <= day).map((r) => r.record) };
    cache.set(slot, result);
    return result;
  }
  return { scope };
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function projectProgressMarkup(records) {
  if (!records.length) return `<div class="meta">${'No known work records at this date'}</div>`;
  return records.slice(-3).reverse().map((r) => `<details class="project-record" data-source-id="${esc(r.id)}"><summary>${esc(r.title)}</summary><div class="meta">${'Known from'} ${esc(fullDate(r.first_seen_at))} · ${esc(r.source_system || r.kind)} · ${esc(r.id)}</div><p style="white-space:pre-wrap">${esc(r.body)}</p></details>`).join('');
}
