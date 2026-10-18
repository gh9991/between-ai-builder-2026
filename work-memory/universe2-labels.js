// Screen-space labels belong to the scene, never to the surrounding information panels.
// Run after projection: measure first, then apply visibility together to avoid layout thrashing.
export function protectUniverseLabels(root, canvas) {
  const bounds = canvas.getBoundingClientRect();
  const blockers = [...document.querySelectorAll('#styleBar, body > header, .timeline, #universe > .uv-glass, #universe > .uv-insight, .uv2-work-window, .uv2-window-pager')].
  filter((node) => node.getClientRects().length && !node.hidden).
  map((node) => node.getBoundingClientRect());
  const decisions = [...root.querySelectorAll('.uv-names > *, .uv-objs > *')].map((label) => {
    const box = label.getBoundingClientRect();
    if (!box.width || !box.height) return [label, false];
    const outside = box.left < bounds.left + 4 || box.right > bounds.right - 4 || box.top < bounds.top || box.bottom > bounds.bottom;
    const covered = blockers.some((panel) => box.left < panel.right + 5 && box.right > panel.left - 5 && box.top < panel.bottom + 5 && box.bottom > panel.top - 5);
    return [label, outside || covered];
  });
  for (const [label, hidden] of decisions) label.classList.toggle('uv2-label-occluded', hidden);
}
