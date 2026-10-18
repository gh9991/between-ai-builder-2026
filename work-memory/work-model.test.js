import assert from 'node:assert/strict';
import { visibleWorkEvents, sharedTaskStates } from './work-model.js';
import { SCENARIOS, findScenario } from './data/scenarios/index.js';
// Generic invariants hold for every registered scenario; all retained evidence must be visible and correctly attributed.
for (const { config, data, stories } of SCENARIOS) {
  for (const s of data.snapshots) {
    for (const e of visibleWorkEvents(stories, data.records, s.as_of)) {
      assert(e.sources.every((r) => r.first_seen_at <= s.as_of), config.id);
      assert(e.sources.every((r) => r.project_id === e.project_id), config.id);
      assert(e.participant_ids.every((id) => e.sources.some((r) => r.participant_ids.includes(id))), config.id);
    }
  }
}
console.log('PASS: historical visibility and personal attribution across the archive.');
