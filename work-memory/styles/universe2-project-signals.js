// Project-room visual signals use only evidence available at the selected date.
import { attentionAt } from '../universe2-attention.js?v=20261017-en2';
import { EN } from '../i18n.js';
export const WORK_COLORS = { feedback: 0xff9f6b, task: 0xffffff, decision: 0x86b6ff, file_pointer: 0x9aa6ba, question: 0xff8fa3, promise: 0xf6c27a, update: 0x4fe3cf };
// Desk in Space ranks the whole known cast before filtering to a project team.
// Keep its scoring/tie order and four visual levels, but recompute at the viewed date.
export function deskAttention(D, day) {
  const snapshot = D.W.snapshots[day - 1],records = new Map(D.W.records.map((r) => [r.id, r]));
  const visible = D.W.records.filter((r) => r.first_seen_at <= snapshot.as_of),known = new Set(visible.map((r) => r.id));
  const allUnits = D.W.work_units || [],units = allUnits.filter((u) => known.has(u.record_id) && u.type !== 'small_talk');
  const statusAt = (u) => (u.status_history || []).filter((h) => h.at <= snapshot.as_of && (h.evidence_ids || []).every((id) => known.has(id))).at(-1)?.status;
  const tasks = (snapshot.task_states || []).filter((t) => t.source_ids?.some((id) => known.has(id)));
  const unitsByRecord = new Map();for (const u of allUnits) {if (!unitsByRecord.has(u.record_id)) unitsByRecord.set(u.record_id, []);unitsByRecord.get(u.record_id).push(u);}
  const smallOnly = (r) => {const us = unitsByRecord.get(r.id);return us?.length && us.every((u) => u.type === 'small_talk');};
  const ids = new Set(D.P.map((p) => p.id));
  const ranked = snapshot.connections.nodes.filter((n) => ids.has(n.person_id)).map((n) => {
    const id = n.person_id,mine = tasks.filter((t) => t.owner_id === D.persona.id && t.counterparty_id === id && t.status !== 'completed');
    const groups = {};for (const u of units) if (u.type === 'feedback' && u.from_id === id) (groups[u.group_id || u.id] ||= []).push(u);
    const feedback = Object.values(groups).sort((a, b) => records.get(b[0].record_id).occurred_at.localeCompare(records.get(a[0].record_id).occurred_at))[0] || [];
    const question = units.some((u) => u.type === 'question' && u.from_id === id && statusAt(u) === 'open');
    const late = units.some((u) => u.type === 'promise' && u.from_id === id && statusAt(u) === 'late');
    const score = (question ? 3 : 0) + feedback.filter((u) => statusAt(u) === 'open').length + (mine.some((t) => t.overdue) ? 2 : mine.length ? 1 : 0) + (late ? 1 : 0);
    const recent = visible.filter((r) => r.participant_ids?.includes(id) && (new Date(snapshot.as_of) - new Date(r.first_seen_at)) / 864e5 < 2 && !smallOnly(r)).length;
    return { id, score, recent };
  }).sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score > 0 ? ranked[0].id : null;
  return Object.fromEntries(ranked.map((p, index) => {
    const level = p.id === top ? 'flare' : p.score >= 2 ? 'warn' : p.recent ? 'new' : 'normal';
    return [p.id, { score: p.score, rank: index + 1, level, size: .5 * { flare: 1.6, warn: 1.25, new: 1.1, normal: .7 }[level], opacity: .9,
      flare: level === 'flare', flareSize: 1.8, flareOpacity: .9,
      label: { flare: 'Top reminder across all work', warn: 'Needs attention', new: 'New activity', normal: 'Regular contact' }[level] }];
  }));
}
export function projectSignals(D, projectId, day) {
  const snapshot = D.W.snapshots[day - 1];
  const known = new Set(D.W.records.filter((r) => r.first_seen_at <= snapshot.as_of).map((r) => r.id));
  const lights = deskAttention(D, day);
  const requests = attentionAt(D.W, snapshot, D.persona.id);
  const units = (D.W.work_units || []).filter((u) => u.project_id === projectId && known.has(u.record_id) && u.type !== 'small_talk');
  const statusAt = (u) => (u.status_history || []).filter((h) => h.at <= snapshot.as_of && (h.evidence_ids || []).every((id) => known.has(id))).at(-1)?.status;
  return Object.fromEntries(D.P.map((p) => {
    const shared = units.filter((u) => u.from_id === p.id || u.to_ids?.includes(p.id));
    const work = shared.slice(-9).map((u) => {
      const status = statusAt(u);
      return { id: u.id, recordId: u.record_id, type: u.type, color: WORK_COLORS[u.type] || WORK_COLORS.update, done: ['addressed', 'kept', 'answered', 'likely_addressed', 'completed', 'closed', 'cancelled'].includes(status) };
    });
    const pending = (requests[p.id] || []).filter((r) => r.projectId === projectId);
    return [p.id, { work, requests: pending, light: lights[p.id] }];
  }));
}
