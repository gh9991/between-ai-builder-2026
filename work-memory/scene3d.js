// Procedural 3D world (Three.js): the desk, the people/organisation network, camera and world labels.
// All geometry is created locally; no image, font or model downloads at runtime.
// The rest of the app talks to this module only through its exports; clicks on people go out via actions.selectPerson.
import * as THREE from './vendor/three.module.js';
import { $, button } from './format.js';
import { personRow, renderPanel } from './panels.js';
import { createCharacter } from './characters.js';
import { officeFor, officeLayout, externalProjectLayout } from './office-layout.js';
import { state, actions, CONFIG, DATA, PERSONA_ID, HOME_ORG, DAILY_PROJECT, ORGCOL, ORGPOS, COLORS, short, orgs, people, activeNodes } from './state.js';

let camera,renderer,scene,deskGroup,networkGroup,sceneReady = false;
const personObjects = new Map(),orgObjects = new Map(),labels = [];
const projected = new THREE.Vector3(),cameraTarget = new THREE.Vector3(),lookTarget = new THREE.Vector3(),lookNow = new THREE.Vector3();
let zoom = 1,rotation = 0,pointerStart = null;
// Growing camera: the network view frames whatever is visible, so the opening shot is close and pulls back as people appear.
let worldExtent = 4,focusedOffice = null,previousPerson = null;
const officeObjects = new Map(),officeButtons = new Map(),projectClusters = new Map();
const officeBounds = new THREE.Box3();
const OFFICES = CONFIG.offices || [];
const OFFICE_LAYOUT = OFFICES.length > 0;
const officePlan = OFFICE_LAYOUT ? officeLayout(DATA.people, PERSONA_ID, OFFICES) : null;
const raycaster = new THREE.Raycaster(),pointer = new THREE.Vector2(),clickables = [];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Layout. Explicit office configuration takes priority. Otherwise, relationship data uses rings by how often we work
// together (daily → weekly → project → occasional) and sectors by the project we share most. Without it (Iris) the
// original layout applies: home-org members on a ring around the desk, every other org on a small ring of its own.
const RELATIONSHIP_LAYOUT = DATA.people.some((p) => p.relationship);
const TIER_OF = { manager: 0, junior: 0, peer: 1, skip_manager: 1, partner_office: 1, colleague: 1, client_pm: 2, ldi: 2, consultant: 2, engineer: 2, client: 2, authority: 3 };
export const TIER_LABELS = ['Daily', 'Weekly', 'Project-based', 'Occasional'];
const TIER_RADIUS = [3.6, 5.8, 8.3, 10.8],AGENT_RADIUS = 2.4;
const LINK_STYLE = { // how the line from me to a person is drawn, by relationship category
  internal: { dash: null, color: 0x5b7f6a },
  external: { dash: [.45, .3], color: 0x7b8fb8 },
  authority: { dash: [.08, .22], color: 0xb0745a },
  agent: { dash: [.12, .16], color: 0x14b8a6 }
};
const linkKind = (p) => p.kind === 'agent' ? 'agent' : p.relationship?.type === 'authority' ? 'authority' : p.organisation_id === HOME_ORG || officeFor(p, OFFICES) ? 'internal' : 'external';
const personPositions = {},sectorCentres = {};
if (OFFICE_LAYOUT) {
  for (const [id, pos] of Object.entries(officePlan.positions)) personPositions[id] = new THREE.Vector3(...pos);
} else if (RELATIONSHIP_LAYOUT) {
  // Primary project = the project with most records involving this person (daily project only if nothing else).
  const counts = {};
  for (const r of DATA.records) for (const id of new Set([r.actor_id, ...r.participant_ids])) {
    (counts[id] ||= {})[r.project_id] = (counts[id]?.[r.project_id] || 0) + 1;
  }
  const primary = (id) => {
    const c = Object.entries(counts[id] || {}).sort((a, b) => b[1] - a[1]);
    return (c.find(([pid]) => pid !== DAILY_PROJECT) || c[0] || [DAILY_PROJECT])[0];
  };
  // The daily project sits in front of the camera (+z); the other projects share the rest of the circle behind.
  const sectors = [...DATA.projects.map((p) => p.id).filter((id) => id !== DAILY_PROJECT), DAILY_PROJECT];
  const width = Math.PI * 2 / sectors.length;
  sectors.forEach((pid, i) => {sectorCentres[pid] = Math.PI / 2 + width * ((i + 1) % sectors.length);});
  const others = DATA.people.filter((p) => p.id !== PERSONA_ID);
  const groups = {};
  for (const p of others) {
    const tier = p.kind === 'agent' ? 'agent' : TIER_OF[p.relationship?.type] ?? (p.organisation_id === HOME_ORG ? 1 : 2);
    const key = `${primary(p.id)}|${tier}`;
    (groups[key] ||= []).push(p);
  }
  for (const [key, members] of Object.entries(groups)) {
    const [pid, tier] = key.split('|');
    const radius = tier === 'agent' ? AGENT_RADIUS : TIER_RADIUS[Number(tier)];
    const spread = Math.min(width * .8, members.length * (1.25 / radius));
    members.forEach((p, i) => {
      const a = sectorCentres[pid] + (members.length === 1 ? 0 : -spread / 2 + spread * i / (members.length - 1));
      personPositions[p.id] = new THREE.Vector3(Math.cos(a) * radius, 0.25, Math.sin(a) * radius);
    });
  }
} else {
  for (const [oid, pos] of Object.entries(ORGPOS)) {
    const members = DATA.people.filter((p) => p.organisation_id === oid && p.id !== PERSONA_ID);
    members.forEach((p, i) => {
      const a = oid === HOME_ORG ? i / members.length * Math.PI * 2 : -Math.PI / 2 + i * 2 * Math.PI / members.length;
      const radius = oid === HOME_ORG ? 3.7 : 1.4;
      personPositions[p.id] = new THREE.Vector3(pos[0] + Math.cos(a) * radius, 0.25, pos[2] + Math.sin(a) * radius * (oid === HOME_ORG ? .8 : 1));
    });
  }
  for (const p of DATA.people) {
    if (p.id !== PERSONA_ID && !personPositions[p.id]) console.warn(`scenario ${CONFIG.id}: person "${p.id}" belongs to org "${p.organisation_id}" which has no entry in scenario.json orgs; not drawn`);
  }
}
const sceneHasPerson = (p) => p.id !== PERSONA_ID && !!personPositions[p.id];

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
function box(parent, w, h, d, color, x, y, z) {const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));m.position.set(x, y, z);m.castShadow = true;m.receiveShadow = true;parent.add(m);return m;}
function cylinder(parent, r1, r2, h, color, x, y, z) {const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 36), material(color));m.position.set(x, y, z);m.castShadow = true;m.receiveShadow = true;parent.add(m);return m;}
function sphere(parent, r, color, x, y, z) {const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), material(color));m.position.set(x, y, z);m.castShadow = true;parent.add(m);return m;}
function label(text, pos, fn, cls = '') {const b = button(text, fn, 'world-label ' + cls);$('labels').append(b);const item = { button: b, pos, kind: cls, personId: null, orgId: null };labels.push(item);return item;}

function openDeskEntry(mode) {
  state.selectedPerson = null;
  state.selectedOrg = null;
  if (mode === 'projects') state.selectedProject = null;
  state.detailMode = mode;
  renderPanel();
  if (mode === 'projects') document.querySelector('.detail-panel').scrollTop = 0;
}

function buildDesk() {
  const g = new THREE.Group();
  deskGroup = g;
  scene.add(g);
  cylinder(g, 3.1, 3.2, .16, 0xe0e6d5, 0, -.12, 0);
  box(g, 4.2, .18, 2.1, 0xc4a77e, 0, 1.2, 0);
  for (const x of [-1.75, 1.75]) for (const z of [-.75, .75]) box(g, .12, 1.2, .12, 0x8c947c, x, .54, z);
  box(g, 1.7, 1.07, .12, 0x3d4b43, -.05, 1.98, -.58);
  cylinder(g, .09, .09, .27, 0x57685b, -.05, 1.43, -.58);
  box(g, .65, .06, .35, 0x53624f, -.05, 1.31, -.5);
  const canvas = document.createElement('canvas');
  canvas.width = 768;canvas.height = 448;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e9eedf';ctx.fillRect(0, 0, 768, 448);
  ctx.fillStyle = '#61785a';ctx.font = '21px sans-serif';ctx.fillText('MY WORKSPACE', 48, 60);
  ctx.fillStyle = '#334d3b';ctx.font = '42px Georgia';ctx.fillText('A little more clarity.', 48, 125);
  for (let i = 0; i < 3; i++) {ctx.fillStyle = '#d6dfcb';ctx.fillRect(48, 170 + i * 70, 660, 48);ctx.fillStyle = '#839377';ctx.fillRect(64, 185 + i * 70, 17, 17);ctx.fillRect(110, 190 + i * 70, 340 - i * 60, 7);}
  const tex = new THREE.CanvasTexture(canvas);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.56, .92), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(-.05, 1.98, -.512);
  g.add(screen);
  box(g, 1.3, .055, .43, 0xe9e9dc, 0, 1.32, .35);
  for (let i = 0; i < 11; i++) for (let j = 0; j < 3; j++) box(g, .085, .009, .065, 0xcbd2c0, -.55 + i * .11, 1.352, .22 + j * .10);
  box(g, .65, .055, .9, 0x81957a, -1.3, 1.32, .14);
  box(g, .57, .018, .84, 0xf4eedc, -1.28, 1.36, .14);
  box(g, .68, .12, .84, 0xbe936b, 1.32, 1.35, .10);
  box(g, .62, .04, .78, 0xe8d9b4, 1.32, 1.435, .10);
  cylinder(g, .14, .12, .24, 0xf4f0e2, .88, 1.42, .73);
  cylinder(g, .117, .117, .005, 0x614f39, .88, 1.544, .73);
  cylinder(g, .19, .14, .30, 0xc1b18b, -1.64, 1.45, -.64);
  for (let i = 0; i < 7; i++) {const a = i * 2.4;const leaf = sphere(g, .17, 0x79926a, -1.64 + Math.cos(a) * .15, 1.74 + i * .025, -.64 + Math.sin(a) * .15);leaf.scale.set(.6, 1.6, .55);leaf.rotation.z = Math.cos(a) * .7;}
  box(g, .09, .5, .09, 0x657b64, 1.75, 1.64, -.7);
  const lamp = cylinder(g, .20, .29, .15, 0x7b9072, 1.68, 1.96, -.62);
  lamp.rotation.z = .25;
  box(g, .45, .04, .3, 0x829473, 1.75, 1.32, -.7);
  label('Today’s work', new THREE.Vector3(-.05, 2.6, -.5), () => openDeskEntry('overview'), 'desk');
  label('Work note', new THREE.Vector3(-1.4, 1.45, .65), () => openDeskEntry('notebook'), 'desk');
  label('Shared projects', new THREE.Vector3(1.35, 1.5, .65), () => openDeskEntry('projects'), 'desk');
  label('⌘ Open my connections', new THREE.Vector3(0, .75, 1.75), () => actions.setView('network'), 'desk');
}

function buildRelationshipGuides() {
  // Faint rings for the four tiers and a project label at the outer edge of each sector.
  TIER_RADIUS.forEach((r, i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - .02, r + .02, 128), new THREE.MeshBasicMaterial({ color: 0x9aa58f, transparent: true, opacity: .35, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .02;
    networkGroup.add(ring);
    const l = label(TIER_LABELS[i], new THREE.Vector3(Math.cos(Math.PI * .58) * r, .05, Math.sin(Math.PI * .58) * r), () => {}, 'org tier');
    l.guide = true;
  });
  for (const [pid, a] of Object.entries(sectorCentres)) {
    const r = TIER_RADIUS.at(-1) + 1.6;
    const l = label(short[pid], new THREE.Vector3(Math.cos(a) * r, .05, Math.sin(a) * r), () => actions.selectProject(pid), 'org sector');
    l.guide = true;
    l.projectId = pid;
    if (COLORS[pid] !== undefined) l.button.style.color = '#' + COLORS[pid].toString(16).padStart(6, '0');
  }
}

function focusOffice(id) {
  focusedOffice = id;
  previousPerson = state.selectedPerson;
  zoom = 1;rotation = 0;
  updateScene();setCameraTarget();
}

function buildOffices() {
  const controls = document.createElement('div');
  controls.id = 'officeControls';
  controls.setAttribute('aria-label', 'Office view');
  for (const [id, name] of [[null, 'All connections'], ...OFFICES.map((o) => [o.id, `${o.city} · ${o.label}`])]) {
    const b = button(name, () => focusOffice(id));
    controls.append(b);officeButtons.set(id, b);
  }
  const note = document.createElement('small');
  note.textContent = 'Office grouping, not live attendance';
  controls.append(note);
  $('stage').append(controls);
  for (const project of DATA.projects) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: COLORS[project.id] ?? 0x829b83, transparent: true, opacity: .12, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    g.add(disc);
    networkGroup.add(g);
    const l = label(short[project.id], new THREE.Vector3(), () => actions.selectProject(project.id), 'project-cluster');
    l.clusterProject = project.id;
    l.button.style.borderColor = '#' + (COLORS[project.id] ?? 0x829b83).toString(16).padStart(6, '0');
    projectClusters.set(project.id, { group: g, disc, label: l });
  }
  for (const o of OFFICES) {
    const g = new THREE.Group();
    g.position.set(o.center[0], 0, o.center[1]);
    networkGroup.add(g);
    const [w, d] = o.size,color = parseInt(o.color, 16);
    box(g, w, .18, d, color, 0, -.1, 0);
    box(g, w, .8, .15, 0xf9f8f1, 0, .3, -d / 2);
    box(g, .15, .8, d, 0xf9f8f1, -w / 2, .3, 0);
    // Window ribbon, shelves and planting give each island a recognisable office setting.
    box(g, w - 1, .36, .04, 0xaec7c5, 0, .48, -d / 2 + .09);
    for (const x of [-w / 2 + .55, w / 2 - .55]) {
      cylinder(g, .26, .2, .5, 0xb7aa91, x, .25, -d / 2 + .7);
      sphere(g, .42, 0x6f8c69, x, .9, -d / 2 + .7);
    }
    box(g, 1.4, .55, .45, 0xb5a387, w / 2 - 1, .3, -d / 2 + .45);
    officeObjects.set(o.id, g);
    const l = label(`${o.city} · ${o.label} ↗`, new THREE.Vector3(o.center[0], 1, o.center[1] - d / 2), () => focusOffice(o.id), 'office');
    l.officeId = o.id;
  }
}

function buildNetwork() {
  networkGroup = new THREE.Group();
  scene.add(networkGroup);
  if (OFFICE_LAYOUT) buildOffices();else
  if (RELATIONSHIP_LAYOUT) buildRelationshipGuides();
  for (const [oid, pos] of OFFICE_LAYOUT || RELATIONSHIP_LAYOUT ? [] : Object.entries(ORGPOS)) {
    const g = new THREE.Group();
    g.position.set(...pos);
    networkGroup.add(g);
    if (oid !== HOME_ORG) {
      cylinder(g, 2.25, 2.3, .15, 0xe0e5d5, 0, .03, 0);
      box(g, .8, .46, .7, ORGCOL[oid], 0, .30, 0);
      box(g, .5, .08, .43, 0xedeee2, 0, .58, 0);
    }
    const ol = label(orgs[oid].name, new THREE.Vector3(pos[0], .1, pos[2] + (oid === HOME_ORG ? 4.7 : 2.4)), () => actions.selectOrg(oid), 'org');
    ol.orgId = oid;
    orgObjects.set(oid, g);
  }
  for (const p of DATA.people.filter(sceneHasPerson)) {
    const pos = personPositions[p.id];
    const obj = createCharacter(networkGroup, p, ORGCOL[p.organisation_id], { seated: !!officePlan?.membership[p.id] });
    obj.group.position.copy(pos);
    if (obj.seated) obj.group.rotation.y = Math.PI;
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .13, .3), new THREE.Vector3(pos.x * .55, .2, pos.z * .35), new THREE.Vector3(pos.x, .12, pos.z)]);
    const style = RELATIONSHIP_LAYOUT ? LINK_STYLE[linkKind(p)] : null;
    const lineMaterial = style?.dash ?
    new THREE.LineDashedMaterial({ color: style.color, dashSize: style.dash[0], gapSize: style.dash[1], transparent: true, opacity: .24 }) :
    new THREE.LineBasicMaterial({ color: style ? style.color : ORGCOL[p.organisation_id], transparent: true, opacity: .24 });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(48)), lineMaterial);
    if (style?.dash) line.computeLineDistances();
    networkGroup.add(line);
    obj.line = line;
    personObjects.set(p.id, obj);
    const l = label(p.name, new THREE.Vector3(pos.x, 1.45, pos.z), () => actions.selectPerson(p.id));
    l.personId = p.id;
    if (obj.seated) l.pos.set(pos.x, .15, pos.z + .55);
    l.button.title = p.name;
    l.button.setAttribute('aria-label', p.name);
    if (OFFICE_LAYOUT) l.button.classList.add('office-person');
    obj.label = l;
    clickables.push(obj.group);
  }
}

export function resetOrbit() {zoom = 1;rotation = 0;focusedOffice = null;if (sceneReady) updateScene();}

export function setCameraTarget() {
  if (!camera) return;
  if (state.view === 'desk') {
    cameraTarget.set(0, 3.3, 6.6 * zoom);
    lookTarget.set(0, 1.3, 0);
  } else if (OFFICE_LAYOUT && !officeBounds.isEmpty()) {
    const center = officeBounds.getCenter(new THREE.Vector3());
    const size = officeBounds.getSize(new THREE.Vector3());
    const aspect = $('stage').clientWidth / $('stage').clientHeight;
    const distance = Math.max(14, size.x / Math.max(.55, aspect) * 1.85, size.z * 1.65) * zoom * 1.15;
    lookTarget.set(center.x, 0, center.z + .5);
    cameraTarget.set(center.x + Math.sin(rotation) * distance * .65, distance * .85, center.z + Math.cos(rotation) * distance * .65);
  } else {
    const aspect = $('stage').clientWidth / $('stage').clientHeight;
    const distance = Math.min(34, Math.max(11, worldExtent * 2.3 + 5)) * (aspect < 1 ? 1.22 : 1) * zoom;
    cameraTarget.set(Math.sin(rotation) * distance * .6, distance * .85, Math.cos(rotation) * distance * .55);
    lookTarget.set(0, 0, -Math.min(1.5, worldExtent * .15));
  }
}

export function updateScene() {
  if (!sceneReady) return;
  const { view, selectedPerson, selectedOrg } = state;
  const nodes = activeNodes();
  const availableOffices = new Set(nodes.map((n) => officePlan?.membership[n.person_id]).filter(Boolean));
  const homeOffice = officeFor(people[PERSONA_ID], OFFICES)?.id;
  availableOffices.add(homeOffice);
  if (focusedOffice && !availableOffices.has(focusedOffice)) focusedOffice = null;
  const inFocus = (id) => !focusedOffice || officePlan?.membership[id] === focusedOffice;
  if (selectedPerson !== previousPerson && selectedPerson && !inFocus(selectedPerson)) focusedOffice = null;
  previousPerson = selectedPerson;
  const currentIds = new Set(nodes.filter((n) => inFocus(n.person_id)).map((n) => n.person_id));
  if (OFFICE_LAYOUT) {
    $('officeControls')?.toggleAttribute('hidden', view !== 'network');
    for (const [id, b] of officeButtons) {
      b.hidden = id && !availableOffices.has(id);
      b.classList.toggle('active', id === focusedOffice);
      b.setAttribute('aria-pressed', String(id === focusedOffice));
    }
    const visiblePeople = DATA.people.filter((p) => nodes.some((n) => n.person_id === p.id));
    const external = externalProjectLayout(visiblePeople, state.visible, OFFICES, PERSONA_ID, DAILY_PROJECT, state.selectedProject);
    for (const id of currentIds) if (!officePlan.membership[id] && people[id].kind !== 'agent' && !external.positions[id]) currentIds.delete(id);
    for (const cluster of projectClusters.values()) cluster.group.visible = false;
    for (const [id, pos] of Object.entries(external.positions)) {
      const vector = personPositions[id],obj = personObjects.get(id);
      if (!obj || vector.equals(new THREE.Vector3(...pos))) continue;
      vector.set(...pos);obj.group.position.copy(vector);
      obj.label.pos.set(pos[0], .15, pos[2] + .55);
      const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .13, .3), new THREE.Vector3(pos[0] * .55, .2, pos[2] * .35), new THREE.Vector3(pos[0], .12, pos[2])]);
      obj.line.geometry.dispose();
      obj.line.geometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(48));
      obj.line.computeLineDistances();
    }
    officeBounds.makeEmpty();
    for (const group of external.groups) {
      const cluster = projectClusters.get(group.id);
      if (!cluster) continue;
      cluster.group.visible = !focusedOffice;
      cluster.group.position.set(group.center[0], .015, group.center[1] + (group.depth - 5) / 2);
      cluster.disc.scale.set(5.3, group.depth / 2 + .5, 1);
      cluster.label.pos.set(group.center[0], 1.5, group.center[1] - 2);
      cluster.label.button.textContent = short[group.id];
      cluster.label.button.title = 'Grouped by known shared records; click to view the project team';
      if (!focusedOffice) for (const sign of [-1, 1]) officeBounds.expandByPoint(new THREE.Vector3(group.center[0] + sign * 5.5, 0, group.center[1] + sign * (group.depth / 2 + 1)));
    }
    for (const o of OFFICES) {
      const visible = availableOffices.has(o.id) && (!focusedOffice || focusedOffice === o.id);
      const g = officeObjects.get(o.id);
      if (g) g.visible = visible;
      if (visible) for (const sign of [-1, 1]) officeBounds.expandByPoint(new THREE.Vector3(o.center[0] + sign * o.size[0] / 2, 0, o.center[1] + sign * o.size[1] / 2));
    }
    for (const id of currentIds) officeBounds.expandByPoint(personPositions[id]);
    deskGroup.visible = view === 'desk' || !focusedOffice || focusedOffice === homeOffice;
  }
  const currentOrgs = new Set(activeNodes().map((n) => n.organisation_id));
  networkGroup.visible = view === 'network';
  deskGroup.scale.setScalar(view === 'network' ? .65 : 1);
  for (const [id, obj] of personObjects) {
    const show = currentIds.has(id);
    if (show && !obj.wasVisible) obj.reveal = reduced ? 1 : 0;
    obj.wasVisible = show;
    obj.group.visible = show;
    obj.line.visible = show && (!OFFICE_LAYOUT || id === selectedPerson && !focusedOffice);
    obj.ring.material.color.setHex(id === selectedPerson ? 0xd6a264 : 0xf9faf2);
    obj.targetScale = id === selectedPerson ? 1.15 : 1;
    obj.line.material.opacity = id === selectedPerson ? .7 : .2;
    obj.label.button.classList.toggle('selected', id === selectedPerson);
    if (OFFICE_LAYOUT) obj.label.button.textContent = !focusedOffice && !state.selectedProject && people[id].kind !== 'agent' && id !== selectedPerson ? people[id].name.split(' ')[0] : people[id].name;
    obj.label.button.style.opacity = selectedOrg && people[id].organisation_id !== selectedOrg ? .3 : 1;
  }
  for (const [id, g] of orgObjects) g.visible = currentOrgs.has(id);
  // Frame the visible network: farthest visible person or organisation from the centre.
  let extent = 4;
  for (const [id, obj] of personObjects) if (obj.group.visible) extent = Math.max(extent, Math.hypot(obj.group.position.x, obj.group.position.z + 1.5));
  for (const [id, g] of orgObjects) if (g.visible && id !== HOME_ORG) extent = Math.max(extent, Math.hypot(g.position.x, g.position.z + 1.5) + 1.6);
  if (extent !== worldExtent) {worldExtent = extent;if (view === 'network') setCameraTarget();}
  if (OFFICE_LAYOUT && view === 'network') setCameraTarget();
  for (const l of labels) {
    if (l.clusterProject) {l.button.hidden = view !== 'network' || !projectClusters.get(l.clusterProject)?.group.visible;continue;}
    if (l.officeId) {l.button.hidden = view !== 'network' || !!focusedOffice || !officeObjects.get(l.officeId)?.visible;continue;}
    if (l.guide) {l.button.hidden = view !== 'network' || l.projectId && !state.snapshot.desk.project_states.some((p) => p.id === l.projectId);continue;}
    l.button.hidden = l.kind === 'desk' ? view !== 'desk' : l.orgId ? view !== 'network' || !currentOrgs.has(l.orgId) : view !== 'network' || !currentIds.has(l.personId);
  }
  if (!renderer) {
    $('listFallback').replaceChildren();
    activeNodes().forEach((n) => $('listFallback').append(personRow(people[n.person_id])));
  }
}

export function initScene() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true, alpha: false });
  } catch (e) {
    $('webglFallback').hidden = false;
    $('listFallback').style.display = 'block';
    $('listFallback').style.position = 'absolute';
    $('listFallback').style.inset = '150px 20px 50px';
    $('listFallback').style.overflow = 'auto';
    sceneReady = true;
    networkGroup = {};
    deskGroup = { scale: { setScalar() {} } };
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.setClearColor(0xeef0e5);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0e5);
  scene.fog = new THREE.Fog(0xeef0e5, OFFICE_LAYOUT ? 90 : 28, OFFICE_LAYOUT ? 160 : 55);
  camera = new THREE.PerspectiveCamera(39, 1, .1, 240);
  scene.add(new THREE.HemisphereLight(0xfffff5, 0x88957d, 2.4));
  const sun = new THREE.DirectionalLight(0xfff3d9, 3.3);
  sun.position.set(-8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: .5, far: 50 });
  sun.shadow.normalBias = .04;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), material(0xeef0e5));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.23;
  ground.receiveShadow = true;
  scene.add(ground);
  buildDesk();
  buildNetwork();
  sceneReady = true;
  setCameraTarget();
  camera.position.copy(cameraTarget);
  lookNow.copy(lookTarget);
  const resize = () => {
    renderer.setSize($('stage').clientWidth, $('stage').clientHeight, false);
    camera.aspect = $('stage').clientWidth / $('stage').clientHeight;
    camera.updateProjectionMatrix();
    setCameraTarget();
  };
  new ResizeObserver(resize).observe($('stage'));
  resize();
  let last = 0;
  function frame(time) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(.06, (time - last) / 1000 || .016);
    last = time;
    const t = reduced ? 1 : 1 - Math.exp(-dt * 5);
    camera.position.lerp(cameraTarget, t);
    lookNow.lerp(lookTarget, t);
    camera.lookAt(lookNow);
    for (const [id, o] of personObjects) {
      if (o.group.visible) {
        o.reveal = Math.min(1, (o.reveal ?? 1) + dt * 2.6);
        o.group.scale.setScalar((o.targetScale || 1) * o.reveal);
        if (o.orb) {
          if (!reduced) {o.float.position.y = .9 + Math.sin(time * .0018 + o.phase) * .09;o.halo.rotation.z = time * .001;}
        } else if (!reduced && !o.seated) o.group.rotation.y = Math.sin(time * .0003 + id.length) * .09;
      }
    }
    renderer.render(scene, camera);
    const w = $('stage').clientWidth,h = $('stage').clientHeight;
    for (const l of labels) {
      if (l.button.hidden) continue;
      projected.copy(l.pos).project(camera);
      l.button.style.left = (projected.x * .5 + .5) * w + 'px';
      l.button.style.top = (-projected.y * .5 + .5) * h + 'px';
      l.button.style.visibility = projected.z > 1 ? 'hidden' : 'visible';
    }
  }
  requestAnimationFrame(frame);
}

// Camera controls and picking: zoom buttons, wheel zoom, drag to rotate (network view), click a person to select.
export function bindSceneControls() {
  $('resetCamera').onclick = () => {resetOrbit();setCameraTarget();};
  $('zoomIn').onclick = () => {zoom = Math.max(.6, zoom - .1);setCameraTarget();};
  $('zoomOut').onclick = () => {zoom = Math.min(1.6, zoom + .1);setCameraTarget();};
  $('world').addEventListener('wheel', (e) => {e.preventDefault();zoom = Math.max(.6, Math.min(1.6, zoom + e.deltaY * .001));setCameraTarget();}, { passive: false });
  $('world').addEventListener('pointerdown', (e) => {pointerStart = { x: e.clientX, y: e.clientY, rotation };});
  $('world').addEventListener('pointermove', (e) => {
    if (pointerStart && state.view === 'network') {rotation = pointerStart.rotation + (e.clientX - pointerStart.x) * .007;setCameraTarget();}
  });
  window.addEventListener('pointerup', (e) => {
    if (pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) < 5 && state.view === 'network' && renderer && e.target === $('world')) {
      const rect = $('world').getBoundingClientRect();
      pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickables, true).find((h) => personObjects.get(h.object.userData.personId)?.group.visible);
      if (hit) actions.selectPerson(hit.object.userData.personId);
    }
    pointerStart = null;
  });
}
