export type LiveSessionStatus = 'waiting' | 'open' | 'closed' | 'published';

/** Poll quickly while a workshop is active, but spare battery and server load when idle. */
export const livePollingDelay = (
  visibility: DocumentVisibilityState,
  status?: LiveSessionStatus,
  feedbackSubmitted = false,
) => {
  if (visibility !== 'visible') return 15_000;
  if (status === 'published' && feedbackSubmitted) return 12_000;
  return 2_000;
};
