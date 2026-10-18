// A desk entry into the existing evidence-backed monthly work archive.
import { CONFIG, state, actions } from './state.js';
let dialog,frame,previousFocus,visible = false;
export const contributionVisible = () => visible;

export function closeContributions() {if (dialog?.open) dialog.close();}
// Any view change (the tabs in the header included) leaves the archive.
export function showContributionEntry(show) {
  visible = show;
  closeContributions();
}
export function mountContributions() {
  if (!CONFIG.contribution_report) return;
  dialog = document.createElement('dialog');dialog.className = 'uv2-contribution-dialog';
  dialog.setAttribute('aria-label', 'My Contributions · work archive');
  // Opens in place under the header, like Directory and Project Timeline: no frame of its own.
  const back = document.createElement('button');back.className = 'uv2-contribution-back';back.textContent = '← My desk';
  back.onclick = closeContributions;
  frame = document.createElement('iframe');frame.title = 'Work archive and the evidence for each contribution';
  dialog.append(frame, back);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {document.body.classList.remove('uv2-contribution-open');previousFocus?.focus?.();});
  addEventListener('keydown', (event) => {if (event.key === 'Escape' && dialog.open) {event.preventDefault();closeContributions();}});
  addEventListener('resize', place);
  window.addEventListener('message', (event) => {
    if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'between-contributions-close') closeContributions();
  });
}

export function openContributions() {
  if (!dialog || !visible || dialog.open) return;
  actions.pause?.();
  previousFocus = document.activeElement;
  const url = new URL(CONFIG.contribution_report, location.href);
  // Refresh the embedded report when its presentation changes, including cached local previews.
  url.searchParams.set('v', '20261018-month-label');
  url.searchParams.set('mode', new URLSearchParams(location.search).get('mode') || 'demo');
  url.searchParams.set('lang', 'en');url.searchParams.set('embed', '1');
  url.searchParams.set('asof', state.snapshot.date);
  if (frame.src !== url.href) frame.src = url.href;
  place();dialog.show();document.body.classList.add('uv2-contribution-open');frame.focus();
}
function place() {
  const top = document.querySelector('body > header')?.getBoundingClientRect().bottom || 0;
  dialog.style.top = top + 'px';dialog.style.height = `calc(100dvh - ${top}px)`;
}
