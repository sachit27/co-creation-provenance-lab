import assert from 'node:assert/strict';
import { estimateAttributionCost } from '../tests/.modules/services/causalAttributionCost.ts';

console.log('[1] Repeated-generation characteristic values');

const sampled = estimateAttributionCost(4, { samples: 10, maxEvaluations: 10 });
assert.equal(sampled.maxEvaluations, 10);
assert.equal(sampled.generationsPerCoalition, 3);
assert.equal(sampled.maxCompletions, 30);
assert.equal(sampled.maxEmbeddingCalls, 180);
console.log('  PASS  default cost includes three generations per coalition');

const overridden = estimateAttributionCost(4, { samples: 10, maxEvaluations: 10, generationsPerCoalition: 4 });
assert.equal(overridden.maxCompletions, 40);
assert.equal(overridden.generationsPerCoalition, 4);
console.log('  PASS  explicit repetition count propagates to the cost ceiling');

const exact = estimateAttributionCost(3, { exact: true });
assert.equal(exact.maxEvaluations, 8);
assert.equal(exact.maxCompletions, 24);
console.log('  PASS  exact enumeration also repeats every coalition');

console.log('causal attribution checks passed');
