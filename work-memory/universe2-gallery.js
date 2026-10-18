// Directory: a card wall of everyone and every project known on the selected date (top-bar tab beside Project Timeline).
// People are their 3D figures, projects their wire models, rendered once into small images by one offscreen renderer.
// Cards carry facts only — exchanges, shared projects, dates — never a score. A card opens the person in Connections or
// the project's space.
import * as THREE from './vendor/three.module.js';
import { createCharacter } from './characters.js';
import { buildModel } from './styles/project-models.js';
import { state, actions } from './state.js';
import { dayMonth, fullDate, plural } from './i18n.js';
import { galleryPeople, galleryProjects, GALLERY_GROUPS, focusPerson, focusProject } from './universe2.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (iso) => iso ? dayMonth(iso) : '';
const ymd = (iso) => iso ? fullDate(iso) : '';
const OUTCOME = { lost: 'Not won', built: 'Built', delivered_not_proceeding: 'Delivered · client did not go ahead', named_scope_delivered: 'Agreed part delivered', study_paused: 'Study paused' };
const BUILDING = { library: 'Library', 'community centre': 'Community centre', school: 'School', 'residential tower': 'Apartment tower', clinic: 'Clinic', hotel: 'Hotel', townhouses: 'Townhouses',
  'office tower': 'Office tower', hospital: 'Hospital', apartments: 'Apartments', 'café': 'Café', cafe: 'Café', mall: 'Shopping centre' };
const KIND = { competition: 'Competition', 'fit-out': 'Interior fit-out', 'new building': 'New building', 'feasibility study': 'Feasibility study', masterplan: 'Master plan', 'support to another office': 'Helping another office' };
let root = null,kind = 'people',group = 'all',sort = 'level',withHistory = true;

// ---- thumbnails: one small offscreen WebGL renderer, images cached per person / project ----
const thumbs = new Map(),queue = [];
let R = null,scene = null,cam = null,pumping = false;
function renderer() {
  if (R) return R;
  try {R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });} catch {return null;}
  R.setPixelRatio(2);R.setSize(180, 210, false);R.setClearColor(0x000000, 0);
  scene = new THREE.Scene();cam = new THREE.PerspectiveCamera(26, 180 / 210, .05, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1b2236, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);key.position.set(2, 3, 4);scene.add(key);
  return R;
}
function shoot(build, fit = 1) {
  const r = renderer();if (!r) return '';
  const g = new THREE.Group();scene.add(g);build(g);
  const box = new THREE.Box3().setFromObject(g),size = box.getSize(new THREE.Vector3()),c = box.getCenter(new THREE.Vector3());
  const h = Math.max(size.y, size.x * 1.2, .4) * fit,d = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.1;
  cam.position.set(c.x + d * .3, c.y + d * .12, c.z + d);cam.lookAt(c);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(g);g.traverse((o) => {o.geometry?.dispose?.();});
  return url;
}
function personThumb(p) {
  return shoot((g) => {
    const ch = createCharacter(g, p.person, p.hex);if (ch.ring) ch.ring.visible = false;ch.group.rotation.y = -.35;
    // a small ring at the feet, inside the figure's width, so the framing follows the figure
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, p.group === 'dept' ? .006 : .013, 8, 64), new THREE.MeshBasicMaterial({ color: p.hex }));
    ring.rotation.x = Math.PI / 2;ring.scale.set(1, 1, 1);g.add(ring);
    if (p.group === 'line') {const r2 = new THREE.Mesh(new THREE.TorusGeometry(.26, .008, 6, 64), new THREE.MeshBasicMaterial({ color: p.hex }));r2.rotation.x = Math.PI / 2;g.add(r2);}
  }, 1.05);
}
function projectThumb(p) {
  return shoot((g) => {
    const color = new THREE.Color(p.color);
    const model = buildModel(THREE, g, p.model, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .18, depthWrite: false }));
    for (const mesh of [...model.children]) {const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color }));e.position.copy(mesh.position);e.rotation.copy(mesh.rotation);model.add(e);}
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.29, 64), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));ring.rotation.x = -Math.PI / 2;g.add(ring);
  }, .95);
}
function want(key, make) {if (!thumbs.has(key) && !queue.some((q) => q.key === key)) queue.push({ key, make });}
function pump() {// a few images per tick so the page stays responsive
  if (pumping) return;pumping = true;
  const step = () => {
    for (let i = 0; i < 4 && queue.length; i++) {
      const { key, make } = queue.shift(),url = make();thumbs.set(key, url);
      root?.querySelectorAll(`[data-thumb="${key}"]`).forEach((img) => {img.src = url;img.classList.add('in');});
    }
    if (queue.length) setTimeout(step, 0);else pumping = false;
  };
  setTimeout(step, 0);
}

// ---- cards ----
function personCard(p) {
  const key = 'p:' + p.id;want(key, () => personThumb(p));
  const img = thumbs.get(key);
  return `<button class="g-card${p.historical ? ' past' : ''}" data-person="${esc(p.id)}" style="--c:${p.color}" title="See ${esc(p.name)} in Connections">
    <span class="g-fig"><img data-thumb="${key}" alt="" ${img ? `src="${img}" class="in"` : ''}></span>
    ${p.waiting ? '<span class="g-alert" title="Something is waiting on me">!</span>' : ''}${p.historical ? '<span class="g-tag">Past contact</span>' : ''}
    <span class="g-info"><b>${esc(p.name)}</b><small>${esc(p.role)}</small><em>${esc(p.org)}</em>
      <span class="g-stats"><span><b>${p.count}</b>${p.count === 1 ? 'exchange' : 'exchanges'}</span><span><b>${p.projects.length}</b>shared ${p.projects.length === 1 ? 'project' : 'projects'}</span></span>
      <span class="g-dates">Met ${ymd(p.first)}${p.last ? ` · last ${md(p.last)}` : ''}</span></span>
  </button>`;
}
function projectCard(p) {
  const key = 'j:' + p.id;want(key, () => projectThumb(p));
  const img = thumbs.get(key),closed = p.state === 'closed';
  const status = closed ? `Finished${OUTCOME[p.outcome] ? ' · ' + OUTCOME[p.outcome] : ''}` : p.left ? 'Handed back · I left' : p.state === 'on_hold' ? 'Paused' : 'In progress';
  const period = p.mine.length ? p.mine.map(([a, b]) => `${ymd(a)} – ${b ? ymd(b) : 'now'}`).join(', ') : '';
  return `<button class="g-card proj${closed ? ' past' : ''}" data-project="${esc(p.id)}" style="--c:${p.color}" title="Open the project space for ${esc(p.name)}">
    <span class="g-fig"><img data-thumb="${key}" alt="" ${img ? `src="${img}" class="in"` : ''}></span>
    <span class="g-tag st">${esc(status)}</span>
    <span class="g-info"><b>${esc(p.name)}</b><small>${esc([BUILDING[p.building], KIND[p.kind]].filter(Boolean).join(' · ') || p.summary)}</small>
      <span class="g-phases" title="${esc(p.phases.join(' → '))}">${p.phases.map((_, i) => `<i class="${i < p.at ? 'on' : ''}"></i>`).join('')}</span>
      <em>${esc(closed ? OUTCOME[p.outcome] || 'Finished' : p.phase)}</em>
      <span class="g-faces">${p.faces.map((f) => `<i style="background:${f.color}">${esc(f.initials)}</i>`).join('')}${p.team.length > 5 ? `<small>+${p.team.length - 5}</small>` : ''}<small class="n">${plural(p.team.length, 'collaborator')}</small></span>
      ${period ? `<span class="g-dates">My part: ${esc(period)}</span>` : ''}</span>
  </button>`;
}

function draw() {
  if (!root || root.hidden) return;
  const ppl = galleryPeople().filter((p) => withHistory || !p.historical),projs = galleryProjects().filter((p) => withHistory || p.active);
  const P_TABS = [['all', 'All'], ...GALLERY_GROUPS],J_TABS = [['all', 'All'], ['active', 'In progress'], ['left', 'Handed back'], ['hold', 'Paused'], ['closed', 'Finished']];
  const jKey = (p) => p.state === 'closed' ? 'closed' : p.left ? 'left' : p.state === 'on_hold' ? 'hold' : 'active';
  const tabs = kind === 'people' ? P_TABS : J_TABS,countOf = (k) => k === 'all' ? (kind === 'people' ? ppl : projs).length : kind === 'people' ? ppl.filter((p) => p.group === k).length : projs.filter((p) => jKey(p) === k).length;
  if (!tabs.some(([k]) => k === group)) group = 'all';
  let list = kind === 'people' ? ppl.filter((p) => group === 'all' || p.group === group) : projs.filter((p) => group === 'all' || jKey(p) === group);
  if (kind === 'projects' && sort === 'level') sort = 'count';
  const by = { level: (a, b) => a.groupRank - b.groupRank || a.level - b.level || b.count - a.count, // my managers, my team by seniority, then the rest
    count: (a, b) => (b.count ?? b.team.length) - (a.count ?? a.team.length), last: (a, b) => String(b.last || b.mine?.at(-1)?.[1] || '9').localeCompare(String(a.last || a.mine?.at(-1)?.[1] || '9')),
    first: (a, b) => String(a.first || a.mine?.[0]?.[0] || '').localeCompare(String(b.first || b.mine?.[0]?.[0] || '')), name: (a, b) => a.name.localeCompare(b.name) };
  list = list.slice().sort(by[sort] || by.count);
  root.innerHTML = `<nav class="g-side" aria-label="Directory sections">
      <button data-kind="people" aria-pressed="${kind === 'people'}"><b>People</b><small>${ppl.length}</small></button>
      <button data-kind="projects" aria-pressed="${kind === 'projects'}"><b>Projects</b><small>${projs.length}</small></button>
      <p>As of ${esc(fullDate(state.snapshot.date))}</p></nav>
    <div class="g-main"><div class="g-top"><nav class="g-tabs">${tabs.map(([k, t]) => `<button data-group="${k}" aria-pressed="${k === group}">${esc(t)}<small>${countOf(k)}</small></button>`).join('')}</nav>
      <div class="g-tools"><label>Sort <select data-sort>${[...(kind === 'people' ? [['level', 'Seniority']] : []), ['count', kind === 'people' ? 'Most exchanges' : 'Most collaborators'], ['last', 'Most recent'], ['first', kind === 'people' ? 'Met first' : 'Started first'], ['name', 'Name']].map(([k, t]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="g-hist"><input type="checkbox" data-history ${withHistory ? 'checked' : ''}> Include ${kind === 'people' ? 'past contacts' : 'finished projects'}</label></div></div>
    <div class="g-grid">${list.map(kind === 'people' ? personCard : projectCard).join('') || '<p class="g-empty">Nothing here yet.</p>'}</div></div>`;
  root.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => {kind = b.dataset.kind;group = 'all';sort = kind === 'people' ? 'level' : 'count';draw();});
  root.querySelectorAll('[data-group]').forEach((b) => b.onclick = () => {group = b.dataset.group;draw();});
  root.querySelector('[data-sort]').onchange = (e) => {sort = e.target.value;draw();};
  root.querySelector('[data-history]').onchange = (e) => {withHistory = e.target.checked;draw();};
  root.querySelectorAll('[data-person]').forEach((b) => b.onclick = () => {const id = b.dataset.person;closeGallery();actions.onGalleryClose?.('network');focusPerson(id);});
  root.querySelectorAll('[data-project]').forEach((b) => b.onclick = () => {const id = b.dataset.project;closeGallery();actions.onGalleryClose?.('network');focusProject(id);});
  pump();
}
function place() {
  if (!root) return;
  const top = document.querySelector('body > header')?.getBoundingClientRect().bottom || 0,foot = document.querySelector('footer.timeline')?.getBoundingClientRect().top || innerHeight;
  root.style.top = top + 'px';root.style.height = Math.max(200, foot - top) + 'px';
}
export function openGallery() {
  if (!root) {root = document.createElement('section');root.className = 'uv2-gallery';root.setAttribute('aria-label', 'Directory: all people and projects');document.body.append(root);addEventListener('resize', place);}
  root.hidden = false;document.body.classList.add('uv2-gallery-open');place();draw();
}
export function closeGallery() {if (root) root.hidden = true;document.body.classList.remove('uv2-gallery-open');}
export const galleryOpen = () => !!root && !root.hidden;
export function refreshGallery() {if (galleryOpen()) draw();}
