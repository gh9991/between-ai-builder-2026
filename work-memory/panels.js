// Right-hand detail panel: overview, person, organisation and project views, plus the search dialog.
import { $, el, button, initials, dateText } from './format.js';
import { modal, sourceButton, recordCard, taskCard, isWorkRecord, workRecordText, workRecordTitle } from './records.js';
import { renderPersonView } from './person-view.js';
import { sharedTaskStates } from './work-model.js';
import { t as tr } from './i18n.js';
import {
  state, actions, PERSONA_ID, DAILY_PROJECT, STATUS, STAGES, short, PROJECT_GOALS, projectColor,
  people, orgs, records, activeNodes, workEvents } from
'./state.js';

export function personRow(p) {
  const b = el('button', 'person-row'),a = el('span', 'avatar', initials(p)),txt = el('div');
  txt.append(el('b', '', p.name), el('small', '', p.name_zh + ' · ' + p.role));
  b.append(a, txt);
  b.onclick = () => actions.selectPerson(p.id);
  return b;
}

function evidenceFold(sources) {
  const d = el('details', 'evidence-fold');
  d.append(el('summary', '', `See ${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`));
  sources.forEach((r) => d.append(recordCard(r)));
  return d;
}

function workNode(e, compact = false) {
  const n = el('article', 'work-node');
  n.append(el('small', '', `${dateText(e.occurred_at)} · ${e.stage}`), el('b', '', e.title_zh));
  if (e.known_at.slice(0, 10) !== e.occurred_at.slice(0, 10)) n.append(el('small', '', `First read ${dateText(e.known_at)}`));
  if (!compact) {
    const names = e.participant_ids.filter((id) => id !== PERSONA_ID).map((id) => people[id].name);
    n.append(el('p', 'node-people', names.join(' · ')));
    n.append(evidenceFold(e.sources));
  }
  return n;
}

function appendWorkPath(root, events) {
  if (!events.length) {root.append(el('p', 'empty', 'No clearly recorded shared work steps yet.'));return;}
  for (const stage of [...STAGES, ...new Set(events.map((e) => e.stage).filter((st) => !STAGES.includes(st)))]) {
    const es = events.filter((e) => e.stage === stage);
    if (!es.length) continue;
    const d = el('details', 'work-phase');
    d.open = events.length <= 4;
    const s = el('summary');
    s.append(el('span', '', stage), el('small', '', `${es.length} ${es.length === 1 ? 'step' : 'steps'}`));
    d.append(s);
    es.forEach((e) => d.append(workNode(e)));
    root.append(d);
  }
}

export function projectCard(pid, personId = null) {
  const { snapshot, visible } = state;
  const p = snapshot.desk.project_states.find((p) => p.id === pid);
  if (!p) return el('span');
  const es = workEvents(pid, personId),ts = sharedTaskStates(snapshot, pid, personId),done = ts.filter((t) => t.status === 'completed');
  const docs = visible.filter((r) => r.project_id === pid && r.kind === 'document' && (!personId || r.participant_ids.includes(personId)));
  const card = el('article', 'project-story');
  card.style.setProperty('--project-color', projectColor(pid));
  const head = el('div', 'story-heading');
  head.append(el('h3', '', short[pid]), el('span', 'status-pill', STATUS[p.status]));
  card.append(head, el('p', 'project-goal', PROJECT_GOALS[pid]));
  card.append(el('small', 'scope-note', personId ? 'Whole-project status; below, only the records that involve you both.' : 'Records known by the selected date'));
  const stats = el('div', 'story-stats');
  for (const [v, l] of [[es.length, 'Work steps'], [done.length, 'Done'], [docs.length, 'Linked files']]) {
    const s = el('span');
    s.append(el('b', '', v), el('small', '', l));
    stats.append(s);
  }
  card.append(stats);
  const outcome = es.filter((e) => e.is_outcome).at(-1);
  if (outcome) card.append(el('small', 'latest-label', 'Recorded results'), workNode(outcome, true));
  if (es.length && es.at(-1) !== outcome) card.append(el('small', 'latest-label', 'Latest progress'), workNode(es.at(-1), true));
  const path = el('details', 'project-expansion');
  path.append(el('summary', '', personId ? 'Show how we worked' : 'Show how the work went'));
  appendWorkPath(path, es);
  if (ts.length) {path.append(el('h4', '', 'Agreed and done'));ts.forEach((t) => path.append(taskCard(t)));}
  if (docs.length) {path.append(el('h4', '', 'Related deliverables'));docs.forEach((r) => path.append(recordCard(r)));}
  card.append(path, button('See the whole project →', () => actions.selectProject(pid)));
  return card;
}

function renderProjectDetail(root, p) {
  const { snapshot, visible, visibleIds } = state;
  root.append(el('h2', '', p.name_zh), el('span', 'status-pill', STATUS[p.status]), el('p', 'project-goal', PROJECT_GOALS[p.id]));
  const stateEvidence = el('details', 'evidence-fold');
  stateEvidence.append(el('summary', '', 'Why this is the current status'));
  p.source_ids.filter((id) => visibleIds.has(id)).forEach((id) => stateEvidence.append(recordCard(records[id])));
  root.append(stateEvidence);
  const es = workEvents(p.id),ts = sharedTaskStates(snapshot, p.id);
  const outcomes = es.filter((e) => e.is_outcome);
  if (outcomes.length) {root.append(el('h3', '', 'Recorded results'));outcomes.slice(-2).forEach((e) => root.append(workNode(e)));}
  root.append(el('h3', '', 'How the work went'));
  appendWorkPath(root, es);
  const done = ts.filter((t) => t.status === 'completed'),open = ts.filter((t) => t.status !== 'completed');
  if (done.length) {const d = el('details', 'work-phase');d.append(el('summary', '', `${'Done'} · ${done.length}`));done.forEach((t) => d.append(taskCard(t)));root.append(d);}
  if (open.length) {const d = el('details', 'work-phase');d.append(el('summary', '', `${'Next steps and open items'} · ${open.length}`));open.forEach((t) => d.append(taskCard(t)));root.append(d);}
  const docs = visible.filter((r) => r.kind === 'document' && r.project_id === p.id);
  if (docs.length) {const d = el('details', 'work-phase');d.append(el('summary', '', `${'Deliverables and working files'} · ${docs.length}`));docs.forEach((r) => d.append(recordCard(r)));root.append(d);}
  const participants = el('details', 'work-phase');
  participants.append(el('summary', '', `${'People involved'} · ${activeNodes().length}`));
  activeNodes().forEach((n) => participants.append(personRow(people[n.person_id])));
  root.append(participants);
  const decisions = snapshot.desk.decisions.filter((d) => d.project_id === p.id);
  if (decisions.length) {
    const d = el('details', 'work-phase');
    d.append(el('summary', '', 'Decisions and changes'));
    decisions.slice().reverse().forEach((item) => {
      const c = el('div', 'task-card');
      c.append(el('small', '', `${dateText(item.known_at)} · ${item.is_current ? 'Current' : 'Replaced'}`), el('b', '', item.value), sourceButton(item.source_ids[0]));
      d.append(c);
    });
    root.append(d);
  }
}

function renderOverview() {
  const { snapshot, visible, selectedProject } = state;
  const root = $('panel');
  root.replaceChildren();
  $('panelEyebrow').textContent = 'ON MY DESK';
  $('backPanel').classList.add('hidden');
  root.append(el('h2', '', 'The work goes on;\nthe memory stays here.'), el('p', 'intro', `${dateText(snapshot.date)} · ${visible.length} records so far`));
  const my = snapshot.desk.my_open_tasks.filter((t) => !selectedProject || t.project_id === selectedProject);
  const overviewProjects = el('details', 'overview-projects');
  overviewProjects.append(el('summary', '', 'Shared projects and results'));
  snapshot.desk.project_states.filter((p) => p.id !== DAILY_PROJECT).forEach((p) => overviewProjects.append(projectCard(p.id)));
  root.append(overviewProjects);
  root.append(el('h3', '', 'My next steps'));
  if (!my.length) root.append(el('p', 'empty', 'No recorded open commitments right now.'));
  my.slice(0, 5).forEach((t) => root.append(taskCard(t)));
  const waiting = snapshot.desk.waiting_on_others.filter((t) => !selectedProject || t.project_id === selectedProject);
  if (waiting.length) {root.append(el('h3', '', 'Awaiting them'));waiting.forEach((t) => root.append(taskCard(t)));}
  const recent = visible.filter((r) => ['email', 'meeting'].includes(r.kind) && !r.reply_to_id && (!selectedProject || r.project_id === selectedProject)).slice(-4).reverse();
  root.append(el('h3', '', 'Latest shared work'));
  recent.forEach((r) => root.append(recordCard(r)));
}

function renderPersonPanel() {
  const p = people[state.selectedPerson],node = state.snapshot.connections.nodes.find((n) => n.person_id === p.id);
  if (!node) {state.selectedPerson = null;renderOverview();return;}
  const root = $('panel');
  root.replaceChildren();
  $('panelEyebrow').textContent = 'OUR SHARED WORK';
  $('backPanel').classList.remove('hidden');
  renderPersonView(root, p, node);
}

function renderOrgPanel() {
  const { snapshot, visible } = state;
  const root = $('panel'),o = orgs[state.selectedOrg],ns = snapshot.connections.nodes.filter((n) => n.organisation_id === o.id);
  root.replaceChildren();
  $('panelEyebrow').textContent = 'ORGANISATION';
  $('backPanel').classList.remove('hidden');
  root.append(el('h2', '', o.name), el('p', 'intro', `${o.industry} · ${o.city}`), el('h3', '', `${ns.length} contacts so far`));
  ns.forEach((n) => root.append(personRow(people[n.person_id])));
  const ids = new Set(ns.map((n) => n.person_id));
  const shared = visible.filter((r) => ['email', 'meeting', 'chat'].includes(r.kind) && r.participant_ids.some((p) => ids.has(p)));
  root.append(el('h3', '', 'Latest exchanges with this organisation'));
  shared.slice(-6).reverse().forEach((r) => root.append(recordCard(r)));
}

function simplePanel(eyebrow, title, intro, list) {
  const root = $('panel');
  root.replaceChildren();
  $('panelEyebrow').textContent = eyebrow;
  $('backPanel').classList.remove('hidden');
  root.append(el('h2', '', title));
  if (intro) root.append(el('p', 'intro', intro));
  return root;
}

export function renderPanel() {
  const { snapshot, visible, detailMode } = state;
  if (state.selectedPerson) {renderPersonPanel();return;}
  if (state.selectedOrg) {renderOrgPanel();return;}
  if (detailMode === 'project' && state.selectedProject) {
    const p = snapshot.desk.project_states.find((p) => p.id === state.selectedProject);
    if (!p) {state.selectedProject = null;renderOverview();return;}
    const root = $('panel');
    root.replaceChildren();
    $('panelEyebrow').textContent = 'WORK WE BUILT TOGETHER';
    $('backPanel').classList.remove('hidden');
    renderProjectDetail(root, p);
    return;
  }
  if (detailMode === 'projects') {
    const root = simplePanel('SHARED PROJECTS', 'Shared projects and results');
    snapshot.desk.project_states.forEach((p) => root.append(projectCard(p.id)));
    return;
  }
  if (detailMode === 'notebook') {
    const root = simplePanel('PERSONAL NOTEBOOK', 'My work notes', 'Find what you were thinking, day by day.');
    visible.filter((r) => ['journal', 'weekly_report', 'note'].includes(r.kind)).reverse().forEach((r) => root.append(recordCard(r)));
    return;
  }
  if (detailMode === 'files') {
    const root = simplePanel('WORKING DOCUMENTS', 'Project files', 'Every version kept, so you can look back at each change.');
    visible.filter((r) => r.kind === 'document').reverse().forEach((r) => root.append(recordCard(r)));
    return;
  }
  renderOverview();
}

export function search() {
  const root = modal('', 'FIND A MEMORY');
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search people, organisations or work records…';
  input.setAttribute('aria-label', 'Search work memory');
  root.append(input);
  const results = el('div');
  root.append(results);
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    const ns = state.snapshot.connections.nodes.filter((n) => !q || [n.name, n.name_zh, orgs[n.organisation_id].name].join(' ').toLowerCase().includes(q));
    ns.slice(0, 15).forEach((n) => {
      const b = personRow(people[n.person_id]);
      b.onclick = () => {$('recordDialog').close();actions.setView('network');actions.selectPerson(n.person_id);};
      results.append(b);
    });
    if (q) {
      const rs = state.visible.filter((r) => isWorkRecord(r) && (workRecordTitle(r) + ' ' + (workRecordText(r) || '')).toLowerCase().includes(q)).reverse();
      results.append(el('h3', '', `${rs.length} matching records`));
      rs.slice(0, 40).forEach((r) => results.append(recordCard(r)));
      if (rs.length > 40) results.append(el('p', 'intro', 'Showing the latest 40; add a word to narrow it down.'));
    }
  };
  input.oninput = draw;
  draw();
  input.focus();
}
