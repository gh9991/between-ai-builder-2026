// Source records: the record modal, record and task cards, and the shared modal shell.
import { $, el, button, dateText } from './format.js';
import { state, actions, KIND, STATUS, short, people, records, PERSONA_FIRST_NAME, PERSONA_ID, DATA } from './state.js';
import { EN, t, dayMonth, fullDate } from './i18n.js';
const tr = t; // taskCard's parameter is named t

// Pure small-talk sources are absent from record views. Mixed sources show work excerpts.
const unitsByRecord = new Map();
for (const unit of DATA.work_units || []) {
  const list = unitsByRecord.get(unit.record_id) || [];
  list.push(unit);
  unitsByRecord.set(unit.record_id, list);
}
export function isWorkRecord(record) {
  if (!record || record.type === 'small_talk' || record.kind === 'small_talk') return false;
  const units = unitsByRecord.get(record.id);
  return !units?.length || units.some((u) => u.type !== 'small_talk');
}

export function workRecordText(record) {
  const units = unitsByRecord.get(record.id);
  return units?.some((u) => u.type === 'small_talk') ?
  units.filter((u) => u.type !== 'small_talk').map((u) => u.text_zh || u.text).join('\n\n') :
  record.body;
}
export function workRecordTitle(record) {
  return unitsByRecord.get(record.id)?.some((u) => u.type === 'small_talk') ? 'Work excerpt' : record.title;
}

export function modal(title, label = 'Work memory') {
  actions.pause();
  $('modalLabel').textContent = label;
  $('modalBody').replaceChildren();
  if (title) $('modalBody').append(el('h2', '', title));
  if (!$('recordDialog').open) $('recordDialog').showModal();
  return $('modalBody');
}

export function sourceButton(id) {
  return button('See the original record ↗', () => openRecord(id));
}

export function recordCard(r) {
  if (!isWorkRecord(r)) return el('span');
  const b = el('button', 'memory-card');
  b.append(el('small', '', `${dateText(r.occurred_at.slice(0, 10))} · ${KIND[r.kind]} · ${short[r.project_id]}`));
  b.append(el('strong', '', workRecordTitle(r)));
  b.onclick = () => openRecord(r.id);
  return b;
}

export function taskCard(t) {
  const c = el('div', 'task-card');
  const completion = t.status === 'completed' ? records[t.source_ids.at(-1)]?.occurred_at.slice(0, 10) : null;
  c.append(
    el('b', '', t.title),
    el('small', '', `${people[t.owner_id].name} · ${STATUS[t.status]}${t.due_date ? tr(' · Due ', ' · due ') + dateText(t.due_date) : ' · no agreed date'}${t.overdue ? ' · past the agreed date' : ''}`)
  );
  if (completion) c.append(el('small', '', `${tr('Completion record', 'Done')} ${dateText(completion)}${t.due_date && completion > t.due_date ? tr(' · Later than agreed', ' · later than agreed') : ''}`));
  c.append(sourceButton(t.source_ids.at(-1)));
  return c;
}

// ---- the record viewer: each kind opens in its own recognisable layout ----
// Email reads as an email (from / to / cc / letter), Teams as chat bubbles of the whole conversation, a meeting as an
// event with attendees, who said what and the key points, a file as a file card and page, a task as a task card.
const ESC = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const byEmail = Object.fromEntries((DATA.people || []).filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
const initialsOf = (n) => String(n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2);
const hm = (iso) => iso ? iso.slice(11, 16) : '',ymd = (iso) => iso ? fullDate(iso) : '';
const paras = (t) => ESC(t || '').split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const REC_TYPE = {
  email: ['mail', 'Email', svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>')],
  chat: ['teams', 'Teams message', svg('<path d="M4 5h16v11H9l-5 4z"/>')],
  meeting: ['meeting', 'Meeting', svg('<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M11 19c.3-2.8 2.4-5 5-5 2.8 0 5 2 5 5"/>')],
  calendar: ['calendar', 'Calendar', svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')],
  document: ['file', 'File', svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')],
  task_update: ['task', 'Task update', svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>')],
  journal: ['note', 'Work log', svg('<path d="M6 3h11a1 1 0 0 1 1 1v17H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6"/>')],
  weekly_report: ['note', 'Weekly report', svg('<path d="M6 3h11a1 1 0 0 1 1 1v17H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6M9 16h3"/>')],
  note: ['note', 'Note', svg('<path d="M6 3h11a1 1 0 0 1 1 1v17H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h4"/>')]
};
const chip = (id) => `<span class="rv-chip"><i>${ESC(initialsOf(people[id]?.name || id))}</i>${ESC(people[id]?.name || id)}</span>`;
const addr = (a) => {const p = byEmail[String(a).toLowerCase()];return p ? `<span class="rv-chip"><i>${ESC(initialsOf(p.name))}</i>${ESC(p.name)}<small>${ESC(a)}</small></span>` : `<span class="rv-chip plain">${ESC(a)}</span>`;};

function bodyFor(r, id, text, mixed) {
  if (r.kind === 'email') {
    return `<div class="rv-mail"><dl>
      <dt>${'From'}</dt><dd>${r.from_address ? addr(r.from_address) : chip(r.actor_id)}</dd>
      <dt>${'To'}</dt><dd>${(r.to_addresses || []).map(addr).join('') || r.participant_ids.filter((x) => x !== r.actor_id).map(chip).join('')}</dd>
      ${r.cc_addresses?.length ? `<dt>${'Cc'}</dt><dd>${r.cc_addresses.map(addr).join('')}</dd>` : ''}
      <dt>${'Sent'}</dt><dd>${ymd(r.occurred_at)} ${hm(r.occurred_at)}</dd></dl>
      <div class="rv-letter">${paras(text)}</div></div>`;
  }
  if (r.kind === 'chat') {
    const group = r.group_id && (DATA.groups || []).find((g) => g.id === r.group_id);
    const thread = r.thread_id ? state.visible.filter((x) => x.thread_id === r.thread_id && isWorkRecord(x)) : [r];
    const msgs = (thread.length ? thread : [r]).slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    return `<div class="rv-chat"><div class="rv-chat-head">${group ? `Group chat · ${ESC(group.name)} · ${group.member_ids.length} people` : `${'One to one'} · ${r.participant_ids.map((x) => ESC(people[x]?.name.split(' ')[0] || x)).join(' ↔ ')}`}</div>
      ${msgs.map((x) => `<div class="rv-msg${x.actor_id === PERSONA_ID ? ' me' : ''}${x.id === id ? ' cur' : ''}"><i class="av">${ESC(initialsOf(people[x.actor_id]?.name))}</i><div class="bubble"><b>${ESC(people[x.actor_id]?.name || x.actor_id)}<small>${dayMonth(x.occurred_at)} ${hm(x.occurred_at)}</small></b>${paras(x.id === id ? text : workRecordText(x))}</div></div>`).join('')}</div>`;
  }
  if (r.kind === 'meeting' || r.kind === 'calendar') {
    const status = { confirmed: 'Confirmed', cancelled: 'Cancelled', tentative: 'Tentative' }[r.calendar_status] || '';
    const head = `<div class="rv-event"><div class="when"><b>${ymd(r.start_at || r.occurred_at)}</b><span>${hm(r.start_at || r.occurred_at)}${r.end_at ? '–' + hm(r.end_at) : ''}</span>${r.location ? `<span>${ESC(r.location)}</span>` : ''}${status ? `<span class="st">${status}</span>` : ''}</div>
      <div class="who"><small>${r.kind === 'meeting' ? 'Attendees' : 'Invited'}</small>${r.participant_ids.map(chip).join('')}</div></div>`;
    if (r.kind === 'calendar') return head + `<div class="rv-note">${paras(text)}</div>`;
    const talk = !mixed && r.transcript?.length ? `<h4>${'Who said what'}</h4><div class="rv-talk">${r.transcript.map((t) => `<div class="line"><i class="av">${ESC(initialsOf(people[t.speaker_id]?.name))}</i><div><b>${ESC(people[t.speaker_id]?.name || t.speaker_id)}</b><p>${ESC(t.text)}</p></div></div>`).join('')}</div>` : `<div class="rv-note">${paras(text)}</div>`;
    const points = !mixed && r.minutes?.length ? `<h4>${'Key points'}</h4><ul class="rv-points">${r.minutes.map((m) => `<li>${ESC(m)}</li>`).join('')}</ul>` : '';
    const abridged = /abridged|not_verbatim/.test(r.minutes_status || '') ? `<p class="rv-fine">${'These minutes are a tidied summary, not a word-for-word transcript.'}</p>` : '';
    return head + talk + points + abridged;
  }
  if (r.kind === 'document') {
    return `<div class="rv-file"><div class="ic">${REC_TYPE.document[2]}</div><div><b>${ESC(workRecordTitle(r))}</b>
      <span>${ESC(r.path || '')}${r.revision ? ' · ' + ESC(r.revision) : ''}${r.version ? ` · version ${ESC(r.version)}` : ''}${r.format ? ' · ' + ESC(String(r.format).toUpperCase()) : ''}</span>
      ${r.editor_ids?.length ? `<span>${'Edited by: '}${r.editor_ids.map((x) => ESC(people[x]?.name || x)).join(', ')}</span>` : ''}</div></div>
      <div class="rv-page">${paras(text)}</div>`;
  }
  if (r.kind === 'task_update') {
    const kv = Object.fromEntries((r.body || '').split('\n').map((l) => l.match(/^(Task|Owner|Status|Due|Source):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
    const done = r.task_status === 'completed';
    return `<div class="rv-task"><div class="top"><b>${ESC(kv.Task || workRecordTitle(r))}</b><span class="pill${done ? ' ok' : ''}">${ESC(STATUS[r.task_status] || r.task_status || '')}</span></div>
      <dl><dt>${'Owner'}</dt><dd>${r.owner_id ? chip(r.owner_id) : ESC(kv.Owner || '')}</dd><dt>${'Agreed date'}</dt><dd>${ESC(r.due_date ? ymd(r.due_date) : kv.Due || 'Not agreed')}</dd><dt>${'Updated'}</dt><dd>${ymd(r.occurred_at)} ${hm(r.occurred_at)}</dd></dl></div>`;
  }
  return `<div class="rv-note">${paras(text)}</div>`; // journal, weekly report, note
}

export function openRecord(id) {
  const r = records[id];
  if (!isWorkRecord(r) || !state.visibleIds.has(id)) return;
  const [key, label, icon] = REC_TYPE[r.kind] || ['note', KIND[r.kind] || r.kind, ''];
  const root = modal('', label);
  const mixed = unitsByRecord.get(id)?.some((u) => u.type === 'small_talk'),text = workRecordText(r);
  const read = r.first_seen_at !== r.occurred_at ? `<p class="rv-fine">${'Available'} ${ymd(r.available_at) + ' ' + hm(r.available_at)} · ${PERSONA_FIRST_NAME} ${'first read it'} ${ymd(r.first_seen_at) + ' ' + hm(r.first_seen_at)}</p>` : '';
  const wrap = el('div', 'rv rv-k-' + key);
  wrap.innerHTML = `<div class="rv-head"><span class="rv-type">${icon}${ESC(label)}</span>${short[r.project_id] ? `<span class="rv-tag">${ESC(short[r.project_id])}</span>` : ''}<span class="rv-tag">${ymd(r.occurred_at)} ${hm(r.occurred_at)}</span></div>
    <h2 class="rv-title">${ESC(workRecordTitle(r))}</h2>${read}${bodyFor(r, id, text, mixed)}`;
  root.append(wrap);
  if (r.structured_content && !mixed) root.append(el('h3', '', 'Structured attachment'), el('pre', '', JSON.stringify(r.structured_content, null, 2)));
  const links = (r.linked_record_ids || []).filter((x) => state.visibleIds.has(x) && isWorkRecord(records[x]));
  const thread = r.kind !== 'chat' && r.thread_id ? state.visible.filter((x) => x.thread_id === r.thread_id && x.id !== id && isWorkRecord(x)) : [];
  const list = (title, ids) => {if (!ids.length) return;const box = el('div', 'rv-links');box.append(el('h4', '', title));ids.forEach((x) => {const rr = records[x],[k, l, ic] = REC_TYPE[rr.kind] || ['note', KIND[rr.kind], ''];const b = el('button', 'rv-link rv-k-' + k);b.innerHTML = `<span class="rv-type">${ic}${ESC(l)}</span><b>${ESC(workRecordTitle(rr))}</b><small>${ymd(rr.occurred_at)}</small>`;b.onclick = () => openRecord(x);box.append(b);});root.append(box);};
  list('Related sources', links);
  list('Same conversation', thread.map((x) => x.id));
  root.append(el('p', 'rv-fine', 'Archive · ' + r.id));
}
