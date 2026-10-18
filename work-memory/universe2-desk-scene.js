import * as THREE from './vendor/three.module.js';
import { createCharacter } from './characters.js';

// Desk companions have their own display positions; the relationship layout is untouched.
export function createDeskCompanions({ scene, labels, people, onSelect }) {
  const pool = new Map(),projected = new THREE.Vector3();
  const pageSize = 4;
  let rows = [],page = 0,selected = null;
  const pager = document.createElement('div');pager.className = 'uv2-desk-pager';pager.hidden = true;
  const previous = document.createElement('button'),next = document.createElement('button'),count = document.createElement('span');
  previous.textContent = '‹';previous.setAttribute('aria-label', 'Previous people with open items');
  next.textContent = '›';next.setAttribute('aria-label', 'Next people with open items');
  pager.append(previous, count, next);labels.append(pager);
  previous.onclick = () => {page--;};next.onclick = () => {page++;};
  // A grounded queue starts across the desktop and extends diagonally away.
  const slots = [[-.6, 0, -2.4], [-1.7, 0, -4.7], [-2.8, 0, -7], [-3.9, 0, -9.3]];
  function make(id) {
    const group = new THREE.Group();scene.add(group);group.scale.setScalar(.92);
    const character = createCharacter(group, people[id], 0x86b6ff);
    const button = document.createElement('button');button.className = 'uv2-desk-person';button.dataset.deskPerson = id;
    const badge = document.createElement('span'),name = document.createElement('b'),summary = document.createElement('small');
    badge.className = 'uv2-desk-person-badge';name.textContent = people[id].name;
    button.append(badge, name, summary);button.onclick = () => onSelect(id);labels.append(button);
    const obj = { group, button, badge, summary, character };pool.set(id, obj);return obj;
  }
  return {
    update(nextRows, selectedId) {
      const changed = rows.map((r) => r.id).join('|') !== nextRows.map((r) => r.id).join('|');
      rows = nextRows;selected = selectedId;if (changed) page = 0;
      page = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
      for (const row of rows) {
        const o = pool.get(row.id) || make(row.id);
        const text = [row.mine.length ? `To do (${row.mine.length})` : '', row.waiting.length ? `Awaiting them (${row.waiting.length})` : ''].filter(Boolean).join(' · ');
        o.badge.textContent = row.mine.length ? '!' : '◷';
        o.character.ring?.material.color.set(row.mine.length ? 0xffd08a : 0x9cb5dc);
        o.button.classList.toggle('waiting', !row.mine.length);
        o.button.classList.toggle('selected', selected === row.id);
        o.button.setAttribute('aria-label', `${people[row.id].name} · ${text}`);
        o.button.setAttribute('aria-pressed', String(selected === row.id));
        o.summary.replaceChildren();
        for (const [tone, label, items] of [['mine', 'To do', row.mine], ['waiting', 'Awaiting them', row.waiting]]) {
          if (!items.length) continue;
          const status = document.createElement('span');
          status.className = `desk-summary-${tone}`;
          status.textContent = `${label} (${items.length})`;
          o.summary.append(status);
        }
        const overdue = [...row.mine, ...row.waiting].filter((item) => item.overdue).length;
        if (overdue) {
          const status = document.createElement('span');status.className = 'desk-summary-overdue';
          status.textContent = `Overdue ${overdue}`;o.summary.append(status);
          o.button.setAttribute('aria-label', `${people[row.id].name} · ${text} · Overdue ${overdue}`);
        }
      }
    },
    frame(camera, width, height, visible) {
      for (const o of pool.values()) {o.group.visible = false;o.button.hidden = true;}
      pager.hidden = !visible || rows.length <= pageSize;
      if (!visible) return;
      previous.disabled = page === 0;next.disabled = (page + 1) * pageSize >= rows.length;count.textContent = `${page + 1} / ${Math.ceil(rows.length / pageSize)} · ${rows.length} ${rows.length === 1 ? 'person' : 'people'} with open items`;
      pager.style.left = width * .5 + 'px';pager.style.top = '88px';
      rows.slice(page * pageSize, page * pageSize + pageSize).forEach((row, i) => {
        const o = pool.get(row.id),position = slots[i],ahead = i ? slots[i - 1] : [0, 0, -.5];
        o.group.visible = true;o.group.position.set(...position);
        o.group.rotation.y = Math.atan2(ahead[0] - position[0], ahead[2] - position[2]);
        projected.copy(o.group.position).project(camera);
        o.button.hidden = projected.z < -1 || projected.z > 1;
        o.button.style.left = (projected.x * .5 + .5) * width + 'px';o.button.style.top = (-projected.y * .5 + .5) * height + 'px';
      });
    }
  };
}
