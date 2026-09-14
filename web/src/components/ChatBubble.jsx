import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Bot, User, AlertCircle, RefreshCw, Sparkles, CheckCircle2, Clock } from 'lucide-react';

/**
 * ChatBubble Component — LUMINOUS GLASS Shared Chat Primitive (§3.5.5 & §3.6.1)
 *
 * Variants:
 *  - 'user': User message
 *  - 'agent' | 'assistant' | 'overlord': Agent response with avatar and markdown-ready formatting
 *  - 'error': Error bubble with red container and Retry button
 *  - 'event' | 'system': System notification pill with true semantic chips
 */
export default function ChatBubble({
  message,
  onRetry = null,
  className = '',
}) {
  if (!message) return null;

  const sender = String(message.sender || message.role || 'agent').toLowerCase();
  const isUser = sender === 'user';
  const isError = sender === 'error' || !!message.isError;
  const isEvent = sender === 'system' || sender === 'event';

  const text = message.text || message.content || '';
  const timestamp = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  // 1. EVENT / SYSTEM PILL
  if (isEvent) {
    const isSuccess = text.includes('complete') || text.includes('done') || text.includes('finish');
    const isDue = text.includes('due') || text.includes('deadline');

    return (
      <div className={`flex justify-center my-2 ${className}`}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high/80 border border-outline-variant/30 text-xs font-code-sm text-on-surface-variant shadow-sm">
          {isSuccess ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-sem-green shrink-0" />
          ) : isDue ? (
            <Clock className="w-3.5 h-3.5 text-sem-amber shrink-0" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <span>{text}</span>
          {timestamp && <span className="text-[10px] text-outline ml-1">{timestamp}</span>}
        </div>
      </div>
    );
  }

  // 2. ERROR BUBBLE WITH RETRY
  if (isError) {
    return (
      <div className={`flex items-start gap-3 my-3 ${className}`}>
        <div className="w-8 h-8 rounded-xl bg-error/15 border border-error/30 text-error flex items-center justify-center shrink-0 shadow-sm">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 max-w-lg p-4 rounded-2xl bg-error-container/20 border border-error/30 text-error flex flex-col gap-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-label-caps text-[10px] font-semibold uppercase tracking-wider">
              INFERENCE FAILURE
            </span>
            {timestamp && <span className="font-code-sm text-[10px] opacity-75">{timestamp}</span>}
          </div>
          <p className="font-body-sm text-xs break-words">{text}</p>
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="self-start h-8 px-3 rounded-lg bg-error text-on-error font-label-caps text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all hover:opacity-90 cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry Message</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. USER BUBBLE
  if (isUser) {
    return (
      <div className={`flex justify-end my-3 ${className}`}>
        <div className="flex flex-col items-end max-w-[80%] sm:max-w-md gap-1">
          <div className="p-4 rounded-2xl rounded-br-sm bg-primary text-on-primary font-body-sm text-xs leading-relaxed shadow-sm break-words select-text">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {text}
            </ReactMarkdown>
          </div>
          {timestamp && (
            <span className="font-code-sm text-[10px] text-on-surface-variant/70 px-1">
              {timestamp}
            </span>
          )}
        </div>
      </div>
    );
  }

  // 4. AGENT BUBBLE
  return (
    <div className={`flex items-start gap-3 my-3 ${className}`}>
      <div className="w-8 h-8 rounded-xl bg-secondary/15 border border-secondary/30 text-secondary flex items-center justify-center shrink-0 shadow-sm">
        <Bot className="w-4 h-4 stroke-[1.75]" />
      </div>
      <div className="flex flex-col max-w-[85%] sm:max-w-xl gap-1">
        <div className="p-4 rounded-2xl rounded-tl-sm bg-surface-container-low border border-outline-variant/20 text-on-surface font-body-sm text-xs leading-relaxed shadow-sm break-words select-text">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {text}
          </ReactMarkdown>
        </div>
        {timestamp && (
          <span className="font-code-sm text-[10px] text-on-surface-variant px-1">
            Agent · {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}
