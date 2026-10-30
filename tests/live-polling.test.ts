import assert from 'node:assert/strict';
import { livePollingDelay } from '../live/polling.ts';

assert.equal(livePollingDelay('visible', 'open'), 2_000, 'active sessions should update promptly');
assert.equal(livePollingDelay('visible', 'published', false), 2_000, 'participants should promptly receive newly opened feedback');
assert.equal(livePollingDelay('visible', 'published', true), 12_000, 'completed participant views should back off');
assert.equal(livePollingDelay('hidden', 'open'), 15_000, 'background tabs should reduce network and battery use');

console.log('Live polling policy tests passed.');
