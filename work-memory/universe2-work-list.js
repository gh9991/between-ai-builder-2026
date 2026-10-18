// Read-only presentation of a person's work at the selected date.
// Documents and updates are context, not obligations, even when tagged "open".
const ACTIONABLE = new Set(['feedback', 'question', 'task', 'promise']);
const CLOSED = new Set(['addressed', 'kept', 'answered', 'completed']);

export function personWorkItems(data, snapshot, personId, projectId = null) {
  const known = new Map(data.records.filter((r) => r.first_seen_at <= snapshot.as_of).map((r) => [r.id, r]));
  const tasks = new Map((snapshot.task_states || []).map((t) => [t.id, t]));
  const rows = [],grouped = new Map();
  for (const unit of data.work_units || []) {
    const record = known.get(unit.record_id);
    if (!record || unit.type === 'small_talk' || projectId && unit.project_id !== projectId ||
    unit.from_id !== personId && !unit.to_ids?.includes(personId)) continue;
    const history = (unit.status_history || []).filter((h) => h.at <= snapshot.as_of && (h.evidence_ids || []).every((id) => known.has(id))).
    sort((a, b) => a.at.localeCompare(b.at));
    const task = unit.task_id && tasks.get(unit.task_id);
    const status = task ? task.status : history.at(-1)?.status;
    const actionable = ACTIONABLE.has(unit.type);
    const bucket = actionable && ['open', 'late', 'in_progress', 'blocked', 'pending', 'waiting'].includes(status) ? 'pending' :
    actionable && status === 'likely_addressed' ? 'review' : 'history';
    const label = bucket === 'pending' ? task?.overdue || status === 'late' ? 'Open · overdue' : 'Open / awaiting reply' :
    bucket === 'review' ? 'Likely done · please check' :
    actionable && CLOSED.has(status) ? 'Done' :
    ['cancelled', 'canceled'].includes(status) ? 'Cancelled' :
    actionable ? 'Status not recorded' : 'Record / reference';
    const row = { unit, record, bucket, label };
    // Keep feedback from the same source together, without merging different statuses.
    if (unit.type === 'feedback' && unit.group_id) {
      const key = [unit.record_id, unit.group_id, bucket].join(':');
      if (!grouped.has(key)) {row.feedback = [];grouped.set(key, row);rows.push(row);}
      grouped.get(key).feedback.push(unit);
    } else rows.push(row);
  }
  return rows.sort((a, b) => b.record.occurred_at.localeCompare(a.record.occurred_at));
}
