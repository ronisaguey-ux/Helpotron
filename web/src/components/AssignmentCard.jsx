import React from 'react';
import {
  Download,
  ArrowUpRight,
  Sparkles,
  MessageSquare,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import StatusChip from './StatusChip';
import DueChip from './DueChip';

function getActionLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('pending') || s.includes('review')) return 'Review Now';
  if (s.includes('humaniz') || s.includes('draft')) return 'View Draft';
  return 'Continue';
}

/**
 * AssignmentCard Component — Stitch Screen 3.4.1 Specification (§3.4.1 & §3.4.5)
 *
 * Variants:
 *  - in_progress / default: Glass panel, top chips row (StatusChip + DueChip),
 *    title, subject/code, download action, primary action button.
 *  - pending: Red/amber-bordered card (border-l-4 border-l-error), pending
 *    approval StatusChip, title, description, full-width "Review Now" button.
 *
 * Fully keyboard accessible (role="button", tabIndex=0, Enter/Space support).
 */
export default function AssignmentCard({
  card,
  // Props can be passed either inside card object or as individual props:
  id,
  title,
  name,
  subject,
  course,
  class_code,
  dueDate,
  due_date,
  status = 'not_started',
  description,
  variant = 'default', // 'default' | 'pending' | 'in_progress'
  onSelect = () => {},
  onExport = null,
  onLaunchToDoc = null,
  onChat = null,
  exporting = false,
  className = '',
}) {
  // Extract normalized fields from card or props
  const item = card || {};
  const cardId = item.id ?? id;
  const cardTitle = (item.name || item.title || title || name || '').trim() || `Assignment #${cardId ?? '?'}`;
  const cardSubject = item.subject || subject || item.course || course || '';
  const cardClassCode = item.class_code || class_code || '';
  const cardDueDate = item.due_date ?? item.dueDate ?? dueDate ?? due_date;
  const cardStatus = item.status || status || 'not_started';
  const cardDesc = item.description || description || '';

  const s = String(cardStatus).toLowerCase();
  const isPending = variant === 'pending' || s.includes('pending') || s.includes('review');

  const handleCardClick = () => {
    onSelect(item.id != null ? item : { id: cardId, name: cardTitle, subject: cardSubject, class_code: cardClassCode, status: cardStatus });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  // PENDING APPROVAL VARIANT
  if (isPending) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        aria-label={`Pending Approval: ${cardTitle}`}
        className={`group relative flex flex-col justify-between p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-sem-amber/30 border-l-4 border-l-error shadow-sm hover:border-sem-amber/60 hover:shadow-md transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      >
        <div className="flex flex-col gap-3">
          {/* Status & Due Chips Row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <StatusChip status={cardStatus} size="compact" />
            <DueChip dueDate={cardDueDate} status={cardStatus} size="compact" />
          </div>

          {/* Title */}
          <h4
            className="font-title-md text-title-md font-semibold text-on-surface group-hover:text-primary transition-colors line-clamp-2 leading-snug"
            title={cardTitle}
          >
            {cardTitle}
          </h4>

          {/* Description / Instruction */}
          <p className="font-body-sm text-xs text-on-surface-variant line-clamp-2">
            {cardDesc || 'Requires operator validation or constraints verification prior to execution.'}
          </p>
        </div>

        {/* Action Row */}
        <div className="mt-4 pt-3 border-t border-outline-variant/15 flex items-center justify-between gap-2">
          {onExport && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExport(cardId, e);
              }}
              disabled={exporting}
              aria-label="Export assignment"
              className="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleCardClick}
            className="w-full h-11 px-4 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-on-primary font-label-caps text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
          >
            <span>Review Now</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // DEFAULT / IN-PROGRESS VARIANT
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      aria-label={`Assignment: ${cardTitle}`}
      className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/20 hover:border-outline-variant/50 hover:shadow-md transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {/* Left: Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Badges Row */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <StatusChip status={cardStatus} size="compact" />
          <DueChip dueDate={cardDueDate} status={cardStatus} size="compact" />
          {(cardSubject || cardClassCode) && (
            <span className="font-code-sm text-[11px] text-on-surface-variant bg-surface-container-high/60 px-2 py-0.5 rounded-md truncate max-w-[200px]">
              {[cardSubject, cardClassCode].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        {/* Title */}
        <h4
          className="font-title-md text-title-md font-semibold text-on-surface group-hover:text-primary transition-colors truncate"
          title={cardTitle}
        >
          {cardTitle}
        </h4>

        {/* Description snippet if present */}
        {cardDesc && (
          <p className="font-body-sm text-xs text-on-surface-variant/80 truncate">
            {cardDesc}
          </p>
        )}
      </div>

      {/* Right: Actions Row (44px min tap targets) */}
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {onLaunchToDoc && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLaunchToDoc(e);
            }}
            aria-label={`Launch ${cardTitle} to Google Doc`}
            title="Launch to Google Doc (Assistive Typing)"
            className="h-11 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-secondary hover:text-secondary-fixed transition-colors flex items-center gap-1.5 font-label-caps text-xs uppercase tracking-wider cursor-pointer border border-secondary/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Doc</span>
          </button>
        )}

        {onChat && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChat(e);
            }}
            aria-label={`Chat about ${cardTitle}`}
            title="Chat with Agent"
            className="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        )}

        {onExport && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExport(cardId, e);
            }}
            disabled={exporting}
            aria-label={`Export ${cardTitle}`}
            title="Export Assignment Data"
            className="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={handleCardClick}
          className="h-11 px-5 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-on-primary font-label-caps text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
        >
          <span>{getActionLabel(cardStatus)}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
