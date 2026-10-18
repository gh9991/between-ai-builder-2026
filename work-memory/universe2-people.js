// Universe 2 only: hide a contact only when every known work link is archived.
// No final-day membership or future resolution is allowed to classify a past contact.
import { projectsAt } from './universe2-project-data.js';
export function historicalPeopleAt(data, config, snapshot) {
  const knownRecords = data.records.filter((r) => r.first_seen_at <= snapshot.as_of);
  const known = new Set(knownRecords.map((r) => r.id));
  const archived = new Set(projectsAt(data, config, snapshot).filter((p) => !p.active).map((p) => p.id));
  const links = new Map(),keep = new Set([config.persona_id]);
  for (const r of knownRecords) {
    for (const id of new Set([r.actor_id, ...(r.participant_ids || [])])) {
      if (!links.has(id)) links.set(id, new Set());
      links.get(id).add(r.project_id);
    }
  }
  // Preserve unfinished work in both directions, including waiting for somebody else.
  for (const t of snapshot.task_states || []) {
    if (['completed', 'cancelled', 'canceled'].includes(t.status) || !(t.source_ids || []).some((id) => known.has(id))) continue;
    if (t.owner_id === config.persona_id || t.counterparty_id === config.persona_id) {
      keep.add(t.owner_id);keep.add(t.counterparty_id);
    }
  }
  for (const u of data.work_units || []) {
    if (!known.has(u.record_id) || !['question', 'feedback', 'promise'].includes(u.type)) continue;
    const participants = [u.from_id, ...(u.to_ids || [])];
    if (!participants.includes(config.persona_id)) continue;
    const status = (u.status_history || []).filter((h) => h.at <= snapshot.as_of && (h.evidence_ids || []).every((id) => known.has(id))).at(-1)?.status;
    if (['open', 'late', 'likely_addressed'].includes(status)) participants.forEach((id) => keep.add(id));
  }
  const people = new Map(data.people.map((p) => [p.id, p]));
  return new Set(snapshot.connections.nodes.map((n) => n.person_id).filter((id) => {
    const projects = links.get(id);
    // Agents, daily-work contacts and unclassified links are not retired by a project ending.
    return people.has(id) && people.get(id).kind !== 'agent' && !keep.has(id) && projects?.size &&
    [...projects].every((pid) => pid !== config.daily_project_id && archived.has(pid));
  }));
}
