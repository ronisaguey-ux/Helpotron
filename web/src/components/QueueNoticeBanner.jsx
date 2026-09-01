import { useEffect, useState } from 'react';
import { QUEUE_MESSAGE } from '../api.js';

// Memory-budget notice (08-31, operator): while the API's 10G RAM budget is
// consumed, new requests are answered "Task is in Queue, will be completed
// momentarily" and retried automatically — this banner surfaces that state.
// api.js dispatches helpotron:queue / helpotron:queue-clear around the retry.
export default function QueueNoticeBanner() {
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    const show = () => setQueued(true);
    const clear = () => setQueued(false);
    window.addEventListener('helpotron:queue', show);
    window.addEventListener('helpotron:queue-clear', clear);
    return () => {
      window.removeEventListener('helpotron:queue', show);
      window.removeEventListener('helpotron:queue-clear', clear);
    };
  }, []);
  if (!queued) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-6 py-2 text-xs flex items-center gap-2"
    >
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400/90 animate-pulse" aria-hidden="true" />
      <span>
        <strong>{QUEUE_MESSAGE}</strong> Your request will finish automatically as soon as memory frees up.
      </span>
    </div>
  );
}
