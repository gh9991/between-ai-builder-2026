// Only requests addressed to the viewer, using evidence known at the viewed date.
// A late promise from somebody else means I am waiting for them, not vice versa.
export function attentionAt(data, snapshot, viewerId) {
  const known = new Set(data.records.filter((r) => r.first_seen_at <= snapshot.as_of).map((r) => r.id));
  const contacts = new Set(snapshot.connections.nodes.map((n) => n.person_id));
  const result = {};
  const add = (id, reason) => {if (id !== viewerId && contacts.has(id)) (result[id] ||= []).push(reason);};
  for (const unit of data.work_units || []) {
    if (!known.has(unit.record_id) || !unit.to_ids?.includes(viewerId) || !['question', 'feedback'].includes(unit.type)) continue;
    const status = (unit.status_history || []).filter((h) => h.at <= snapshot.as_of && (h.evidence_ids || []).every((id) => known.has(id))).at(-1)?.status;
    if (status !== 'open') continue;
    const label = unit.type === 'question' ? 'Needs my reply' : 'Feedback to address';
    add(unit.from_id, { label, text: unit.text, recordId: unit.record_id, projectId: unit.project_id });
  }
  for (const task of snapshot.task_states || []) {
    if (task.owner_id !== viewerId || ['completed', 'cancelled', 'canceled'].includes(task.status)) continue;
    const recordId = (task.source_ids || []).find((id) => known.has(id));
    if (!recordId) continue;
    add(task.counterparty_id, { label: task.overdue ? 'My action item · overdue' : 'My action item', text: task.title, recordId, projectId: task.project_id, dueDate: task.due_date, overdue: !!task.overdue });
  }
  return result;
}
