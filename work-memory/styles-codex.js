// Visual styles contributed by Codex. Each entry plugs into the universe engine (universe.js) and uses the same
// scenario data, interaction (drag, hover, click), ecosystem cards, AI summary, reminders and timeline.
//
// A style is a plain object:
// {
//   id: 'atelier',                 // used in ?style=<id>; must be unique
//   label: 'Orbital workspace',            // shown in the top style bar
//   author: 'Codex',
//   theme: 'dark' | 'light',       // light swaps the glass/ink palette
//   layout: null | (id, ctx) => THREE.Vector3
//                                  // target position for person `id`; layout: null = free force-directed graph.
//                                  // ctx = {T, r: closeness radius, angle: project-sector angle, group, primary, V, THREE}
//   normal(pos) -> THREE.Vector3            // optional: "up" for a person standing on a curved surface (see 'moon')
//   edgePoint(a, b, t, out, ctx)            // optional: point at t∈[0,1] on the link between positions a and b
//   dress(ctx)                              // optional: add scene objects once; ctx = {scene, THREE, V, sprite, GLOW, add, mat,
//                                           //   ring, massing, projects, label(text, pos, cls, show, getPos), N, ids(), T}
//   update(dt, ctx)                         // optional: per-frame animation of the dressing
//   linkHeight: 0.55,                       // optional: how high above the feet links attach
//   camera: {phi, dist(ext)},               // optional: elevation angle and overview distance for the visible extent
//   legend: '<h4>…</h4><span>…</span>',      // HTML for the legend card
//   meta: 'Short description',                      // shown under the style name
// }
export default [];

// The built-in styles in universe.js (STYLES: universe, org, solar, studio, moon, table) are working examples.
// window.__uvDebug.tick(n) / .frame() advance physics and render manually when testing in a hidden browser tab.
