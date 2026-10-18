// Person × project × knowledge time. Default to the selected world project when shared.
import { el, button, initials, dateText } from './format.js';
import { recordCard, isWorkRecord, openRecord, modal } from './records.js';
import { state, CONFIG, DATA, PERSONA_ID, KIND, STATUS, people, records, short, workEvents } from './state.js';

const storageKey = (kind, id) => `between:pv:${CONFIG.id}:${kind}:${id}`;
function readLocal(key, fallback) {
  try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}
}
function writeLocal(key, value) {
  try {localStorage.setItem(key, JSON.stringify(value));} catch {/* Private browsing still supports the view. */}
}
const visits = new Map();
let session = null;
const known = (id) => records[id]?.first_seen_at <= state.snapshot.as_of && isWorkRecord(records[id]);
const newest = (list) => [...list].sort((a, b) => (b.first_seen_at || '').localeCompare(a.first_seen_at || ''));
const sharedRecords = (id) => newest(state.visible.filter((r) => r.participant_ids.includes(id) && isWorkRecord(r) && !['journal', 'calendar', 'weekly_report'].includes(r.kind)));

export function beginPersonVisit(id) {
  const key = storageKey('seen', id),saved = readLocal(key, '');
  const previous = visits.get(id) || (typeof saved === 'string' ? saved : '');
  session = { id, previous, lens: undefined, day: state.snapshot.date };
  markSeen(id);
}
function markSeen(id) {
  const key = storageKey('seen', id),saved = readLocal(key, '');
  const latest = [visits.get(id) || '', typeof saved === 'string' ? saved : '', state.snapshot.as_of].sort().at(-1);
  visits.set(id, latest);
  writeLocal(key, latest);
}
export function personNewCount(id, projectId = null) {
  const saved = readLocal(storageKey('seen', id), '');
  const since = session?.id === id && state.selectedPerson === id ? session.previous : visits.get(id) || (typeof saved === 'string' ? saved : '');
  return sharedRecords(id).filter((r) => (!projectId || r.project_id === projectId) && r.first_seen_at > since).length;
}
function tier(person, node) {
  const type = person.relationship?.type,signals = node.signals || {},channels = signals.by_channel || {};
  if (type === 'authority') return 'Occasional';
  if (['manager', 'junior'].includes(type)) return 'Daily';
  if (type === 'skip_manager') return 'Weekly';
  const days = Math.max(1, (Date.parse(state.snapshot.as_of) - Date.parse(node.first_observed_at)) / 86400000);
  if (((channels.wechat || 0) + (channels.teams || 0)) / days >= 1 && (signals.shared_groups || signals.co_edited_files)) return 'Daily';
  if ((channels.meeting || 0) >= days / 7) return 'Weekly';
  if (['consultant', 'ldi', 'engineer', 'client', 'client_pm', 'assistant'].includes(type) || signals.shared_projects) return 'Project-based';
  return 'Occasional';
}
function fold(title, count) {
  const d = el('details', 'pv-fold');
  d.append(el('summary', '', `${title}${count === undefined ? '' : ` · ${count}`}`));
  return d;
}
function block(title, count) {
  const section = el('section', 'pv-block'),heading = el('div', 'pv-block-heading');
  heading.append(el('h3', '', title));
  if (count !== undefined) heading.append(el('span', 'pv-badge', count));
  section.append(heading);
  return section;
}
function empty(root, text = 'No related records at this date') {root.append(el('p', 'pv-empty', text));}
function compactText(text) {
  if ((text || '').length <= 95) return el('p', 'pv-text', text);
  const d = fold(text.slice(0, 80) + '…');
  d.append(el('p', 'pv-text', text));
  return d;
}
function currentTasks(projectId) {
  return (state.snapshot.task_states || []).filter((t) => (!projectId || t.project_id === projectId) && t.source_ids?.some(known)).map((t) => ({ ...t, source_ids: t.source_ids.filter(known) }));
}
function betweenBlock(person, tasks, lens) {
  const section = block('To do / Awaiting them'),stats = el('div', 'pv-balances');
  for (const [label, owner, counterpart] of [['To do', PERSONA_ID, person.id], ['Awaiting them', person.id, PERSONA_ID]]) {
    const list = tasks.filter((t) => t.owner_id === owner && t.counterparty_id === counterpart && !['completed', 'cancelled'].includes(t.status));
    const promises = visibleUnits(person.id, lens).filter((u) => u.type === 'promise' && u.from_id === owner && u.to_ids?.includes(counterpart) && !['kept', 'completed', 'cancelled'].includes(unitStatus(u).status) && !tasks.some((t) => t.id === u.task_id));
    const d = fold(label, list.length + promises.length);
    if (list.length) list.forEach((t) => d.append(taskRow(t, tasks)));
    promises.forEach((u) => d.append(unitRow(u)));
    if (!list.length && !promises.length) empty(d, 'No pending commitments');
    stats.append(d);
  }
  section.append(stats);
  return section;
}
function fallback(root, person, rs, projectIds, tasks, lens) {
  const shared = block('Shared projects', projectIds.length);
  for (const pid of projectIds) {
    const events = workEvents(pid, person.id),d = fold(short[pid], events.length);
    for (const event of events.slice().reverse()) {
      const row = el('article', 'pv-item');
      row.append(el('small', 'pv-meta', `${dateText(event.known_at)} · ${event.stage}`), compactText(event.title_zh));
      event.sources.filter(isWorkRecord).forEach((r) => row.append(recordCard(r)));
      d.append(row);
    }
    if (!events.length) empty(d, 'Explore shared work in the records below');
    shared.append(d);
  }
  const recent = block('Latest exchanges');
  rs.slice(0, 2).forEach((r) => recent.append(recordCard(r)));
  if (!rs.length) empty(recent);
  root.append(shared, betweenBlock(person, tasks, lens), recent);
}

const STATUS_TEXT = { open: 'Open', reopened: 'Open', likely_addressed: 'Likely addressed', addressed: 'Addressed', answered: 'Answered', kept: 'Kept', late: 'Overdue', completed: 'Completed', in_progress: 'In progress', waiting: 'Waiting', cancelled: 'Cancelled' };
const ICON = { feedback: '☷', task: '☑', update: '↗', file_pointer: '▤', decision: '◆', promise: '◷', question: '?' };
const UNIT_LABEL = { feedback: 'Feedback', task: 'Task', update: 'Progress', file_pointer: 'File', decision: 'Decision', promise: 'Due', question: 'Question' };
const localStatuses = new Map();
function visibleUnits(personId = null, projectId = null) {
  return (DATA.work_units || []).filter((u) => u.type !== 'small_talk' && known(u.record_id) && (
  !projectId || u.project_id === projectId) && (
  !personId || u.from_id === personId || u.to_ids?.includes(personId))).
  sort((a, b) => records[b.record_id].first_seen_at.localeCompare(records[a.record_id].first_seen_at));
}
function unitStatus(unit) {
  const base = (unit.status_history || []).filter((h) => h.at <= state.snapshot.as_of && (h.evidence_ids || []).every(known)).sort((a, b) => a.at.localeCompare(b.at)).at(-1) || { status: 'open', evidence_ids: [] };
  const key = storageKey('status', unit.id),saved = localStatuses.get(key) || readLocal(key, []);
  const override = (Array.isArray(saved) ? saved : []).filter((h) => h.at <= state.snapshot.as_of && h.at >= (base.at || '')).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  return override ? { ...base, ...override } : base;
}
function setUnitStatus(unit, status, redraw) {
  const key = storageKey('status', unit.id),saved = localStatuses.get(key) || readLocal(key, []);
  const history = [...(Array.isArray(saved) ? saved : []), { at: state.snapshot.as_of, status, by: 'local' }];
  localStatuses.set(key, history);
  writeLocal(key, history);
  redraw();
}
function sourceLink(id, label = 'Source ↗') {
  return button(label, () => openRecord(id), 'pv-action');
}
function unitRow(unit, redraw, interactive = false) {
  const row = el('article', 'pv-item'),status = unitStatus(unit),source = records[unit.record_id];
  row.dataset.unitId = unit.id;
  const top = el('div', 'pv-row-top');
  top.append(el('span', 'pv-unit-icon', ICON[unit.type] || '·'), compactText(unit.text_zh || unit.text));
  row.append(top);
  if (['feedback', 'question', 'promise', 'task'].includes(unit.type)) {
    row.append(el('span', `pv-badge pv-status-${status.status}`, `${status.status === 'addressed' ? '✓ ' : ''}${STATUS_TEXT[status.status] || status.status}`));
  }
  if (unit.path) row.append(el('code', 'pv-path', unit.path), el('span', 'pv-badge', unit.revision || 'Version not specified'));
  if (unit.due_date) row.append(el('small', 'pv-meta', `Due ${dateText(unit.due_date)}${unit.due_date < state.snapshot.date && !['kept', 'completed', 'cancelled'].includes(status.status) ? ' · Overdue' : ''}`));
  const meta = el('div', 'pv-row-meta');
  meta.append(el('small', 'pv-meta', `${dateText(source.first_seen_at)} · ${KIND[source.kind]}`), sourceLink(unit.record_id));
  row.append(meta);
  if (status.status === 'likely_addressed' || status.by === 'local' && status.evidence_ids?.length) {
    const evidence = el('div', 'pv-evidence');
    if (status.note_zh || status.note) evidence.append(compactText(status.note_zh || status.note));
    (status.evidence_ids || []).filter(known).forEach((id) => evidence.append(sourceLink(id, `Evidence · ${dateText(records[id].first_seen_at)} ↗`)));
    row.append(evidence);
  }
  if (interactive && unit.type === 'feedback') {
    const actions = el('div', 'pv-actions');
    if (!['addressed', 'completed'].includes(status.status)) actions.append(button('Confirm', () => setUnitStatus(unit, 'addressed', redraw), 'pv-action'));
    if (['likely_addressed', 'addressed', 'completed'].includes(status.status)) actions.append(button('Reopen', () => setUnitStatus(unit, 'reopened', redraw), 'pv-action'));
    row.append(actions);
  }
  return row;
}
function unitBlock(title, units, redraw, limit = 3) {
  const section = block(title, units.length);
  units.slice(0, limit).forEach((u) => section.append(unitRow(u, redraw)));
  if (units.length > limit) {
    const more = fold('Show more', units.length - limit);
    units.slice(limit).forEach((u) => more.append(unitRow(u, redraw)));
    section.append(more);
  }
  if (!units.length) empty(section);
  return section;
}
function latestFeedback(person, units, redraw) {
  const feedback = units.filter((u) => u.type === 'feedback' && u.from_id === person.id),latest = feedback[0];
  const group = latest ? feedback.filter((u) => latest.group_id ? u.group_id === latest.group_id : u.record_id === latest.record_id) : [];
  const section = block('Latest feedback', group.length);
  if (!group.length) {empty(section, 'No known feedback for this project');return section;}
  const source = records[latest.record_id];
  section.append(el('small', 'pv-meta', `${dateText(source.occurred_at)} ${source.occurred_at.slice(11, 16)} · ${KIND[source.kind]}`));
  const addressed = group.filter((u) => unitStatus(u).status === 'addressed').length,likely = group.filter((u) => unitStatus(u).status === 'likely_addressed').length;
  section.append(el('p', 'pv-meta', `${addressed} Addressed · ${likely} Likely addressed · ${group.length - addressed - likely} Open`));
  const progress = el('progress', 'pv-progress');
  progress.max = group.length;progress.value = addressed;
  progress.setAttribute('aria-label', 'Confirmed feedback');
  section.append(progress);
  group.forEach((u) => section.append(unitRow(u, redraw, true)));
  return section;
}
function draftTask(task) {
  const root = modal('Pass on task', 'Draft only; nothing is sent'),juniors = state.snapshot.connections.nodes.map((n) => people[n.person_id]).filter((p) => p?.relationship?.type === 'junior');
  const label = el('label', 'pv-meta', 'Recipient'),select = el('select', 'pv-recipient');
  select.setAttribute('aria-label', 'Draft recipient');
  for (const person of juniors) {
    const option = el('option', '', person.name);option.value = person.id;select.append(option);
  }
  if (!juniors.length) {const option = el('option', '', 'Select a colleague');option.value = '';select.append(option);}
  const text = el('textarea', 'pv-draft');
  text.setAttribute('aria-label', 'Task message draft');
  // Feedback must be in this task's evidence chain, never merely from the same project.
  const evidence = new Set(task.source_ids || []);
  for (const id of [...evidence]) (records[id]?.linked_record_ids || []).filter(known).forEach((link) => evidence.add(link));
  const taskUnits = visibleUnits(null, task.project_id).filter((u) => u.task_id === task.id);
  taskUnits.forEach((u) => evidence.add(u.record_id));
  const feedback = visibleUnits(null, task.project_id).filter((u) => u.type === 'feedback' && (u.task_id === task.id || evidence.has(u.record_id)));
  const compose = () => {
    text.value = `Hi ${people[select.value]?.name || 'there'},\n\nPlease help with ${short[task.project_id]}: ${task.title_zh || task.title}.${task.due_date ? `\nDue date: ${task.due_date}` : ''}\n${feedback.length ? '\nRelated feedback:\n' + feedback.map((u, i) => `${i + 1}. ${u.text_zh || u.text}`).join('\n') : ''}\n\nPlease share progress, the file path and revision when done. Let me know if you have questions.`;
  };
  select.onchange = compose;compose();
  label.append(select);root.append(label, text, el('p', 'pv-meta', 'Editable draft; this prototype does not send messages.'));
}
function taskRow(task, allTasks, nested = false) {
  const row = el('article', nested ? 'pv-task pv-child-task' : 'pv-task');
  row.dataset.taskId = task.id;
  row.append(compactText(task.title_zh || task.title));
  row.append(el('small', 'pv-meta', `${nested ? '↳ Passed to ' : ''}${people[task.owner_id]?.name || task.owner_id}`));
  row.append(el('span', 'pv-badge', STATUS_TEXT[task.status] || STATUS[task.status]));
  if (task.due_date) row.append(el('small', 'pv-meta', `Due ${dateText(task.due_date)}${task.overdue ? ' · Overdue' : ''}`));
  if (task.status === 'completed') {
    const completion = task.source_ids.map((id) => records[id]).findLast((r) => r?.task_status === 'completed');
    if (completion) row.append(el('small', 'pv-meta', `Completed ${dateText(completion.occurred_at)}${task.due_date && completion.occurred_at.slice(0, 10) > task.due_date ? ' · Later than agreed' : ''}`));
  }
  const actions = el('div', 'pv-actions');
  actions.append(sourceLink(task.source_ids.at(-1)), button('Pass on…', () => draftTask(task), 'pv-action'));
  row.append(actions);
  if (!nested) allTasks.filter((t) => t.parent_task_id === task.id && t.delegated_by === PERSONA_ID).forEach((t) => row.append(taskRow(t, [], true)));
  return row;
}
function taskBlock(title, tasks, allTasks = tasks) {
  const section = block(title, tasks.length),ordered = [...tasks].sort((a, b) => (a.status === 'completed') - (b.status === 'completed'));
  const done = tasks.filter((t) => t.status === 'completed').length;
  if (tasks.length) {
    const p = el('progress', 'pv-progress');p.max = tasks.length;p.value = done;p.setAttribute('aria-label', `${done} / ${tasks.length} tasks completed`);section.append(p);
  }
  ordered.slice(0, 3).forEach((t) => section.append(taskRow(t, allTasks)));
  if (ordered.length > 3) {const more = fold('More tasks', ordered.length - 3);ordered.slice(3).forEach((t) => more.append(taskRow(t, allTasks)));section.append(more);}
  if (!tasks.length) empty(section, 'No related tasks recorded');
  return section;
}
function decisionRows(person, lens) {
  return (state.snapshot.desk.decisions || []).filter((d) => (!lens || d.project_id === lens) && (!d.known_at || d.known_at <= state.snapshot.as_of) && d.source_ids?.some((id) => known(id) && records[id].participant_ids.includes(person.id)));
}
function decisionsBlock(person, units, lens, redraw) {
  const decisions = units.filter((u) => u.type === 'decision'),section = unitBlock('Decisions they contributed to', decisions, redraw);
  const linked = new Set(decisions.map((u) => u.decision_id));
  const extra = decisionRows(person, lens).filter((d) => !linked.has(d.id));
  if (extra.length && !decisions.length) section.querySelector('.pv-empty')?.remove();
  const more = fold('More decisions', Math.max(0, extra.length - 3));
  for (const [index, d] of extra.slice().reverse().entries()) {
    const item = el('article', 'pv-item');
    item.append(el('span', 'pv-badge', d.is_current ? 'Current decision' : 'Superseded'), compactText(d.value_zh || d.value));
    const why = fold('Why this decision was made');why.append(compactText(d.explanation_zh || d.explanation));
    d.source_ids.filter(known).forEach((id) => why.append(sourceLink(id, `${records[id].kind === 'meeting' ? 'Meeting / spoken decision' : 'Source'} · ${dateText(records[id].first_seen_at)} ↗`)));
    item.append(why);(index < 3 ? section : more).append(item);
  }
  if (extra.length > 3) section.append(more);
  section.querySelector('.pv-block-heading .pv-badge').textContent = decisions.length + extra.length;
  return section;
}
function recordsBlock(title, rs, limit = 2) {
  const section = block(title, rs.length);
  rs.slice(0, limit).forEach((r) => section.append(recordCard(r)));
  if (!rs.length) empty(section);
  if (rs.length > limit) {const more = fold('More', rs.length - limit);rs.slice(limit).forEach((r) => more.append(recordCard(r)));section.append(more);}
  return section;
}
function relationshipBlocks(root, person, units, rs, tasks, lens, redraw) {
  const from = units.filter((u) => u.from_id === person.id),own = tasks.filter((t) => t.owner_id === person.id && (t.counterparty_id === PERSONA_ID || t.delegated_by === PERSONA_ID));
  const mine = tasks.filter((t) => t.owner_id === PERSONA_ID && t.counterparty_id === person.id);
  const pending = (u) => !['addressed', 'answered', 'kept', 'completed', 'cancelled'].includes(unitStatus(u).status);
  const type = person.relationship?.type;
  if (type === 'manager') {
    root.append(latestFeedback(person, units, redraw), taskBlock('Tasks they requested and passed on', mine, tasks), betweenBlock(person, tasks, lens));
  } else if (type === 'junior') {
    root.append(taskBlock('Tasks I assigned to them', own, tasks), unitBlock('Their latest updates and files', from.filter((u) => ['update', 'file_pointer'].includes(u.type)), redraw), unitBlock('Questions awaiting my response', from.filter((u) => u.type === 'question' && u.to_ids?.includes(PERSONA_ID) && pending(u)), redraw));
  } else if (type === 'skip_manager') {
    root.append(decisionsBlock(person, units, lens, redraw), unitBlock('Project items they are following', from.filter((u) => ['feedback', 'question'].includes(u.type)), redraw), taskBlock('To report next time', mine.filter((t) => t.status !== 'completed'), tasks));
  } else if (['consultant', 'ldi', 'engineer'].includes(type)) {
    const last = from.filter((u) => ['update', 'decision', 'question'].includes(u.type));
    root.append(last.length ? unitBlock('Where we left off', last.slice(0, 1), redraw) : recordsBlock('Where we left off', rs.filter((r) => r.actor_id === person.id).slice(0, 1)), taskBlock('Their commitments and dates', own, tasks), unitBlock('Latest shared versions', units.filter((u) => u.type === 'file_pointer').slice(0, 1), redraw));
    const promises = from.filter((u) => u.type === 'promise');
    promises.forEach((u) => root.children[1].append(unitRow(u, redraw)));
  } else if (['client', 'client_pm'].includes(type)) {
    root.append(unitBlock('Their requests and decisions', from.filter((u) => u.type === 'decision' || ['feedback', 'question', 'task'].includes(u.type) && pending(u)), redraw), betweenBlock(person, tasks, lens));
    const next = block('Next meeting / milestone');
    const upcoming = state.visible.filter((r) => r.participant_ids.includes(person.id) && (!lens || r.project_id === lens) && isWorkRecord(r) && ['meeting', 'calendar'].includes(r.kind) && (r.start_at || r.occurred_at) > state.snapshot.as_of);
    upcoming.slice(0, 1).forEach((r) => next.append(recordCard(r)));
    const milestones = [...own, ...mine].filter((t) => t.status !== 'completed' && t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date));
    milestones.slice(0, 1).forEach((t) => next.append(taskRow(t, tasks)));
    if (!upcoming.length && !milestones.length) empty(next, 'No next event known yet');
    root.append(next);
  } else if (type === 'authority') {
    root.append(unitBlock('Submitted material', units.filter((u) => u.from_id === PERSONA_ID && ['update', 'file_pointer', 'promise'].includes(u.type)), redraw), latestFeedback(person, units, redraw));
    root.children[1].querySelector('h3').textContent = 'Feedback and status';
    const wait = block('Time awaiting reply');
    own.filter((t) => !['completed', 'cancelled'].includes(t.status)).forEach((t) => {
      const start = records[t.source_ids[0]].first_seen_at;
      wait.append(el('strong', 'pv-wait', `${Math.max(0, Math.floor((Date.parse(state.snapshot.as_of) - Date.parse(start)) / 86400000))} days`), compactText(t.title_zh || t.title), el('small', 'pv-meta', `Known since ${dateText(start)}${t.due_date ? ` · Due ${dateText(t.due_date)}` : ' · No agreed reply date'}`), sourceLink(t.source_ids[0]));
    });
    if (!wait.querySelector('.pv-wait')) empty(wait, 'No pending replies recorded');
    root.append(wait);
  } else if (type === 'assistant') {
    const outputs = from.filter((u) => ['feedback', 'update', 'file_pointer', 'question'].includes(u.type));
    root.append(unitBlock('Latest findings / outputs', outputs, redraw));
    const told = block('Recipients'),recipients = [...new Set(outputs.flatMap((u) => u.to_ids || []))].filter((id) => id !== person.id);
    recipients.forEach((id) => told.append(el('span', 'pv-badge', people[id]?.name || id)));
    if (!recipients.length) empty(told, 'No recipient specified');
    root.append(told);
    const acted = block('Follow-up');
    const followups = outputs.filter((u) => ['likely_addressed', 'addressed', 'answered', 'completed'].includes(unitStatus(u).status));
    followups.forEach((u) => acted.append(unitRow(u, redraw)));
    if (!followups.length) empty(acted, 'No follow-up evidence known yet');
    root.append(acted);
  } else {
    root.append(unitBlock('Latest shared progress', units.filter((u) => ['update', 'decision', 'file_pointer'].includes(u.type)), redraw), taskBlock('Tasks between us', [...mine, ...own], tasks), betweenBlock(person, tasks, lens));
  }
}
function secondLayer(view, person, units, rs, lens, redraw) {
  const timeline = fold('Shared timeline', units.length || rs.length);
  if (units.length) units.forEach((u) => {
    const row = unitRow(u, redraw);
    row.prepend(el('small', 'pv-meta', `${ICON[u.type] || '·'} ${UNIT_LABEL[u.type] || 'Work'} · ${short[u.project_id]}`));
    timeline.append(row);
  });else rs.forEach((r) => timeline.append(recordCard(r)));
  const decisions = fold('Decisions they contributed to');decisions.append(decisionsBlock(person, units, lens, redraw));
  const files = fold('Files they mentioned');
  const pointers = units.filter((u) => u.type === 'file_pointer' && u.from_id === person.id);
  pointers.forEach((u) => files.append(unitRow(u, redraw)));
  if (!pointers.length) {
    const docs = rs.filter((r) => r.kind === 'document' && r.actor_id === person.id);
    docs.forEach((r) => files.append(recordCard(r)));
    if (!docs.length) empty(files);
  }
  view.append(timeline, decisions, files);
}

export function renderPersonView(root, person, node) {
  if (session?.id !== person.id) beginPersonVisit(person.id);
  const rs = sharedRecords(person.id),counts = new Map();
  rs.forEach((r) => counts.set(r.project_id, (counts.get(r.project_id) || 0) + 1));
  const projectIds = [...counts.keys()].filter(Boolean).sort((a, b) => counts.get(b) - counts.get(a));
  // World selection wins on entry/context changes; manual lens switches survive redraws.
  // Every project must have shared evidence at this date, including the daily focus.
  if (session.lens === undefined || session.day !== state.snapshot.date || session.project !== state.selectedProject ||
  session.lens && !projectIds.includes(session.lens)) {
    session.lens = [state.selectedProject, state.snapshot.desk.focus_project_id, ...projectIds].
    find((id) => projectIds.includes(id)) || null;
    session.day = state.snapshot.date;
    session.project = state.selectedProject;
  }
  const lens = session.lens,inLens = (r) => !lens || r.project_id === lens;
  const view = el('div', 'pv-view'),head = el('div', 'pv-header'),identity = el('div');
  identity.append(el('h2', '', person.name), el('p', 'pv-meta', person.role));
  head.append(el('span', 'pv-avatar', initials(person)), identity);
  const badges = el('div', 'pv-badges');
  badges.append(el('span', 'pv-badge', person.relationship?.label_zh || 'Work contact'), el('span', 'pv-badge', tier(person, node)));
  const fresh = personNewCount(person.id);
  if (fresh) badges.append(el('span', 'pv-badge pv-new', `${fresh} new`));
  view.append(head, badges);
  const strip = el('div', 'pv-lenses');
  strip.setAttribute('aria-label', 'Person project filter');
  for (const pid of [...projectIds, null]) {
    const b = button(pid ? short[pid] : 'All', () => {session.lens = pid;root.replaceChildren();renderPersonView(root, person, node);}, 'pv-lens');
    b.setAttribute('aria-pressed', String(lens === pid));
    strip.append(b);
  }
  view.append(strip);
  if (lens && !rs.some((r) => r.project_id === lens)) view.append(el('p', 'pv-empty', 'No known exchanges on this project. Select another project above.'));
  const scoped = rs.filter(inLens),tasks = currentTasks(lens),first = el('div', 'pv-first');
  const units = visibleUnits(person.id, lens),redraw = () => {root.replaceChildren();renderPersonView(root, person, node);};
  if (DATA.work_units?.length) relationshipBlocks(first, person, units, scoped, tasks, lens, redraw);else
  fallback(first, person, scoped, lens ? [lens] : projectIds, tasks, lens);
  view.append(first);
  secondLayer(view, person, units, scoped, lens, redraw);
  const others = fold('Other projects', projectIds.filter((id) => id !== lens).length);
  projectIds.filter((id) => id !== lens && lens).forEach((id) => {
    const count = personNewCount(person.id, id);
    others.append(button(`${short[id]}${count ? ` · ${count} new` : ''}`, () => {session.lens = id;root.replaceChildren();renderPersonView(root, person, node);}, 'pv-project-link'));
  });
  if (lens && projectIds.some((id) => id !== lens)) view.append(others);
  const raw = fold('Original records', scoped.length);
  scoped.forEach((r) => raw.append(recordCard(r)));
  view.append(raw);
  root.append(view);
  markSeen(person.id);
}
