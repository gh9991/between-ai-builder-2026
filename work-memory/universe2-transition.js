// A reversible, time-based transition. Positions are view coordinates only.
export const PEOPLE_TRANSITION_SECONDS = 1.1;
export function samplePeopleTransition(from, to, elapsed, duration = PEOPLE_TRANSITION_SECONDS) {
  const t = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
  const eased = t * t * (3 - 2 * t);
  return {
    position: from.position.map((value, i) => value + (to.position[i] - value) * eased),
    opacity: from.opacity + (to.opacity - from.opacity) * eased,
    done: t === 1
  };
}

// Only the arrival after an identity switch ramps up; ordinary motion stays at 1.
export const SCENARIO_ENTRY_SECONDS = 1.2;
export function scenarioEntryMotion(elapsed) {
  const t = Math.max(0, Math.min(1, elapsed / SCENARIO_ENTRY_SECONDS));
  return .15 + .85 * t * t * (3 - 2 * t);
}
