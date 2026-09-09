import React from 'react';
import { ParticipantFeedback } from '../../types';

// Aggregate summary for independently collected participant responses.
interface FeedbackSummaryProps {
  feedbacks: Map<string, ParticipantFeedback>;
  totalParticipants: number;
}

export const FeedbackSummary: React.FC<FeedbackSummaryProps> = ({
  feedbacks,
  totalParticipants
}) => {
  const counts = {
    accurate: 0,
    partial: 0,
    missed: 0,
    distorted: 0
  };

  feedbacks.forEach(f => counts[f.label]++);
  const totalFeedback = feedbacks.size;

  if (totalFeedback === 0) {
    return (
      <div className="text-xs text-slate-400 italic">
        No feedback collected yet. Click on participants to provide validation.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">
          {totalFeedback}/{totalParticipants} validated
        </span>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden flex">
          {counts.accurate > 0 && (
            <div
              className="bg-green-500 h-full"
              style={{ width: `${(counts.accurate / totalFeedback) * 100}%` }}
            />
          )}
          {counts.missed > 0 && (
            <div
              className="bg-amber-500 h-full"
              style={{ width: `${(counts.missed / totalFeedback) * 100}%` }}
            />
          )}
          {counts.partial > 0 && (
            <div
              className="bg-blue-500 h-full"
              style={{ width: `${(counts.partial / totalFeedback) * 100}%` }}
            />
          )}
          {counts.distorted > 0 && (
            <div
              className="bg-red-500 h-full"
              style={{ width: `${(counts.distorted / totalFeedback) * 100}%` }}
            />
          )}
        </div>
      </div>

      <div className="flex gap-4 text-[10px]">
        <span className="text-green-600">✓ {counts.accurate} accurate</span>
        <span className="text-blue-600">≈ {counts.partial} partial</span>
        <span className="text-amber-600">○ {counts.missed} missed</span>
        <span className="text-red-600">✗ {counts.distorted} distorted</span>
      </div>
    </div>
  );
};
