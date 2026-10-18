import { attentionAt } from './universe2-attention.js';

// Separate requests to me from work owned by another person; use only dated evidence.
export function deskPeopleAt(data, snapshot, viewerId) {
  const pending = attentionAt(data, snapshot, viewerId);
  const known = new Set(data.records.filter((r) => r.first_seen_at <= snapshot.as_of).map((r) => r.id));
  const contacts = new Set(snapshot.connections.nodes.map((n) => n.person_id));
  const rows = new Map(Object.entries(pending).map(([id, mine]) => [id, { id, mine, waiting: [] }]));
  for (const task of snapshot.task_states || []) {
    if (task.owner_id === viewerId || task.counterparty_id !== viewerId || !contacts.has(task.owner_id) || ['completed', 'cancelled', 'canceled'].includes(task.status)) continue;
    const recordId = (task.source_ids || []).find((id) => known.has(id));
    if (!recordId) continue;
    const row = rows.get(task.owner_id) || { id: task.owner_id, mine: [], waiting: [] };
    row.waiting.push({ label: task.overdue ? 'Awaiting them · overdue' : 'Awaiting them', text: task.title, recordId, projectId: task.project_id, dueDate: task.due_date, overdue: !!task.overdue });
    rows.set(row.id, row);
  }
  return [...rows.values()].sort((a, b) => Number(!!b.mine.length) - Number(!!a.mine.length) || a.id.localeCompare(b.id));
}
