/** Regression checks for the bundled synthetic tutorial fixture. */
import { SAMPLE_DATA } from './.modules/constants.ts';
import { LocalVectorizer } from './.modules/services/vectorizer.ts';
import {
  analyzeNetworkGraph,
  computeMutualKNN,
  chooseMutualKnnK,
} from './.modules/services/mathUtils.ts';
import { extractContrastiveClusterLabel } from './.modules/services/textUtils.ts';

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n[Bundled synthetic tutorial fixture]');
const vectorizer = new LocalVectorizer(SAMPLE_DATA.map(item => item.text), 300);
const vectors = SAMPLE_DATA.map(item => vectorizer.embed(item.text));
const plantedGroups = new Map<string, number>();
const plantedAssignments = SAMPLE_DATA.map(item => {
  const group = item.id.split('_')[0];
  if (!plantedGroups.has(group)) plantedGroups.set(group, plantedGroups.size);
  return plantedGroups.get(group)!;
});

check('fixture contains four declared tutorial themes', plantedGroups.size === 4);
check('each declared theme contributes ten records',
  [...plantedGroups.keys()].every(prefix => SAMPLE_DATA.filter(item => item.id.startsWith(`${prefix}_`)).length === 10));
check('records use consultation prose rather than artificial topic labels',
  SAMPLE_DATA.every(item => !/\btopic\s*:/i.test(item.text)));
check('fixture contains an explicit land-use incompatibility',
  SAMPLE_DATA.find(item => item.id === 'Water_06')?.text.includes('Every plot should be removed') === true &&
  SAMPLE_DATA.find(item => item.id === 'Stewardship_06')?.text.includes('must not become flood storage') === true);
check('fixture contains an explicit sensitive-location incompatibility',
  SAMPLE_DATA.find(item => item.id === 'Habitat_07')?.text.includes('must hide precise nest sites') === true &&
  SAMPLE_DATA.find(item => item.id === 'Stewardship_07')?.text.includes('unredacted open data') === true);

const networkK = chooseMutualKnnK(SAMPLE_DATA.length);
const edges = computeMutualKNN(vectors, SAMPLE_DATA.map(item => item.id), networkK);
const analysis = analyzeNetworkGraph(
  SAMPLE_DATA.map((item, index) => ({
    id: item.id,
    // The planted labels are used only to confirm that the lexical fixture has
    // cross-theme neighborhood examples. Published demo generation separately
    // requires a validated unsupervised dense-model partition.
    clusterId: plantedAssignments[index],
    representationScore: 0,
    semanticIsolation: 0,
    x: 0,
    y: 0,
  })),
  edges,
);
check('tutorial graph contains designed mixed-theme connector candidates',
  analysis.bridgeNodes.some(id => id.endsWith('_10')),
  `connectors=${analysis.bridgeNodes.join(',') || 'none'}`);

const expectedLabelTerms = ['Urban Heat', 'Flood Resilience', 'Urban Biodiversity', 'Equitable Access'];
for (const [prefix, plantedId] of plantedGroups) {
  const members = SAMPLE_DATA.filter(item => item.id.startsWith(`${prefix}_`)).map(item => item.text);
  const label = extractContrastiveClusterLabel(members, SAMPLE_DATA.map(item => item.text));
  check(`cluster label for planted group ${plantedId + 1} is concise and topic-bearing`,
    label === expectedLabelTerms[plantedId], `label=${label}`);
}

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
