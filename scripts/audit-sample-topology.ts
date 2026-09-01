/**
 * Deterministic structural preflight for the bundled sample.
 *
 * This structural check uses the browser-local TF-IDF representation and the
 * fixture's hidden planted labels to confirm that mixed-theme neighborhood
 * examples remain present. It does not claim that TF-IDF recovered the groups.
 * Published demo generation separately requires an unsupervised partition from
 * the declared dense embedding model to pass every production validity gate.
 */
import { SAMPLE_DATA } from '../constants.ts';
import { LocalVectorizer } from '../services/vectorizer.ts';
import {
  analyzeNetworkGraph,
  computeAutoKMeans,
  computeMutualKNN,
  chooseMutualKnnK,
} from '../services/mathUtils.ts';

const sample = process.env.CORE_ONLY === '1'
  ? SAMPLE_DATA.filter(item => !item.id.endsWith('_10'))
  : SAMPLE_DATA;
const vectorizer = new LocalVectorizer(sample.map(item => item.text), 300);
const vectors = sample.map(item => vectorizer.embed(item.text));
const clustering = computeAutoKMeans(vectors);
const plantedGroups = new Map<string, number>();
const plantedAssignments = sample.map(item => {
  const prefix = item.id.split('_')[0];
  if (!plantedGroups.has(prefix)) plantedGroups.set(prefix, plantedGroups.size);
  return plantedGroups.get(prefix)!;
});
const k = chooseMutualKnnK(sample.length);
const edges = computeMutualKNN(vectors, sample.map(item => item.id), k);
const analysis = analyzeNetworkGraph(
  sample.map((item, index) => ({
    id: item.id,
    clusterId: plantedAssignments[index],
    representationScore: 0,
    semanticIsolation: 0,
    x: 0,
    y: 0,
  })),
  edges,
);

console.log(JSON.stringify({
  sampleSize: sample.length,
  plantedThemeCount: plantedGroups.size,
  lexicalBaselineClustering: {
    selectedK: clustering.k,
    status: clustering.diagnostics.status,
    reason: clustering.diagnostics.reason,
  },
  networkK: k,
  edgeCount: edges.length,
  connectedComponents: analysis.connectedComponents,
  designedConnectorCandidates: analysis.bridgeNodes,
}, null, 2));

if (plantedGroups.size !== 4) {
  throw new Error('The bundled sample must retain four declared tutorial themes.');
}
if (!analysis.bridgeNodes.some(id => id.endsWith('_10'))) {
  throw new Error('The bundled sample has no designed mixed-theme connector in the lexical neighborhood graph.');
}
