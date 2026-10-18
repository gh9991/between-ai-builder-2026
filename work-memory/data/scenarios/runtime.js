// Public bundle receives the resolved data before state.js is evaluated.
const archive = window.betweenRuntimeScenario;
if (!archive?.config || !archive?.data || !archive?.stories) throw Error('Archive not initialized');
export const SCENARIOS = [{config:archive.config, data:archive.data, stories:archive.stories}];
export function findScenario() { return SCENARIOS[0]; }
