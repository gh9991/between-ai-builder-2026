// The archive calendar exposes only dates with a saved daily snapshot.
import { $, el } from './format.js';
import { DATA, state } from './state.js';
import { pause, setDay } from './timeline.js';
import { MONTHS_LONG, weekdayDate } from './i18n.js';

export function bindArchiveCalendar() {
  const input = $('dateInput'),row = input.parentElement;
  input.hidden = true;
  const dates = DATA.snapshots.map((s) => s.date);
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  const trigger = el('button', 'uv2-date-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Choose a work date');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'archiveCalendar');
  const label = el('b');
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 2v6m8-6v6M4 11h16"/>';
  trigger.append(label, icon);
  const popup = el('div', 'uv2-calendar');
  popup.id = 'archiveCalendar';
  popup.hidden = true;
  popup.setAttribute('role', 'group');
  popup.setAttribute('aria-label', 'Work date calendar');
  const heading = el('div', 'uv2-calendar-heading');
  const previous = el('button', '', '‹'),next = el('button', '', '›');
  previous.setAttribute('aria-label', 'Previous month');
  next.setAttribute('aria-label', 'Next month');
  const select = el('select');
  select.setAttribute('aria-label', 'Choose a work month');
  months.forEach((month) => {
    const option = el('option', '', `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`);
    option.value = month;
    select.append(option);
  });
  heading.append(previous, select, next);
  const weekdays = el('div', 'uv2-calendar-weekdays');
  ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach((d) => weekdays.append(el('span', '', d)));
  weekdays.setAttribute('aria-hidden', 'true');
  const grid = el('div', 'uv2-calendar-days');
  popup.append(heading, weekdays, grid);
  const today = el('button', 'uv2-today', 'Today');
  today.type = 'button';
  today.setAttribute('aria-label', 'Go to today');
  today.onclick = () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // Snapshots are dated local days. Outside the archive, use the nearest boundary.
    const index = dates.findLastIndex((d) => d <= date);
    pause();setDay(Math.max(0, index));close();
  };
  today.title = 'Go to today; outside the archive, the nearest available date is shown';
  row.append(trigger, today, popup);

  function close(restoreFocus = false) {
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  function render() {
    const month = select.value,index = months.indexOf(month);
    previous.disabled = index <= 0;
    next.disabled = index >= months.length - 1;
    grid.replaceChildren();
    const firstWeekday = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
    for (let cell = 0; cell < firstWeekday + count; cell++) {
      const day = cell - firstWeekday + 1;
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const dayIndex = day > 0 ? dates.indexOf(date) : -1;
      if (dayIndex < 0) {grid.append(el('span'));continue;}
      const button = el('button', '', String(day));
      button.setAttribute('aria-label', `${weekdayDate(date)} ${date.slice(0, 4)}`);
      button.setAttribute('aria-pressed', String(date === state.snapshot.date));
      button.onclick = () => {pause();setDay(dayIndex);close(true);};
      grid.append(button);
    }
  }
  function sync() {
    label.textContent = state.snapshot.date.split('-').reverse().join('/');
    if (!popup.hidden) {select.value = state.snapshot.date.slice(0, 7);render();}
  }
  trigger.onclick = () => {
    if (!popup.hidden) {close();return;}
    pause();
    popup.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    select.value = state.snapshot.date.slice(0, 7);
    render();
    grid.querySelector('[aria-pressed="true"]')?.focus();
  };
  select.onchange = render;
  previous.onclick = () => {select.value = months[months.indexOf(select.value) - 1];render();};
  next.onclick = () => {select.value = months[months.indexOf(select.value) + 1];render();};
  document.addEventListener('pointerdown', (event) => {if (!row.contains(event.target)) close();});
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !popup.hidden) {event.preventDefault();close(true);}
  });
  // Native month menus can temporarily move focus outside the document.
  row.addEventListener('focusout', (event) => {if (event.relatedTarget && !row.contains(event.relatedTarget)) close();});
  sync();
  return sync;
}
