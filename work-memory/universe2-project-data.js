// Status and phase often say the same thing in different words ("Getting ready for construction drawings" /
// "Get ready for construction drawings", "Building work under way" / "Building work"); show it once.
const STOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'and', 'get', 'getting', 'under', 'way']);
const words = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(ing|s)$/, '')).join(' ');
export function sameWords(a, b) {const x = words(a),y = words(b);return !x || !y || x === y || x.includes(y) || y.includes(x);}

// Dated project display for Universe 2 only. Final archive state never fills historical gaps.
export function projectsAt(data, config, snapshot) {
  const known = new Set(data.records.filter((r) => r.first_seen_at <= snapshot.as_of).map((r) => r.project_id));
  const states = new Map(snapshot.desk.project_states.map((p) => [p.id, p]));
  return data.projects.filter((p) => p.id !== config.daily_project_id && known.has(p.id) && states.has(p.id)).map((p) => {
    const at = states.get(p.id),cfg = config.projects?.[p.id] || {};
    const phase = (p.phases || []).find((x) => x.id === at.phase);
    const status = config.status_labels?.[at.status] || at.status;
    const phaseLabel = phase?.label_zh || phase?.label_en || phase?.id || '';
    return { id: p.id, name: cfg.short || p.name_zh || p.name, color: '#' + (cfg.color || '829b83'),
      model: cfg.model || 'desk', status,
      phase: phaseLabel, state: at.status,
      summary: [status, sameWords(status, phaseLabel) ? '' : phaseLabel].filter(Boolean).join(' · '),
      date: snapshot.date,
      active: !['closed', 'completed', 'handed_back', 'on_hold'].includes(at.status) };
  });
}
