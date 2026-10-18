// Derive every view from evidence already visible on the chosen date.
export function visibleWorkEvents(stories, records, asOf, projectId = null, personId = null) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return stories.flatMap((story) => {
    if (projectId && story.project_id !== projectId) return [];
    const primary = byId.get(story.source_ids[0]);
    if (!primary || primary.first_seen_at > asOf) return [];
    const sources = story.source_ids.map((id) => byId.get(id)).filter((r) => r && r.first_seen_at <= asOf);
    if (personId && !sources.some((r) => r.participant_ids.includes(personId))) return [];
    return [{ ...story, sources, occurred_at: primary.occurred_at, known_at: primary.first_seen_at,
      participant_ids: [...new Set(sources.flatMap((r) => r.participant_ids))] }];
  }).sort((a, b) => a.known_at.localeCompare(b.known_at));
}
export function sharedTaskStates(snapshot, projectId, personId = null) {
  return snapshot.task_states.filter((t) => t.project_id === projectId && (!personId || t.owner_id === personId || t.counterparty_id === personId));
}
