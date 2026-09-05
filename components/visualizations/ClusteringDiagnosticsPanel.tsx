import React from 'react';
import type { ClusteringDiagnostics } from '../../types';

/** Internal screening evidence, including candidates rejected before selection. */
export const ClusteringDiagnosticsPanel: React.FC<{ diagnostics?: ClusteringDiagnostics }> = ({ diagnostics }) => {
  if (!diagnostics) return <p>No clustering diagnostics were saved with this result. Rerun the analysis to obtain them.</p>;
  const { candidateDiagnostics: candidates, thresholds } = diagnostics;
  const separationOperator = diagnostics.methodVersion === 'spherical-kmeans-stability-v4' ? '>' : '≥';
  const score = (value: number | null) => value !== null && Number.isFinite(value) ? value.toFixed(3) : 'Not checked';
  const reasons: Record<string, string> = {
    'minimum-cluster-size': 'Group size',
    silhouette: 'Separation',
    'nonpositive-separation': 'Non-positive separation',
    'subsample-stability': 'Resampling',
    'neighborhood-coherence': 'Neighbours',
    'method-sensitivity': 'Method agreement',
    'full-space-silhouette': 'Original-space separation',
    'insufficient-subsample-size': 'Insufficient resample size',
  };
  return <details className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
    <summary className="cursor-pointer font-semibold text-indigo-700">Clustering checks ({candidates.length} candidate partitions)</summary>
    <p className="mt-2">{diagnostics.sampleSize} records; {diagnostics.inputDimensions} embedding dimensions;
      {' '}{diagnostics.analysisDimensions} fitting dimensions. {diagnostics.projectionMethod === 'none'
        ? 'Fitted in the original embedding space.'
        : `Projected fitting space (distance correlation ${score(diagnostics.projectionDistanceCorrelation)}). Rejection in this space is not a test of every possible original-space partition.`}</p>
    <p className="mt-2">These are configured screening thresholds, not statistical significance tests or validation of social groups.
      Similar wording can express opposing positions. An unpartitioned map does not indicate agreement.</p>
    {candidates.length > 0 ? <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left tabular-nums">
        <caption className="sr-only">Candidate cluster counts and their internal checks. ARI means adjusted Rand agreement between two partitions.</caption>
        <thead className="border-b border-slate-200 text-slate-600"><tr>
          <th className="p-2">Groups</th>
          <th className="p-2">Smallest group<br />≥ {thresholds.minimumClusterSize}</th>
          <th className="p-2">Separation<br />{separationOperator} {thresholds.minimumSilhouette}</th>
          <th className="p-2">Original-space separation</th>
          <th className="p-2">Resampling ARI<br />≥ {thresholds.minimumStability}</th>
          <th className="p-2">Within-group neighbours<br />≥ {thresholds.minimumNeighborhoodAgreement}</th>
          <th className="p-2">Method ARI<br />≥ {thresholds.minimumMethodAgreement}</th>
          <th className="p-2">Checks below threshold</th>
        </tr></thead>
        <tbody>{candidates.map(candidate => <tr key={candidate.k} className="border-b border-slate-100">
          <td className="p-2">{candidate.k}{diagnostics.usableForDownstream && candidate.k === diagnostics.selectedK ? ' (selected)' : ''}</td>
          <td className="p-2">{candidate.minimumClusterSize}</td>
          <td className="p-2">{score(candidate.silhouette)}</td>
          <td className="p-2">{score(candidate.fullSpaceSilhouette)}</td>
          <td className="p-2">{score(candidate.subsampleStability)}{candidate.stabilitySampleSize !== undefined && <span className="block text-slate-500">n={candidate.stabilitySampleSize}</span>}</td>
          <td className="p-2">{score(candidate.neighborhoodAgreement)}</td>
          <td className="p-2">{score(candidate.methodAgreement)}</td>
          <td className="p-2">{candidate.rejectionReasons.map(reason => reasons[reason] || reason).join(', ') || 'None'}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="mt-2">{diagnostics.reason}</p>}
    <p className="mt-2 text-slate-500">Separation uses cosine silhouette. Resampling compares the full fit with subsets of records.
      Method agreement compares spherical k-means with cosine average linkage at the same group count.
      Saved method: {diagnostics.methodVersion}.</p>
  </details>;
};
