/**
 * Tension & Contradiction Mapping
 *
 * Identifies claim pairs across participants that are in directional tension
 * (disagreements, opposing positions), then classifies how the summary handles
 * each tension: acknowledged, suppressed, merged, or distorted.
 *
 * For large datasets: samples representative participants per cluster rather
 * than comparing all N^2 pairs. Caps LLM calls at ~15 for scalability.
 *
 * Runs in Phase 2 (background enrichment) due to LLM dependency.
 */

import { ParticipantAnalysis, ParticipantInput, AnalysisConfig, ClusterData, TensionPair, TensionAnalysis, TensionHandling } from '../types';
import { generateCompletion } from './completionRouter';

const MAX_TENSION_PAIRS = 25;
const MAX_REPS_PER_CLUSTER = 4;

// ── Cluster Sampling ────────────────────────────────────────────────────────────

const sampleClusterRepresentatives = (
  participants: ParticipantAnalysis[],
  inputs: ParticipantInput[],
  clusters: ClusterData[]
): Map<number, Array<{ id: string; text: string; clusterId: number }>> => {
  const map = new Map<number, Array<{ id: string; text: string; clusterId: number }>>();

  for (const cluster of clusters) {
    const members = participants
      .filter(p => p.clusterId === cluster.id)
      .sort((a, b) => {
        // Prefer diverse selection: mix high + low representation + high isolation
        const scoreA = Math.abs(a.representationScore - 0.5) + a.semanticIsolation * 0.3;
        const scoreB = Math.abs(b.representationScore - 0.5) + b.semanticIsolation * 0.3;
        return scoreB - scoreA;
      })
      .slice(0, MAX_REPS_PER_CLUSTER);

    map.set(cluster.id, members.map(m => ({
      id: m.id,
      text: (inputs.find(i => i.id === m.id)?.text || m.originalText).slice(0, 500),
      clusterId: m.clusterId,
    })));
  }

  return map;
};

// ── Tension Detection via LLM ───────────────────────────────────────────────────

const detectTensionsBetweenGroups = async (
  groupA: Array<{ id: string; text: string; clusterId: number }>,
  groupB: Array<{ id: string; text: string; clusterId: number }>,
  config: AnalysisConfig
): Promise<Array<Omit<TensionPair, 'summaryHandling' | 'summaryEvidence'>>> => {
  const prompt = `Analyze the two groups of participant inputs below and identify points of TENSION between them.

GROUP A:
${groupA.map(p => `[${p.id}] "${p.text}"`).join('\n')}

GROUP B:
${groupB.map(p => `[${p.id}] "${p.text}"`).join('\n')}

A tension exists when participants hold positions that create a genuine point of disagreement. This includes:

1. **Direct contradiction**: one asserts X, the other asserts the opposite of X
2. **Priority conflict**: both may want improvement, but they prioritize competing goals (e.g. economic growth vs environmental protection, speed vs thoroughness)
3. **Trade-off tension**: one participant's proposal would come at the cost of what another values (e.g. "expand roads" vs "reduce car dependency")
4. **Approach disagreement**: same goal but fundamentally different methods (e.g. "top-down regulation" vs "community-led initiatives")
5. **Scope/urgency tension**: one demands immediate radical change while another advocates gradual transition

Do NOT flag:
- Participants simply discussing different topics with no conflict
- Complementary proposals that could coexist without trade-offs

Maximum 5 tension pairs. If no tensions exist, return an empty array.

Return a JSON array:
[{"participantA": "id", "textA": "their key claim", "participantB": "id", "textB": "their opposing claim", "description": "brief description of the tension"}, ...]

Return ONLY the JSON array.`;

  try {
    const response = await generateCompletion(
      prompt,
      'You are an expert in argument analysis and deliberative discourse. Identify genuine disagreements, not mere topical differences. Return only valid JSON.',
      config
    );
    const match = response.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn('[TensionAnalysis] No JSON array found in LLM response:', response.slice(0, 200));
      return [];
    }
    const parsed = JSON.parse(match[0]) as any[];
    const filtered = parsed
      .filter(t => t.participantA && t.participantB && t.description)
      .slice(0, 5)
      .map(t => ({
        claimA: {
          participantId: t.participantA,
          text: t.textA || '',
          clusterId: groupA.find(p => p.id === t.participantA)?.clusterId ?? groupB.find(p => p.id === t.participantA)?.clusterId ?? 0,
        },
        claimB: {
          participantId: t.participantB,
          text: t.textB || '',
          clusterId: groupB.find(p => p.id === t.participantB)?.clusterId ?? groupA.find(p => p.id === t.participantB)?.clusterId ?? 0,
        },
        tensionDescription: t.description,
      }));
    if (filtered.length === 0) {
      console.log('[TensionAnalysis] LLM found no genuine tensions between groups (this is normal for aligned groups)');
    }
    return filtered;
  } catch (e) {
    console.warn('[TensionAnalysis] Tension detection failed:', e);
  }
  return [];
};

// ── Summary Handling Classification ─────────────────────────────────────────────

const classifyTensionHandlingBatch = async (
  pairs: Array<Omit<TensionPair, 'summaryHandling' | 'summaryEvidence'>>,
  summary: string,
  config: AnalysisConfig
): Promise<TensionPair[]> => {
  if (pairs.length === 0) return [];

  const prompt = `For each numbered TENSION below, determine how the SUMMARY handles it.

SUMMARY:
"${summary}"

TENSIONS:
${pairs.map((t, i) => `[${i + 1}] "${t.claimA.text}" (${t.claimA.participantId}) vs "${t.claimB.text}" (${t.claimB.participantId})
Tension: ${t.tensionDescription}`).join('\n\n')}

For each tension, classify the summary's handling as:
- "acknowledged": The summary presents both sides of this tension
- "suppressed": The summary only includes one side, dropping the other
- "merged": The summary creates false consensus by averaging or blending the opposing positions
- "distorted": The summary mischaracterizes the balance or nature of the disagreement

Return a JSON array:
[{"handling": "acknowledged|suppressed|merged|distorted", "evidence": "quote or description from the summary showing how it was handled, or null if suppressed"}, ...]

Return ONLY the JSON array.`;

  try {
    const response = await generateCompletion(
      prompt,
      'You are an expert in discourse analysis and summarization fidelity. Return only valid JSON.',
      config
    );
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as any[];
      const valid: TensionHandling[] = ['acknowledged', 'suppressed', 'merged', 'distorted'];
      return pairs.map((pair, i) => {
        const result = parsed[i];
        const handling = result && valid.includes(result.handling) ? result.handling as TensionHandling : 'suppressed';
        return {
          ...pair,
          summaryHandling: handling,
          summaryEvidence: result?.evidence || null,
        };
      });
    }
  } catch (e) {
    console.warn('[TensionAnalysis] Handling classification failed:', e);
  }

  // Fallback: mark all as suppressed (conservative default)
  return pairs.map(pair => ({
    ...pair,
    summaryHandling: 'suppressed' as const,
    summaryEvidence: null,
  }));
};

// ── Cluster-Level Aggregation ───────────────────────────────────────────────────

const aggregateClusterTensions = (
  pairs: TensionPair[],
  clusters: ClusterData[]
): TensionAnalysis['clusterTensions'] => {
  const map: Record<string, { count: number; handlings: TensionHandling[] }> = {};

  for (const pair of pairs) {
    const key = [Math.min(pair.claimA.clusterId, pair.claimB.clusterId),
                 Math.max(pair.claimA.clusterId, pair.claimB.clusterId)].join('-');
    if (!map[key]) map[key] = { count: 0, handlings: [] };
    map[key].count++;
    map[key].handlings.push(pair.summaryHandling);
  }

  return Object.entries(map).map(([key, val]) => {
    const [a, b] = key.split('-').map(Number);
    // Find dominant handling
    const counts: Record<TensionHandling, number> = { acknowledged: 0, suppressed: 0, merged: 0, distorted: 0 };
    for (const h of val.handlings) counts[h]++;
    const dominant = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as TensionHandling;
    return { clusterA: a, clusterB: b, tensionCount: val.count, dominantHandling: dominant };
  });
};

// ── Intra-Cluster Tension Detection ──────────────────────────────────────────────
// Splits a single cluster's representatives into two halves for comparison.
// Tensions exist within groups too — disagreements aren't only cross-cluster.

const detectIntraClusterTensions = async (
  members: Array<{ id: string; text: string; clusterId: number }>,
  config: AnalysisConfig
): Promise<Array<Omit<TensionPair, 'summaryHandling' | 'summaryEvidence'>>> => {
  if (members.length < 2) return [];

  // Split into two halves for comparison
  const mid = Math.ceil(members.length / 2);
  const groupA = members.slice(0, mid);
  const groupB = members.slice(mid);
  if (groupB.length === 0) return [];

  return detectTensionsBetweenGroups(groupA, groupB, config);
};

// ── Orchestrator ────────────────────────────────────────────────────────────────

export const performTensionAnalysis = async (
  participants: ParticipantAnalysis[],
  inputs: ParticipantInput[],
  summary: string,
  clusters: ClusterData[],
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<TensionAnalysis> => {
  onProgress?.('Tension mapping: sampling cluster representatives...');

  const clusterReps = sampleClusterRepresentatives(participants, inputs, clusters);
  const clusterIds = [...clusterReps.keys()].sort();
  const allTensionPairs: Array<Omit<TensionPair, 'summaryHandling' | 'summaryEvidence'>> = [];

  if (clusterIds.length < 2) {
    // Single cluster (or very small dataset): look for intra-cluster tensions.
    // Disagreements exist within groups too — not just across cluster boundaries.
    onProgress?.('Tension mapping: single cluster detected, scanning for within-group tensions...');

    for (const cid of clusterIds) {
      const members = clusterReps.get(cid) || [];
      if (members.length < 2) continue;

      // For a single cluster, use more representatives to maximise coverage
      const allMembers = participants
        .filter(p => p.clusterId === cid)
        .slice(0, 8)
        .map(m => ({
          id: m.id,
          text: (inputs.find(i => i.id === m.id)?.text || m.originalText).slice(0, 500),
          clusterId: m.clusterId,
        }));

      const tensions = await detectIntraClusterTensions(
        allMembers.length >= 2 ? allMembers : members,
        config
      );
      allTensionPairs.push(...tensions);
    }
  } else {
    // Multiple clusters: compare cross-cluster pairs (C(n,2) comparisons)
    let comparisons = 0;
    const totalComparisons = clusterIds.length * (clusterIds.length - 1) / 2;

    for (let i = 0; i < clusterIds.length; i++) {
      for (let j = i + 1; j < clusterIds.length; j++) {
        if (allTensionPairs.length >= MAX_TENSION_PAIRS) break;
        comparisons++;
        onProgress?.(`Tension mapping: comparing cluster ${i + 1} vs ${j + 1} (${comparisons}/${totalComparisons})`);

        const groupA = clusterReps.get(clusterIds[i]) || [];
        const groupB = clusterReps.get(clusterIds[j]) || [];
        if (groupA.length === 0 || groupB.length === 0) continue;

        const tensions = await detectTensionsBetweenGroups(groupA, groupB, config);
        allTensionPairs.push(...tensions);
      }
      if (allTensionPairs.length >= MAX_TENSION_PAIRS) break;
    }

    // Also check intra-cluster tensions for the largest clusters (tensions
    // within a group are often the most subtle and important to surface)
    if (allTensionPairs.length < MAX_TENSION_PAIRS) {
      const largestClusters = clusterIds
        .map(cid => ({ cid, size: (clusterReps.get(cid) || []).length }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 2); // Top 2 largest clusters

      for (const { cid } of largestClusters) {
        if (allTensionPairs.length >= MAX_TENSION_PAIRS) break;
        const members = clusterReps.get(cid) || [];
        if (members.length < 3) continue; // Need at least 3 for meaningful intra-cluster split

        onProgress?.(`Tension mapping: checking within-cluster tensions for cluster ${cid + 1}...`);
        const tensions = await detectIntraClusterTensions(members, config);
        allTensionPairs.push(...tensions);
      }
    }
  }

  // Classify how summary handles each tension (batched LLM call)
  onProgress?.(`Tension mapping: classifying ${allTensionPairs.length} tensions...`);
  const classifiedPairs = await classifyTensionHandlingBatch(
    allTensionPairs.slice(0, MAX_TENSION_PAIRS),
    summary,
    config
  );

  const acknowledgedCount = classifiedPairs.filter(p => p.summaryHandling === 'acknowledged').length;
  const suppressedCount = classifiedPairs.filter(p => p.summaryHandling === 'suppressed').length;
  const mergedCount = classifiedPairs.filter(p => p.summaryHandling === 'merged').length;
  const distortedCount = classifiedPairs.filter(p => p.summaryHandling === 'distorted').length;
  const total = classifiedPairs.length || 1;

  const clusterTensions = aggregateClusterTensions(classifiedPairs, clusters);

  onProgress?.(`Tension analysis complete: ${classifiedPairs.length} tensions found`);

  return {
    pairs: classifiedPairs,
    tensionFidelityScore: acknowledgedCount / total,
    acknowledgedCount,
    suppressedCount,
    mergedCount,
    distortedCount,
    clusterTensions,
  };
};
