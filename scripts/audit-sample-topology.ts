/**
 * Deterministic structural preflight for the bundled sample.
 *
 * This is deliberately run with the browser-local TF-IDF representation. The
 * published demo must still be regenerated and checked with its declared dense
 * embedding model; this script catches accidental loss of planted structure or
 * cross-group connector examples before an expensive model run.
 */
import { SAMPLE_DATA } from '../constants.ts';
import { LocalVectorizer } from '../services/vectorizer.ts';
import {
  analyzeNetworkGraph,
  computeAutoKMeans,
  computeMutualKNN,
} from '../services/mathUtils.ts';

const sample = process.env.CORE_ONLY === '1'
  ? SAMPLE_DATA.filter(item => !item.id.endsWith('_10'))
  : SAMPLE_DATA;
const vectorizer = new LocalVectorizer(sample.map(item => item.text), 300);
const vectors = sample.map(item => vectorizer.embed(item.text));
const clustering = computeAutoKMeans(vectors);
const k = Math.min(5, Math.ceil(Math.sqrt(sample.length)));
const edges = computeMutualKNN(vectors, sample.map(item => item.id), k);
const analysis = analyzeNetworkGraph(
  sample.map((item, index) => ({
    id: item.id,
    clusterId: clustering.assignments[index],
    representationScore: 0,
    semanticIsolation: 0,
    x: 0,
    y: 0,
  })),
  edges,
);

console.log(JSON.stringify({
  sampleSize: sample.length,
  selectedK: clustering.k,
  status: clustering.diagnostics.status,
  reason: clustering.diagnostics.reason,
  clusterSizes: clustering.diagnostics.clusterSizes,
  silhouette: clustering.diagnostics.silhouette,
  stability: clustering.diagnostics.stability,
  neighborhoodAgreement: clustering.diagnostics.neighborhoodAgreement,
  methodAgreement: clustering.diagnostics.methodAgreement,
  networkK: k,
  edgeCount: edges.length,
  connectedComponents: analysis.connectedComponents,
  bridgeNodes: analysis.bridgeNodes,
  candidates: clustering.diagnostics.candidateDiagnostics,
}, null, 2));

if (!clustering.diagnostics.usableForDownstream) {
  throw new Error('The bundled sample has no validated TF-IDF partition.');
}
if (analysis.bridgeNodes.length === 0) {
  throw new Error('The bundled sample has no cross-group connector in the TF-IDF mutual-kNN graph.');
}
