/**
 * Provenance Sankey Flow Data Builder
 *
 * Assembles the three-column Sankey data model:
 *   [Participant Inputs] → [Semantic Themes] → [Summary Sentences]
 *
 * Draws from existing analysis results — no additional LLM calls needed.
 * Aggregates participants by cluster for scalability at large N.
 */

import { AnalysisResult, ParticipantInput, SankeyData, SankeyNode, SankeyLink, TransformationType, ClusterData, KnowledgeGraph } from '../types';

// ── Aggregation Level Selection ─────────────────────────────────────────────────

const selectAggregationLevel = (count: number): SankeyData['aggregationLevel'] => {
  if (count <= 40) return 'individual';
  if (count <= 200) return 'cluster';
  return 'super-cluster';
};

// ── Theme Extraction ────────────────────────────────────────────────────────────

/**
 * Extract themes using GraphRAG community labels when available.
 * Falls back to RAKE keyword aggregation when knowledge graph is unavailable.
 *
 * When GraphRAG communities exist, each K-Means cluster's theme label is derived
 * from the knowledge graph community with highest Jaccard overlap. A "used"
 * set prevents multiple clusters from claiming the same community label.
 */
const extractThemesFromClusters = (
  result: AnalysisResult
): Array<{ id: string; label: string; clusterId: number; participantCount: number }> => {
  const themes: Array<{ id: string; label: string; clusterId: number; participantCount: number }> = [];
  const kg = result.knowledgeGraph;

  // Track which community IDs have been used so no two clusters get the same label
  const usedCommunityIds = new Set<number>();

  for (const cluster of result.clusters) {
    const members = result.participants.filter(p => p.clusterId === cluster.id);
    let label: string;

    if (kg && kg.communities.length > 0) {
      const clusterPids = new Set(members.map(m => m.id));

      // Find best community by Jaccard similarity (intersection / union),
      // skipping communities already assigned to another cluster
      let bestCommunity: typeof kg.communities[0] | null = null;
      let bestJaccard = 0;

      for (const community of kg.communities) {
        if (usedCommunityIds.has(community.id)) continue;
        const intersection = community.participantIds.filter(pid => clusterPids.has(pid)).length;
        if (intersection === 0) continue;
        const union = new Set([...community.participantIds, ...clusterPids]).size;
        const jaccard = intersection / union;
        if (jaccard > bestJaccard) {
          bestJaccard = jaccard;
          bestCommunity = community;
        }
      }

      if (bestCommunity && bestJaccard > 0) {
        // Use only the first 2 entity names for a cleaner Sankey label
        label = bestCommunity.label.split(',').slice(0, 2).map(s => s.trim()).join(', ');
        usedCommunityIds.add(bestCommunity.id);
      } else {
        // Fallback: top entities from cluster members
        const clusterEntities = kg.entities
          .filter(e => e.sourceParticipants.some(pid => clusterPids.has(pid)))
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 2);
        label = clusterEntities.length > 0
          ? clusterEntities.map(e => e.name).join(', ')
          : cluster.label;
      }
    } else {
      // Fallback: RAKE keyword aggregation (original approach)
      const keywordFreq: Record<string, number> = {};
      for (const m of members) {
        for (const kw of m.keywords.slice(0, 5)) {
          keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
        }
      }
      const topKeywords = Object.entries(keywordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);

      label = topKeywords.length > 0 ? topKeywords.join(', ') : cluster.label;
    }

    themes.push({
      id: `theme-${cluster.id}`,
      label,
      clusterId: cluster.id,
      participantCount: members.length,
    });
  }

  return themes;
};

// ── Main Builder ────────────────────────────────────────────────────────────────

export const buildSankeyData = (
  result: AnalysisResult,
  inputs: ParticipantInput[]
): SankeyData => {
  const aggregationLevel = selectAggregationLevel(result.participants.length);
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // ── Column 1: Input nodes ──────────────────────────────────────────────────

  if (aggregationLevel === 'individual') {
    for (const p of result.participants) {
      const input = inputs.find(i => i.id === p.id);
      nodes.push({
        id: `input-${p.id}`,
        column: 'input',
        label: p.id,
        value: 1,
        clusterId: p.clusterId,
        color: result.clusters.find(c => c.id === p.clusterId)?.color || '#64748b',
      });
    }
  } else {
    // Aggregate by cluster
    for (const cluster of result.clusters) {
      const members = result.participants.filter(p => p.clusterId === cluster.id);
      if (members.length === 0) continue;
      nodes.push({
        id: `input-cluster-${cluster.id}`,
        column: 'input',
        label: `${cluster.label} (${members.length})`,
        value: members.length,
        clusterId: cluster.id,
        color: cluster.color,
      });
    }
  }

  // ── Column 2: Theme nodes ─────────────────────────────────────────────────

  const themes = extractThemesFromClusters(result);
  for (const theme of themes) {
    nodes.push({
      id: theme.id,
      column: 'theme',
      label: theme.label,
      value: theme.participantCount,
      clusterId: theme.clusterId,
      color: result.clusters.find(c => c.id === theme.clusterId)?.color || '#64748b',
    });
  }

  // ── Column 3: Summary sentence nodes ──────────────────────────────────────

  // Pre-count how many participants connect to each sentence via sentenceMatches
  // (same logic used for building theme→summary links below, ensuring consistency)
  const sentenceConnectionCounts: Record<number, number> = {};
  for (const p of result.participants) {
    const matches = p.sentenceMatches.filter(m => m.similarity >= 0.3).slice(0, 3);
    if (matches.length === 0 && p.topSentenceMatchIndex >= 0) {
      matches.push({ sentenceIndex: p.topSentenceMatchIndex, similarity: 0.5 });
    }
    for (const match of matches) {
      sentenceConnectionCounts[match.sentenceIndex] = (sentenceConnectionCounts[match.sentenceIndex] || 0) + 1;
    }
  }

  for (let si = 0; si < result.summarySentences.length; si++) {
    const sentence = result.summarySentences[si];
    // Color by epistemic class if available
    const fidelitySentence = result.languageFidelity?.sentences.find(s => s.sentenceIndex === si);
    let color = '#64748b';
    if (fidelitySentence?.epistemicClass === 'explicit') color = '#059669';
    else if (fidelitySentence?.epistemicClass === 'inferred') color = '#2563eb';
    else if (fidelitySentence?.epistemicClass === 'extrapolated') color = '#d97706';
    else if (fidelitySentence?.epistemicClass === 'speculative') color = '#7c3aed';

    // Use connection count consistent with actual link values
    const matchedCount = sentenceConnectionCounts[si] || 0;

    nodes.push({
      id: `summary-${si}`,
      column: 'summary',
      label: sentence.length > 80 ? sentence.slice(0, 77) + '...' : sentence,
      value: Math.max(1, matchedCount),
      color,
    });
  }

  // ── Links: Input → Theme ──────────────────────────────────────────────────

  if (aggregationLevel === 'individual') {
    for (const p of result.participants) {
      const themeId = `theme-${p.clusterId}`;
      links.push({
        source: `input-${p.id}`,
        target: themeId,
        value: 1,
      });
    }
  } else {
    for (const cluster of result.clusters) {
      const members = result.participants.filter(p => p.clusterId === cluster.id);
      if (members.length === 0) continue;
      links.push({
        source: `input-cluster-${cluster.id}`,
        target: `theme-${cluster.id}`,
        value: members.length,
      });
    }
  }

  // ── Links: Theme → Summary ────────────────────────────────────────────────

  // Build from participant-sentence matches
  const themeSentenceFlow: Record<string, Record<string, { value: number; types: TransformationType[] }>> = {};

  for (const p of result.participants) {
    const themeId = `theme-${p.clusterId}`;
    // Use top match and any strong secondary matches
    const matches = p.sentenceMatches.filter(m => m.similarity >= 0.3).slice(0, 3);
    if (matches.length === 0 && p.topSentenceMatchIndex >= 0) {
      matches.push({ sentenceIndex: p.topSentenceMatchIndex, similarity: 0.5 });
    }

    for (const match of matches) {
      const summaryId = `summary-${match.sentenceIndex}`;
      if (!themeSentenceFlow[themeId]) themeSentenceFlow[themeId] = {};
      if (!themeSentenceFlow[themeId][summaryId]) {
        themeSentenceFlow[themeId][summaryId] = { value: 0, types: [] };
      }
      themeSentenceFlow[themeId][summaryId].value++;

      // Get transformation type from language fidelity if available
      if (result.languageFidelity) {
        const sentFidelity = result.languageFidelity.sentences.find(s => s.sentenceIndex === match.sentenceIndex);
        const mapping = sentFidelity?.mappings.find(m => m.participantId === p.id);
        if (mapping) {
          themeSentenceFlow[themeId][summaryId].types.push(mapping.type);
        }
      }
    }
  }

  for (const [themeId, targets] of Object.entries(themeSentenceFlow)) {
    for (const [summaryId, data] of Object.entries(targets)) {
      // Determine dominant transformation type
      const typeCounts: Record<TransformationType, number> = {
        preserved: 0, softened: 0, sanitized: 0, abstracted: 0, dropped: 0,
      };
      for (const t of data.types) typeCounts[t]++;
      const dominantType = data.types.length > 0
        ? (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0] as TransformationType)
        : undefined;

      links.push({
        source: themeId,
        target: summaryId,
        value: data.value,
        transformationType: dominantType,
      });
    }
  }

  // ── Detect orphan themes (no outgoing links to summary) ───────────────────

  const themesWithOutgoing = new Set(
    links.filter(l => l.source.startsWith('theme-') && l.target.startsWith('summary-')).map(l => l.source)
  );
  for (const theme of themes) {
    if (!themesWithOutgoing.has(theme.id)) {
      // Mark as orphan — this theme's content was dropped from the summary
      const node = nodes.find(n => n.id === theme.id);
      if (node) {
        links.push({
          source: theme.id,
          target: theme.id, // self-loop marker for orphan
          value: theme.participantCount,
          isOrphan: true,
          transformationType: 'dropped',
        });
      }
    }
  }

  // ── Detect phantom summary sentences (no incoming from any theme) ─────────

  const summariesWithIncoming = new Set(
    links.filter(l => l.target.startsWith('summary-') && !l.isOrphan).map(l => l.target)
  );
  for (let si = 0; si < result.summarySentences.length; si++) {
    const summaryId = `summary-${si}`;
    if (!summariesWithIncoming.has(summaryId)) {
      links.push({
        source: summaryId,
        target: summaryId, // self-loop marker for phantom
        value: 1,
        isPhantom: true,
      });
    }
  }

  return { nodes, links, aggregationLevel };
};
