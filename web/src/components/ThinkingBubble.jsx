import React, { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Sparkles, Square } from 'lucide-react';

/**
 * ThinkingBubble — the agent's live reasoning stream as a collapsible block.
 *
 * Collapsed by default: thinking is scratch work, and a wall of it distracts
 * from the answer. The user can pop it open to inspect the reasoning and fold
 * it away again. Kept mounted after the turn ends (see MyAgentView) so the
 * reasoning that produced a reply stays inspectable instead of vanishing the
 * moment the answer arrives.
 */
export default function ThinkingBubble({
  thought = '',
  isStreaming = false,
  onStop = null,
  tokens = null,
  defaultExpanded = false,
  className = '',
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!thought && !isStreaming) return null;

  return (
    <div
      className={`rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 overflow-hidden transition-all text-xs font-mono shadow-sm ${className}`}
    >
      {/* Header Bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-4 py-2.5 bg-surface-container/70 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-container transition-colors select-none"
        role="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse thinking' : 'Expand thinking'}
      >
        <div className="flex items-center gap-2 text-primary min-w-0">
          <Brain className={`w-4 h-4 shrink-0 ${isStreaming ? 'animate-pulse' : ''}`} />
          <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider truncate">
            {isStreaming ? 'Thinking…' : 'Thought process'}
          </span>
          {tokens != null && tokens > 0 && (
            <span className="font-code-sm text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">
              {tokens} tok
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isStreaming && onStop && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              className="px-2 py-1 rounded-md bg-error/15 text-error hover:bg-error/25 font-label-caps text-[10px] uppercase flex items-center gap-1 cursor-pointer"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Halt</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            aria-label={expanded ? 'Collapse thinking' : 'Expand thinking'}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Reasoning Thought Content */}
      {expanded && (
        <div className="p-4 bg-surface-container-lowest/70 max-h-64 overflow-y-auto font-code-sm text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap select-text">
          {thought || 'Thinking…'}
          {isStreaming && (
            <span className="inline-block w-2 h-3.5 bg-primary/70 animate-pulse ml-1 align-middle" />
          )}
        </div>
      )}
    </div>
  );
}
