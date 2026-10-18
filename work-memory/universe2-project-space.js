// Universe 2 owns the project room lifecycle; the overview stays intact underneath.
import { state, actions, CONFIG } from './state.js';
let room = null,previousFocus = null;
export const projectSpaceOpen = () => !!room;
export function closeProjectSpace() {
  if (!room) return;
  room.remove();room = null;
  document.body.classList.remove('uv2-project-space-open');
  previousFocus?.focus?.();previousFocus = null;
}
export function openProjectSpace(projectId) {
  actions.pause?.();
  closeProjectSpace();
  previousFocus = document.activeElement;
  room = document.createElement('section');
  room.className = 'uv2-project-space';
  room.setAttribute('aria-label', 'Project Space');
  const bar = document.createElement('div');bar.className = 'uv2-space-bar';
  const title = document.createElement('b');
  title.textContent = (CONFIG.projects?.[projectId]?.short || 'Project') + ' · Project Space';
  const back = document.createElement('button');back.textContent = '← Back to the project sky';back.onclick = closeProjectSpace;
  bar.append(title, back);
  const frame = document.createElement('iframe');
  frame.title = 'Project team and shared work';
  const url = new URL('./styles/universe2-project-space.html', location.href);
  url.searchParams.set('mode', new URLSearchParams(location.search).get('mode') || 'demo');
  url.searchParams.set('scenario', new URLSearchParams(location.search).get('scenario') || 'architect');
  url.searchParams.set('v', '20261018-project-heading');url.searchParams.set('lang', 'en');
  url.searchParams.set('project', projectId);url.searchParams.set('date', state.snapshot.date);
  frame.src = url.href;
  room.append(bar, frame);document.body.append(room);
  document.body.classList.add('uv2-project-space-open');
  // Keyboard goes straight into the room (no button pre-selected), so Esc works without clicking first.
  frame.addEventListener('load', () => {if (room?.contains(frame)) frame.contentWindow?.focus();}, { once: true });
}
// Esc while focus is outside the room's page (e.g. on Back to the project sky) also returns to the project starfield.
document.addEventListener('keydown', (e) => {if (room && e.key === 'Escape') {e.preventDefault();e.stopPropagation();closeProjectSpace();}}, true);
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== room?.querySelector('iframe')?.contentWindow) return;
  if (event.data?.type === 'between-universe2-project-close') closeProjectSpace();
  if (event.data?.type === 'between-universe2-project-selected' && CONFIG.projects?.[event.data.projectId]) {
    room.querySelector('.uv2-space-bar b').textContent = CONFIG.projects[event.data.projectId].short + ' · Project Space';
  }
});
