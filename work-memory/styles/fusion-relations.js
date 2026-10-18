// Presentation-only relationship graph. All weights come from sources known at
// the viewed date; dragging never changes membership or the underlying archive.
export function relationshipGraph(D, day) {
  const snapshot = D.W.snapshots[day - 1];
  const ids = D.P.filter((p) => p.first <= day).map((p) => p.id);
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  const scores = { ...counts },pairs = new Map();
  for (const r of D.W.records) {
    if (r.first_seen_at > snapshot.as_of || ['calendar', 'journal', 'weekly_report'].includes(r.kind)) continue;
    const participants = [...new Set([r.actor_id, ...(r.participant_ids || [])])];
    const known = participants.filter((id) => id in counts);
    const age = Math.max(0, (Date.parse(snapshot.as_of) - Date.parse(r.first_seen_at)) / 86400000);
    if (participants.includes(D.persona.id)) for (const id of known) {
      counts[id]++;
      scores[id] += .3 + .7 * Math.exp(-age / 60);
    }
    for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) {
      const key = [known[i], known[j]].sort().join('|');
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }
  const degree = {},edges = [];
  for (const [key, count] of [...pairs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const [a, b] = key.split('|');
    if (count < 2 || (degree[a] || 0) >= 3 || (degree[b] || 0) >= 3) continue;
    edges.push({ a, b, count });degree[a] = (degree[a] || 0) + 1;degree[b] = (degree[b] || 0) + 1;
  }
  return { ids, counts, scores, max: Math.max(1, ...Object.values(scores)), edges };
}
