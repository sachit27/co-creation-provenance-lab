import React, { useState } from 'react';
import { FeedbackLabel, ParticipantFeedback } from '../../types';

interface FeedbackPanelProps {
  participantId: string;
  currentFeedback?: ParticipantFeedback;
  onSubmit: (feedback: ParticipantFeedback) => void;
}

const feedbackOptions: Array<{
  label: FeedbackLabel;
  icon: string;
  text: string;
  description: string;
  color: string;
}> = [
  {
    label: 'accurate',
    icon: '✓',
    text: 'Accurate',
    description: 'The summary accurately represents my input',
    color: 'green'
  },
  {
    label: 'missed',
    icon: '○',
    text: 'Missed',
    description: 'Important points from my input were omitted',
    color: 'amber'
  },
  {
    label: 'distorted',
    icon: '✗',
    text: 'Distorted',
    description: 'The summary misrepresents my input',
    color: 'red'
  }
];

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  participantId,
  currentFeedback,
  onSubmit
}) => {
  const [selectedLabel, setSelectedLabel] = useState<FeedbackLabel | null>(
    currentFeedback?.label || null
  );
  const [comment, setComment] = useState(currentFeedback?.comment || '');
  const [showComment, setShowComment] = useState(!!currentFeedback?.comment);
  const [isSubmitted, setIsSubmitted] = useState(!!currentFeedback);

  const handleSubmit = (label: FeedbackLabel) => {
    setSelectedLabel(label);
    setIsSubmitted(true);

    const feedback: ParticipantFeedback = {
      participantId,
      label,
      comment: comment.trim() || undefined,
      timestamp: Date.now()
    };

    onSubmit(feedback);
  };

  const handleReset = () => {
    setSelectedLabel(null);
    setComment('');
    setIsSubmitted(false);
    setShowComment(false);
  };

  const getButtonClasses = (option: typeof feedbackOptions[0]) => {
    const baseClasses = 'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border';

    if (selectedLabel === option.label) {
      const selectedColors = {
        green: 'bg-green-100 border-green-500 text-green-800',
        amber: 'bg-amber-100 border-amber-500 text-amber-800',
        red: 'bg-red-100 border-red-500 text-red-800'
      };
      return `${baseClasses} ${selectedColors[option.color as keyof typeof selectedColors]}`;
    }

    return `${baseClasses} border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50`;
  };

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Ground Truth Validation
        </div>
        {isSubmitted && (
          <button
            onClick={handleReset}
            className="text-[10px] text-blue-600 hover:text-blue-800"
          >
            Change
          </button>
        )}
      </div>

      <div className="text-xs text-slate-600 mb-3">
        How well does the summary represent this input?
      </div>

      <div className="flex gap-2 mb-3">
        {feedbackOptions.map((option) => (
          <button
            key={option.label}
            onClick={() => !isSubmitted && handleSubmit(option.label)}
            disabled={isSubmitted}
            className={getButtonClasses(option)}
            title={option.description}
          >
            <span>{option.icon}</span>
            <span>{option.text}</span>
          </button>
        ))}
      </div>

      {/* Comment toggle */}
      {!isSubmitted && (
        <button
          onClick={() => setShowComment(!showComment)}
          className="text-[10px] text-slate-500 hover:text-slate-700 mb-2"
        >
          {showComment ? '− Hide comment' : '+ Add comment'}
        </button>
      )}

      {/* Comment input */}
      {(showComment || currentFeedback?.comment) && (
        <div className="mt-2">
          {isSubmitted ? (
            currentFeedback?.comment && (
              <div className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-100 italic">
                "{currentFeedback.comment}"
              </div>
            )
          ) : (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional: Explain what was missed or distorted..."
              className="w-full h-16 text-xs p-2 border border-slate-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          )}
        </div>
      )}

      {/* Submitted confirmation */}
      {isSubmitted && (
        <div className="mt-2 text-[10px] text-green-600 flex items-center gap-1">
          <span>✓</span>
          <span>Feedback recorded</span>
          {currentFeedback?.timestamp && (
            <span className="text-slate-400 ml-2">
              {new Date(currentFeedback.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Feedback summary component for aggregate view
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
        <span className="text-amber-600">○ {counts.missed} missed</span>
        <span className="text-red-600">✗ {counts.distorted} distorted</span>
      </div>
    </div>
  );
};

export default FeedbackPanel;
