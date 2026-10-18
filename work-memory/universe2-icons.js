// Line icons for Universe 2: one 24 × 24 set, 1.6 px stroke in the current text colour, replacing the mixed text
// symbols (▱ ⌘ ▤ ⌕). between.html and universe2.html inline the same paths in their static header.
export const ICON_PATHS = {
  desk: '<rect x="7" y="4" width="10" height="6.5" rx="1.2"/><path d="M12 10.5V13M3 13h18M5.5 13v6.5M18.5 13v6.5"/>',
  network: '<circle cx="6" cy="7" r="2.3"/><circle cx="18" cy="7" r="2.3"/><circle cx="12" cy="17.5" r="2.3"/><path d="M8.3 7h7.4M7.2 9l3.6 6.4M16.8 9l-3.6 6.4"/>',
  timeline: '<path d="M3.5 4v16"/><rect x="7" y="5.5" width="9" height="3" rx="1.5"/><rect x="9.5" y="10.5" width="11" height="3" rx="1.5"/><rect x="6.5" y="15.5" width="7" height="3" rx="1.5"/>',
  gallery: '<rect x="3.5" y="4" width="7.5" height="9.5" rx="1.6"/><rect x="13" y="4" width="7.5" height="9.5" rx="1.6"/><path d="M3.5 17.5h7.5M13 17.5h7.5M3.5 20.5h5M13 20.5h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4M12 7.7v.1"/>'
};
export const icon = (name) => `<svg class="uv-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
