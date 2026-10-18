// Independent project sidebar, holograms and project inspector for Universe 2.
import * as THREE from './vendor/three.module.js';
import { buildModel, modelHeight } from './styles/project-models.js';
import { projectsAt } from './universe2-project-data.js';
import { state, actions, DATA, CONFIG, PERSONA, people, orgs } from './state.js';
import { openRecord } from './records.js';
import { openProjectSpace } from './universe2-project-space.js';
import { fullDate } from './i18n.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUniverse2Projects({ scene, root, labels, onPerson, onFocus, peopleDisplay, onPeopleHistory, onProjectHistory, projectHidden = () => false, onProjectFilter }) {
  const objects = new Map(),hits = [];
  let known = [],selected = null,fullHistory = false,network = true,projectMode = false,orgMode = false;
  const sidebar = document.createElement('aside');
  sidebar.id = 'uv2ProjectSidebar';sidebar.className = 'uv2-projects uv-glass';sidebar.setAttribute('aria-label', 'Project list');
  const detail = document.createElement('section');
  detail.className = 'uv2-project-detail uv-glass';detail.hidden = true;detail.setAttribute('aria-label', 'Project details');
  root.append(sidebar, detail);
  const peopleHistory = document.getElementById('uv2PeopleHistory');
  peopleHistory.onchange = (e) => onPeopleHistory(e.target.checked);
  const history = document.getElementById('uv2FullHistory');
  history.onchange = () => {fullHistory = history.checked;close();refresh();onProjectHistory?.();};
  const visibleProjects = () => known.filter((p) => (fullHistory || p.active || p.id === selected) && !projectHidden(p.id)); // unticked projects leave the scene
  const projectRecords = (id) => state.visible.filter((r) => r.project_id === id);
  const members = (id) => new Set(projectRecords(id).flatMap((r) => [r.actor_id, ...(r.participant_ids || [])]).filter((id) => people[id]));

  function show(id) {
    if (!known.some((p) => p.id === id)) return;
    openProjectSpace(id);
  }
  function close() {selected = null;state.selectedProject = null;detail.hidden = true;}
  function inspect() {
    const p = known.find((p) => p.id === selected);
    detail.hidden = !p || !network;
    if (!p) return;
    const ids = [...members(p.id)],recent = projectRecords(p.id).filter((r) => r.kind !== 'calendar').sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at)).slice(0, 3);
    detail.innerHTML = `<div class="uv2-panel-top"><span>Project · ${esc(fullDate(state.snapshot.date))}</span><button data-close aria-label="Close project details">×</button></div><h2>${esc(p.name)}</h2><p class="uv2-status" style="color:${p.color}">${esc(p.summary)}</p><h3>Known people · ${ids.filter((id) => people[id].kind !== 'agent').length}</h3><div class="uv2-members">${ids.map((id) => `<button data-person="${esc(id)}">${esc(people[id].name)}${id === PERSONA.id ? ' · me' : people[id].kind === 'agent' ? ' · AI' : ''}</button>`).join('')}</div><h3>Latest known work</h3>${recent.map((r) => `<button class="uv2-record" data-record="${esc(r.id)}"><b>${esc(r.title)}</b><small>${esc(fullDate(r.first_seen_at))} · ${esc(r.source_system || r.kind)}</small></button>`).join('') || '<p>No work records yet at this date</p>'}<p class="uv2-note">As of the selected date; click a record to see the original source.</p>`;
    detail.querySelector('[data-close]').onclick = () => {close();refresh();};
    detail.querySelectorAll('[data-record]').forEach((b) => b.onclick = () => openRecord(b.dataset.record));
    detail.querySelectorAll('[data-person]').forEach((b) => {b.disabled = b.dataset.person === PERSONA.id;b.onclick = () => {const id = b.dataset.person;detail.hidden = true;onPerson(id);};});
  }
  function make(p) {
    const group = new THREE.Group();scene.add(group);
    const material = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: .15, depthWrite: false });
    const model = buildModel(THREE, group, p.model, material);model.scale.setScalar(1.5);
    for (const mesh of [...model.children]) {
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: .9, fog: false }));
      edge.position.copy(mesh.position);edge.rotation.copy(mesh.rotation);model.add(edge);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.74, 64), new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide, transparent: true, opacity: .8 }));
    ring.rotation.x = -Math.PI / 2;group.add(ring);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = .7;hit.userData.project = p.id;group.add(hit);hits.push(hit);
    const button = document.createElement('button');button.className = 'uv2-project-label';button.dataset.project = p.id;
    button.onclick = () => show(p.id);labels.append(button);
    const obj = { group, model, button, height: modelHeight(p.model) * 1.5 + .7, ring };objects.set(p.id, obj);return obj;
  }
  function refresh() {
    known = projectsAt(DATA, CONFIG, state.snapshot);
    if (selected && !known.some((p) => p.id === selected)) close();
    const archiveOpen = sidebar.querySelector('details')?.open;
    const archived = known.filter((p) => !p.active),displayed = fullHistory ? known : known.filter((p) => p.active);
    const contacts = peopleDisplay();
    const humans = contacts.ids.filter((id) => people[id]?.kind !== 'agent').length;
    const agents = contacts.ids.length - humans;
    // each project: a tick box in its colour (show / hide, ⌥ only this one) and the row that opens its project space
    const item = (p) => {const on = !projectHidden(p.id);return `<div class="uv2-project-row${on ? '' : ' off'}"><button class="uv2-check-btn" role="checkbox" aria-checked="${on}" data-toggle-project="${esc(p.id)}" title="Click to show or hide · ⌥-click to show only this project" aria-label="Show ${esc(p.name)}"><i class="uv2-check${on ? ' on' : ''}" style="--c:${p.color}" aria-hidden="true"></i></button><button class="uv2-project-item ${p.id === selected ? 'selected' : ''}" data-project="${esc(p.id)}" aria-current="${p.id === selected}"><span><b>${esc(p.name)}</b><small>${esc(p.summary)}</small></span><span class="uv2-arrow">↗</span></button></div>`;};
    sidebar.innerHTML = `<div class="uv2-identity"><span>${esc(PERSONA.name.split(' ').map((x) => x[0]).join('').slice(0, 2))}</span><div><b>${esc(PERSONA.name)}</b><small>${esc(PERSONA.role || '')} · ${esc(orgs[PERSONA.organisation_id]?.name || '')}</small></div></div><div class="uv2-stats"><div><b>${humans}</b><small>${contacts.showHistory ? 'contacts so far' : 'current contacts'}</small></div><div><b>${displayed.length}</b><small>${fullHistory ? 'projects so far' : 'projects'}</small></div><div><b>${agents}</b><small>AI assistants</small></div></div><div class="uv2-list-heading"><span>Projects</span><small>Tick to show · click to open</small></div>${displayed.map(item).join('') || '<p class="uv2-empty">Projects appear as their work becomes known.</p>'}${!fullHistory && archived.length ? `<details ${archiveOpen ? 'open' : ''}><summary>Finished / paused projects · ${archived.length}</summary>${archived.map(item).join('')}</details>` : ''}`;
    peopleHistory.checked = contacts.showHistory;
    peopleHistory.parentElement.title = `${contacts.historyCount} past ${contacts.historyCount === 1 ? 'person' : 'people'}; people tied to current projects, everyday work or open items always stay`;
    sidebar.querySelectorAll('[data-project]').forEach((b) => b.onclick = () => show(b.dataset.project));
    sidebar.querySelectorAll('[data-toggle-project]').forEach((b) => b.onclick = (e) => {e.stopPropagation();onProjectFilter?.(b.dataset.toggleProject, e.altKey, known.map((p) => p.id));});
    const visible = visibleProjects();
    for (const o of objects.values()) {o.group.visible = false;o.button.hidden = true;}
    visible.forEach((p, i) => {
      const o = objects.get(p.id) || make(p);
      const a = projectMode ? Math.PI * 2 * i / Math.max(1, visible.length) + .6 : visible.length <= 4 ? Math.PI * 1.03 + i * Math.PI / Math.max(1, visible.length - 1) : Math.PI * 2 * i / visible.length + .2;
      const radius = projectMode ? visible.length > 6 ? 14 : 8.5 : 16;
      o.group.position.set(Math.cos(a) * radius, 1.1 + i % 2 * .65, Math.sin(a) * (projectMode ? radius : 14) - (projectMode ? 0 : 1.5));
      o.group.visible = network && !orgMode;o.button.hidden = !network || orgMode;o.button.innerHTML = `<b>◇ ${esc(p.name)}</b><small>${esc(p.summary)}</small>`;
      o.button.title = `As of ${fullDate(p.date)} · ${p.summary}`;
      o.button.classList.toggle('selected', p.id === selected);o.button.style.setProperty('--project-color', p.color);
    });
    inspect();
  }
  const point = new THREE.Vector3();
  function frame(camera, w, h) {
    for (const [id, o] of objects) {
      if (!o.group.visible) {o.button.hidden = true;continue;}
      point.copy(o.group.position);point.y += o.height;point.project(camera);
      o.button.hidden = point.z > 1 || point.z < -1;
      o.button.style.left = (point.x * .5 + .5) * w + 'px';o.button.style.top = Math.max(projectMode ? 250 : 190, Math.min(h - 185, (-point.y * .5 + .5) * h)) + 'px';
      o.ring.material.opacity = id === selected ? 1 : .65;
    }
  }
  return { refresh, frame, show, close,
    setOrgMode(on) {orgMode = on;refresh();},
    setProjectMode(on) {projectMode = on;close();refresh();},
    showHistoricalProjects() {return fullHistory;},
    setView(v) {network = v === 'network';sidebar.hidden = !network;if (!network) close();refresh();},
    hit(ray) {return ray.intersectObjects(hits.filter((h) => h.parent.visible), false)[0];},
    focus() {return selected ? objects.get(selected)?.group.position : null;},
    radius() {const count = visibleProjects().length;return network && !orgMode && count ? projectMode ? count > 6 ? 16 : 10.5 : 17.5 : 0;},
    selectPerson() {detail.hidden = true;}
  };
}
