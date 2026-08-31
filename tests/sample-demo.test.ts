/** Regression checks for the bundled synthetic tutorial fixture. */
import { SAMPLE_DATA } from './.modules/constants.ts';
import { LocalVectorizer } from './.modules/services/vectorizer.ts';
import {
  adjustedRandIndex,
  analyzeNetworkGraph,
  computeAutoKMeans,
  computeMutualKNN,
} from './.modules/services/mathUtils.ts';

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n[Bundled synthetic tutorial fixture]');
const vectorizer = new LocalVectorizer(SAMPLE_DATA.map(item => item.text), 300);
const vectors = SAMPLE_DATA.map(item => vectorizer.embed(item.text));
const clustering = computeAutoKMeans(vectors);
const plantedGroups = new Map<string, number>();
const plantedAssignments = SAMPLE_DATA.map(item => {
  const group = item.id.split('_')[0];
  if (!plantedGroups.has(group)) plantedGroups.set(group, plantedGroups.size);
  return plantedGroups.get(group)!;
});

check('fixture contains four declared tutorial themes', plantedGroups.size === 4);
check('local preflight reports a validated four-group partition',
  clustering.k === 4 && clustering.diagnostics.usableForDownstream,
  `k=${clustering.k}; ${clustering.diagnostics.reason}`);
check('unsupervised partition agrees strongly with the planted tutorial labels',
  adjustedRandIndex(plantedAssignments, clustering.assignments) >= 0.85,
  `ARI=${adjustedRandIndex(plantedAssignments, clustering.assignments).toFixed(3)}`);

const networkK = Math.min(5, Math.ceil(Math.sqrt(SAMPLE_DATA.length)));
const edges = computeMutualKNN(vectors, SAMPLE_DATA.map(item => item.id), networkK);
const analysis = analyzeNetworkGraph(
  SAMPLE_DATA.map((item, index) => ({
    id: item.id,
    clusterId: clustering.assignments[index],
    representationScore: 0,
    semanticIsolation: 0,
    x: 0,
    y: 0,
  })),
  edges,
);
check('tutorial graph contains cross-group connector candidates',
  analysis.bridgeNodes.length > 0,
  `connectors=${analysis.bridgeNodes.join(',') || 'none'}`);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
