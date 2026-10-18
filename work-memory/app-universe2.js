// Entry point: navigation (select a person / organisation / project, switch view), global bindings and startup.
// Module map — state.js: data + shared state · format.js: DOM helpers · records.js: record modal and cards ·
// panels.js: right-hand panel and search · sidebar.js: left sidebar and project rail · scene3d.js: Three.js world ·
// timeline.js: selected day, refresh, replay and timeline controls.
import { mountContributions, showContributionEntry } from './universe2-contributions.js';
import { $, el } from './format.js';
import { renderPanel } from './panels.js';
import { openSearch } from './universe2-search.js';
import { openGallery, closeGallery, refreshGallery, galleryOpen } from './universe2-gallery.js';
import { renderSidebar, renderProjectRail } from './sidebar.js';
import { initScene, updateScene, setCameraTarget, resetOrbit, bindSceneControls } from './scene3d.js';
import { refresh, pause, bindTimeline } from './timeline.js';
import { bindArchiveCalendar } from './universe2-calendar.js';
import { beginPersonVisit } from './person-view.js';
import { modal } from './records.js';
import { mountUniverse, refreshUniverse, setUniverseView, findStyle } from './universe2.js';
import { mountStyleBar } from './styles/style-bar.js';
import { state, actions, CONFIG, activeNodes } from './state.js';

function selectPerson(id) {
  if (!state.snapshot.connections.nodes.some((n) => n.person_id === id)) return;
  if (!activeNodes().some((n) => n.person_id === id)) state.selectedProject = null;
  state.selectedPerson = id;
  state.selectedOrg = null;
  state.detailMode = 'person';
  state.personTab = 'projects';
  beginPersonVisit(id);
  renderPanel();
  renderSidebar();
  updateScene();
  document.querySelector('.detail-panel').scrollTop = 0;
}

function selectOrg(id) {
  state.selectedOrg = id;
  state.selectedPerson = null;
  state.selectedProject = null;
  state.detailMode = 'org';
  setView('network');
  renderSidebar();
  renderPanel();
  updateScene();
}

function selectProject(id) {
  pause();
  state.selectedProject = id;
  state.selectedPerson = null;
  state.selectedOrg = null;
  state.detailMode = 'project';
  setView('network');
  refresh();
  document.querySelector('.detail-panel').scrollTop = 0;
}

// The timeline page reads the whole archive, so it starts loading in the background once the app is up;
// opening the tab then only shows it.
function loadTimeline() {
  const f = $('timelineFrame');
  if (!f.src) f.src = `styles/timeline.html?embed=1&theme=dark&lang=en&mode=${encodeURIComponent(new URLSearchParams(location.search).get('mode') || 'demo')}&v=20261017-en3&scenario=${encodeURIComponent(new URLSearchParams(location.search).get('scenario') || 'architect')}`;
}
// Project Timeline opens in place under the header (styles/timeline.html in embed mode, same scenario).
function showTimeline(on) {
  if (on) showContributionEntry(false);
  const f = $('timelineFrame');
  if (on) loadTimeline();
  if (on) {const top = document.querySelector('header').getBoundingClientRect().bottom;f.style.top = top + 'px';f.style.height = `calc(100dvh - ${top}px)`;}
  f.hidden = !on;
  if (on) {document.querySelector('.uv-modes').hidden = true;showGallery(false);}
  $('timelineView').classList.toggle('active', on);
  if (on) {$('deskView').classList.remove('active');$('networkView').classList.remove('active');}
}

// Directory opens in place under the header, like the timeline; choosing a card returns to Connections.
function showGallery(on) {
  if (on) showContributionEntry(false);
  if (on) {showTimeline(false);openGallery();document.querySelector('.uv-modes').hidden = true;} else closeGallery();
  $('galleryView').classList.toggle('active', on);
  if (on) ['deskView', 'networkView', 'timelineView'].forEach((id) => $(id).classList.remove('active'));
}

function setView(v) {
  showTimeline(false);showGallery(false);
  state.view = v;
  showContributionEntry(v === 'desk');
  if (STYLE !== 'classic') setUniverseView(v);
  resetOrbit();
  $('deskView').classList.toggle('active', v === 'desk');
  $('networkView').classList.toggle('active', v === 'network');
  $('sceneEyebrow').textContent = v === 'desk' ? 'A PLACE FOR YOUR WORK' : 'PEOPLE, PROJECTS & POSSIBILITIES';
  $('sceneTitle').textContent = v === 'desk' ? 'Start from my desk.' : 'Work is what connects us.';
  $('sceneSubtitle').textContent = v === 'desk' ? 'Today’s work, and the memory of how you got here.' : 'Drag through time and watch shared work unfold.';
  $('sceneHint').textContent = v === 'desk' ? 'Click a desk entry to go back to your work, notes or contacts.' : 'Click a person to review shared projects · drag to rotate · scroll to zoom';
  renderProjectRail();
  updateScene();
  setCameraTarget();
}

function clearSelection() {
  state.selectedPerson = null;
  state.selectedOrg = null;
  state.selectedProject = null;
  state.detailMode = 'overview';
  refresh();
}

Object.assign(actions, { selectPerson, selectOrg, selectProject, setView, clearSelection, pause, renderPanel });

// Visual style: the top bar switches between the classic Between and the immersive styles in universe.js.
// Every style reads the same scenario data; ?style=<id> remembers the choice.
const STYLE = 'universe'; // This entry always opens the independent second universe.
function bindStyleSwitch() {
  if ($('styleBar')) mountStyleBar('universe2', '');
}

function bind() {
  bindTimeline();
  bindSceneControls();
  $('deskView').onclick = () => {pause();clearSelection();setView('desk');};
  $('networkView').onclick = () => setView('network');
  $('timelineView').onclick = () => {pause();showTimeline(true);};
  $('galleryView').onclick = () => {pause();showGallery(true);};
  actions.onGalleryClose = (v) => setView(v);
  $('backPanel').onclick = clearSelection;
  $('clearFilter').onclick = clearSelection;
  $('searchButton').onclick = openSearch;
  $('closeModal').onclick = () => $('recordDialog').close();
  $('aboutButton').onclick = () => {
    const root = modal('About this work world', 'ABOUT THIS PROTOTYPE');
    (CONFIG.about || []).forEach((t) => root.append(el('p', '', t)));
  };
  document.addEventListener('keydown', (e) => {
    // ⌘K or ⌘F (Ctrl on Windows) opens the app's own search instead of the browser's find bar.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && ['k', 'f'].includes(e.key.toLowerCase())) {e.preventDefault();openSearch();}
    if (e.key === 'Escape') {pause();if (galleryOpen()) setView(state.view);}
  });
  document.addEventListener('visibilitychange', () => {if (document.hidden) pause();});
}

try {
  bind();
  const syncCalendar = bindArchiveCalendar();
  bindStyleSwitch();
  if (STYLE !== 'classic') {
    document.body.classList.add('universe');
    $('universe').hidden = false;
    actions.onDayChange = () => {refreshUniverse();syncCalendar();refreshGallery();};
    mountUniverse($('universe'), STYLE);
    mountContributions();
    setView('network');
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(loadTimeline, { timeout: 4000 });
  } else initScene();
  refresh();
  $('loading').remove();
} catch (e) {
  $('loading').textContent = 'The scene could not load. Please reopen the local preview.';
  console.error(e);
}
