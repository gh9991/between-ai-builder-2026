// Left sidebar (world stats, projects, organisations) and the project rail shown over the network view.
import { $, el, button } from './format.js';
import { state, actions, HOME_ORG, DAILY_PROJECT, STATUS, short, projectColor, orgs } from './state.js';
import { t as tr } from './i18n.js';

// Use the viewed snapshot, not final project metadata: closed work was once active.
export const isEndedProject = (project) => ['closed', 'completed', 'handed_back'].includes(project.status);

export function renderSidebar() {
  const { snapshot, selectedProject, selectedOrg } = state;
  const nodes = snapshot.connections.nodes,external = [...new Set(nodes.map((n) => n.organisation_id))].filter((x) => x !== HOME_ORG);
  $('peopleCount').textContent = nodes.length;
  $('orgCount').textContent = external.length;
  const projectList = $('projectList');
  const previousArchive = projectList.querySelector('.ended-projects');
  const wasOpen = previousArchive?.open || false;
  const previousSelected = projectList.dataset.selectedProject;
  projectList.replaceChildren();
  projectList.dataset.selectedProject = selectedProject || '';
  const ended = snapshot.desk.project_states.filter(isEndedProject);
  const archive = el('details', 'ended-projects');
  archive.open = wasOpen || previousSelected !== selectedProject && ended.some((p) => p.id === selectedProject);
  const summary = el('summary');
  summary.append(el('span', '', 'Finished projects'), el('small', '', String(ended.length)));
  archive.append(summary, el('p', 'archive-note', 'The project is finished, or my part in it is.'));
  for (const p of snapshot.desk.project_states) {
    const b = el('button', 'project-button' + (selectedProject === p.id ? ' active' : ''));
    const dot = el('i', 'dot');
    dot.style.background = projectColor(p.id);
    const txt = el('div');
    txt.append(el('b', '', short[p.id]), el('small', '', STATUS[p.status]));
    b.append(dot, txt);
    b.onclick = () => actions.selectProject(p.id);
    (isEndedProject(p) ? archive : projectList).append(b);
  }
  if (ended.length) projectList.append(archive);
  $('orgList').replaceChildren();
  for (const oid of [HOME_ORG, ...external]) {
    if (!nodes.some((n) => n.organisation_id === oid)) continue;
    const b = el('button', 'org-button' + (selectedOrg === oid ? ' active' : ''));
    const text = el('div');
    text.append(el('b', '', orgs[oid].name), el('small', '', `${nodes.filter((n) => n.organisation_id === oid).length} people so far`));
    b.append(el('span', 'org-icon', oid === HOME_ORG ? '⌂' : '▥'), text);
    b.onclick = () => actions.selectOrg(oid);
    $('orgList').append(b);
  }
}

export function renderProjectRail() {
  const rail = $('projectRail');
  rail.replaceChildren();
  rail.hidden = state.view !== 'network';
  if (rail.hidden) return;
  const heading = el('div', 'rail-heading');
  heading.append(el('span', '', 'Shared projects'), el('small', '', 'Pick a project to see its work and people'));
  rail.append(heading);
  const list = el('div', 'rail-items');
  for (const p of state.snapshot.desk.project_states.filter((p) => p.id !== DAILY_PROJECT && !isEndedProject(p))) {
    const b = button('', () => actions.selectProject(p.id), 'rail-project' + (state.selectedProject === p.id ? ' active' : ''));
    b.style.setProperty('--project-color', projectColor(p.id));
    b.append(el('b', '', short[p.id]), el('small', '', STATUS[p.status]));
    list.append(b);
  }
  if (!list.childNodes.length) list.append(el('small', '', 'No projects are running right now.'));
  rail.append(list);
}
