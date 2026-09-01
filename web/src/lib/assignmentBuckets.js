/* Status → lifecycle bucket (09-01, Bob): the assignments cards payload does
 * not always carry a bucket field, and statuses arrive in several spellings
 * ("Not Started" vs "not_started", "ready for review", …). Mirror the server's
 * mapping right here so the dashboard sections, the detail-view picker and
 * the history view can never disagree about which bucket a card belongs to.
 *
 * Reserved 'unknown' → callers should map to 'pending' (a card with an
 * unrecognized status must never silently drop out of the dashboard). */
const BUCKET_STATUSES = Object.freeze({
  pending: ['pending', 'pending_approval', 'pending approval', 'not_started', 'not started', 'tracked'],
  in_progress: ['in_progress', 'in progress', 'paused', 'humanizing', 'ready for review'],
  completed: ['completed', 'submitted', 'graded', 'done'],
  archived: ['archived'],
});

export function getAssignmentBucket(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return 'unknown';
  for (const [bucket, values] of Object.entries(BUCKET_STATUSES)) {
    if (values.includes(s)) return bucket;
  }
  return 'unknown';
}

/* Section order + labels for the subject bubble dashboard (09-01):
 * Completed → In Progress → Pending for Approval; archived never renders as
 * cards in the bubble — it gets its own pointer section to History. */
export const BUBBLE_SECTIONS = Object.freeze([
  { bucket: 'completed', label: 'Completed' },
  { bucket: 'in_progress', label: 'In Progress' },
  { bucket: 'pending', label: 'Pending for Approval' },
]);
