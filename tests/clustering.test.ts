/** Validated semantic-grouping regression tests. */
import {
  adjustedRandIndex,
  analyzeNetworkGraph,
  computeAutoKMeans,
  computeMutualKNN,
  meanSilhouette,
} from '../tests/.modules/services/mathUtils.ts';
import { runWhatIfSimulation } from '../tests/.modules/services/whatIfSimulation.ts';
import { performTensionAnalysis } from '../tests/.modules/services/tensionAnalysis.ts';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n[1] Silhouette edge cases');
const singletonScore = meanSilhouette(
  [[1, 0], [0.995, 0.1], [-1, 0]],
  [0, 0, 1],
);
check('singleton contributes zero to the mean instead of disappearing',
  singletonScore > 0 && singletonScore <= (2 / 3) + 1e-9,
  `score=${singletonScore}`);
check('all-singleton partition is unavailable', meanSilhouette([[1, 0], [0, 1], [-1, 0]], [0, 1, 2]) === -1);
check('mixed-dimensional vectors cannot yield a finite silhouette',
  meanSilhouette([[1, 0], [1, 0, 0], [0, 1]], [0, 0, 1]) === -1);
check('orthogonal duplicate pairs have exact silhouette one',
  meanSilhouette([[1, 0], [1, 0], [0, 1], [0, 1]], [0, 0, 1, 1]) === 1);
check('crossed two-by-two labels have exact ARI minus one half',
  Math.abs(adjustedRandIndex([0, 0, 1, 1], [0, 1, 0, 1]) + 0.5) < 1e-12);

console.log('\n[2] Sample-size and no-structure guards');
const tiny = computeAutoKMeans([[1, 0], [0.99, 0.01], [-1, 0], [-0.99, -0.01]]);
check('n below the configured minimum remains unpartitioned', tiny.k === 1 && !tiny.diagnostics.usableForDownstream);
check('small-run reason is explicit', tiny.diagnostics.reason.includes('at least'));
const identical = computeAutoKMeans(Array.from({ length: 12 }, () => [1, 0, 0]));
check('identical records cannot manufacture groups', identical.k === 1 && !identical.diagnostics.usableForDownstream);
let noiseState = 104729;
const noiseRandom = () => { noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0; return noiseState / 2 ** 32; };
const isotropicNoise = Array.from({ length: 60 }, () => Array.from({ length: 32 }, () => noiseRandom() - 0.5));
const noiseResult = computeAutoKMeans(isotropicNoise);
check('isotropic noise does not manufacture an accepted partition',
  noiseResult.k === 1 && !noiseResult.diagnostics.usableForDownstream);
const incomplete = computeAutoKMeans([...Array.from({ length: 8 }, (_, index) => [index < 4 ? 1 : 0, index < 4 ? 0 : 1]), [0, 0]]);
check('one failed embedding disables group-conditioned claims for the whole run',
  !incomplete.diagnostics.usableForDownstream && incomplete.diagnostics.reason.includes('complete common embedding space'));

console.log('\n[3] More than five well-separated semantic groups');
let state = 19;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
const sixGroups: number[][] = [];
for (let group = 0; group < 6; group++) {
  for (let member = 0; member < 10; member++) {
    const vector = new Array(12).fill(0).map(() => (random() - 0.5) * 0.015);
    vector[group] += 1;
    sixGroups.push(vector);
  }
}
const six = computeAutoKMeans(sixGroups);
check('six planted groups are not merged into a five-group display cap', six.k === 6, `k=${six.k}`);
check('accepted result carries all diagnostic gates',
  six.diagnostics.usableForDownstream &&
  (six.diagnostics.silhouette ?? 0) >= six.diagnostics.thresholds.minimumSilhouette &&
  (six.diagnostics.stability ?? 0) >= six.diagnostics.thresholds.minimumStability &&
  (six.diagnostics.neighborhoodAgreement ?? 0) >= six.diagnostics.thresholds.minimumNeighborhoodAgreement);
check('group sizes travel with the result', six.diagnostics.clusterSizes.length === 6 && six.diagnostics.clusterSizes.every(size => size === 10), six.diagnostics.clusterSizes.join(','));

const highDimensional = sixGroups.map(vector => [
  ...vector,
  ...Array.from({ length: 500 }, () => (random() - 0.5) * 0.002),
]);
const projected = computeAutoKMeans(highDimensional);
check('ordinary high-dimensional consultations fit in the original space',
  projected.k === 6 &&
  projected.diagnostics.projectionMethod === 'none' &&
  projected.diagnostics.analysisDimensions === 512 &&
  projected.diagnostics.projectionDistanceCorrelation >= projected.diagnostics.thresholds.minimumProjectionDistanceCorrelation &&
  projected.diagnostics.silhouette !== null);
check('rejected original-space candidates also retain their original-space silhouette',
  projected.diagnostics.candidateDiagnostics.every(candidate => candidate.fullSpaceSilhouette === candidate.silhouette));
const largeExact = computeAutoKMeans([...highDimensional, ...highDimensional, ...highDimensional]);
check('larger runs also fit in the original embedding space',
  largeExact.k === 6 && largeExact.diagnostics.analysisDimensions === 512 &&
  largeExact.diagnostics.projectionMethod === 'none' &&
  (largeExact.diagnostics.silhouette ?? -1) > largeExact.diagnostics.thresholds.minimumSilhouette);

const sixRecords = computeAutoKMeans([[1, 0], [1, 0.01], [0, 1], [0.01, 1], [-1, 0], [-1, 0.01]]);
check('stability samples never silently become the whole dataset',
  sixRecords.diagnostics.candidateDiagnostics.every(candidate => candidate.stabilitySampleSize === 5));
check('candidate requiring more records than a genuine subsample is rejected explicitly',
  sixRecords.diagnostics.candidateDiagnostics.some(candidate => candidate.k === 3 &&
    !candidate.eligible && candidate.subsampleStability === null && candidate.rejectionReasons.includes('insufficient-subsample-size')));
check('updated calculation has a distinct recorded method version',
  sixRecords.diagnostics.methodVersion === 'spherical-kmeans-stability-v4');

console.log('\n[4] Order invariance and label invariance');
const reversed = computeAutoKMeans([...sixGroups].reverse());
check('selected k is invariant to record order', reversed.k === six.k);
check('record assignments are invariant after restoring record order',
  adjustedRandIndex(six.assignments, [...reversed.assignments].reverse()) === 1);
check('candidate diagnostics include rejected and accepted k values',
  six.diagnostics.candidateDiagnostics.length >= 5 && six.diagnostics.candidateDiagnostics.some(candidate => candidate.eligible));

console.log('\n[5] Shape and imbalance sensitivity');
const moons: number[][] = [];
for (let index = 0; index < 60; index++) {
  const angle = Math.PI * index / 59;
  moons.push([Math.cos(angle), Math.sin(angle), 0.1]);
  moons.push([1 - Math.cos(angle), 0.5 - Math.sin(angle), 0.1]);
}
const moonResult = computeAutoKMeans(moons);
check('strong shape sensitivity rejects the planted two-group K-Means candidate',
  moonResult.diagnostics.candidateDiagnostics.some(candidate =>
    candidate.k === 2 && candidate.rejectionReasons.includes('method-sensitivity')),
  JSON.stringify(moonResult.diagnostics.candidateDiagnostics.map(candidate => ({
    k: candidate.k,
    eligible: candidate.eligible,
    silhouette: candidate.silhouette,
    methodAgreement: candidate.methodAgreement,
    reasons: candidate.rejectionReasons,
  }))));

const imbalanced = [
  ...Array.from({ length: 50 }, (_, index) => [1, ((index % 7) - 3) * 0.003, 0.01]),
  ...Array.from({ length: 5 }, (_, index) => [0.01, 1, (index - 2) * 0.003]),
];
const imbalancedResult = computeAutoKMeans(imbalanced);
check('a stable small group is retained rather than absorbed by a size imbalance',
  imbalancedResult.k === 2 && imbalancedResult.diagnostics.clusterSizes.slice().sort((a, b) => a - b).join(',') === '5,50',
  `k=${imbalancedResult.k}; sizes=${imbalancedResult.diagnostics.clusterSizes.join(',')}`);

console.log('\n[6] Downstream gating');
const participants = Array.from({ length: 8 }, (_, index) => ({
  id: `P${index}`,
  originalText: 'text',
  representationScore: 0.5,
  semanticIsolation: 0.2,
  clusterId: 0,
}));
const unavailableData: any = {
  participants,
  clusters: [{ id: 0, label: 'Unpartitioned records', color: '#94a3b8' }],
  clusteringDiagnostics: tiny.diagnostics,
  metrics: {},
  config: {},
};
let rejected = false;
try {
  runWhatIfSimulation(unavailableData, { type: 'add_voices', clusterId: 0, additionalCount: 2 } as any);
} catch { rejected = true; }
check('cluster-conditioned simulation rejects an unavailable partition', rejected);
const unavailableTension = await performTensionAnalysis(
  participants as any,
  participants.map(participant => ({ id: participant.id, text: participant.originalText })) as any,
  'summary',
  unavailableData.clusters,
  {} as any,
  undefined,
  false,
  tiny.diagnostics.reason,
);
check('tension sampling fails closed before any evaluator call',
  unavailableTension.basis === 'unavailable' && unavailableTension.pairs.length === 0 && unavailableTension.tensionFidelityScore === null);

const appSource = readFileSync('App.tsx', 'utf8');
const facilitationSource = readFileSync('services/facilitationCoPilot.ts', 'utf8');
check('large-N utility attribution is gated on a robust retained partition',
  appSource.includes("data.clusteringDiagnostics?.usableForDownstream !== true") &&
  appSource.includes("data.clusteringDiagnostics?.usableForDownstream === true"));
check('facilitation group-gap claims are gated on a robust retained partition',
  facilitationSource.includes("data.clusteringDiagnostics?.usableForDownstream === true"));

console.log('\n[7] Similarity-network construction guards');
const guardedEdges = computeMutualKNN(
  [[1, 0], [0, 1], [0, 0], [Number.NaN, 1]],
  ['valid-a', 'valid-b', 'zero', 'invalid'],
  3,
);
check('zero, invalid, and non-positive similarity vectors cannot create forced links', guardedEdges.length === 0);
const tiedOriginal = computeMutualKNN(
  [[1, 0], [1, 0], [1, 0], [1, 0]],
  ['d', 'b', 'a', 'c'],
  1,
).map(edge => [edge.source, edge.target].sort().join(':')).sort();
const tiedReordered = computeMutualKNN(
  [[1, 0], [1, 0], [1, 0], [1, 0]],
  ['a', 'b', 'c', 'd'],
  1,
).map(edge => [edge.source, edge.target].sort().join(':')).sort();
check('equal-similarity neighbor ties resolve by participant ID rather than row order',
  JSON.stringify(tiedOriginal) === JSON.stringify(tiedReordered),
  `${JSON.stringify(tiedOriginal)} vs ${JSON.stringify(tiedReordered)}`);
const roleAnalysis = analyzeNetworkGraph(
  [
    { id: 'a-core', clusterId: 0 },
    { id: 'a-mixed', clusterId: 0 },
    { id: 'b-leaf', clusterId: 1 },
  ] as any,
  [
    { source: 'a-core', target: 'a-mixed', weight: 0.8 },
    { source: 'a-mixed', target: 'b-leaf', weight: 0.7 },
  ],
);
check('connector candidates require both within-group and cross-group retained edges',
  roleAnalysis.bridgeNodes.join(',') === 'a-mixed');
check('a degree-one cross-group endpoint remains peripheral, not a connector candidate',
  roleAnalysis.peripheralNodes.includes('b-leaf') && !roleAnalysis.bridgeNodes.includes('b-leaf'));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
