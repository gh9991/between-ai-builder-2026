// The competition release includes the architect work archive.
import architectConfig from './architect/scenario.json' with { type: 'json' };
import architectData from './architect/worklife.json' with { type: 'json' };
import architectStories from './architect/work-stories.json' with { type: 'json' };
export const SCENARIOS = [{ config: architectConfig, data: architectData, stories: architectStories }];
export function findScenario() {return SCENARIOS[0];}
