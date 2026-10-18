// Small DOM and text helpers shared by every module.
import { EN, dayMonth } from './i18n.js';
export const $ = (id) => document.getElementById(id);

export const el = (tag, cls, text) => {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text !== undefined) x.textContent = text;
  return x;
};

export function button(text, fn, cls = 'text-button') {
  const b = el('button', cls, text);
  b.onclick = fn;
  return b;
}

export function initials(p) {
  return p.name.split(' ').map((x) => x[0]).join('');
}

export function dateText(date) {
  return dayMonth(date);
}
