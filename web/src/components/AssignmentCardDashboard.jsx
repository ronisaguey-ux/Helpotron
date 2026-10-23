import React, { useState, useEffect, useMemo, useRef } from 'react';
import Button from './Button';
import LaunchToDocModal from './LaunchToDocModal';
import NewAssignmentModal from './NewAssignmentModal';
import SubjectTile from './SubjectTile';
import SubjectSettingsPanel from './SubjectSettingsPanel';
import CreateSubjectDialog from './CreateSubjectDialog';
import SubjectDumpModal from './SubjectDumpModal';
import AssignmentCard from './AssignmentCard';
import api from '../api';
import { normalizeCards } from '../lib/assignmentEvents';
import { getAssignmentBucket } from '../lib/assignmentBuckets.js';
import { loadSettings } from '../lib/settings.js';
import { useScopedMap, overriddenPathsAt } from '../lib/scopedSettings.js';
import {
  Plus,
  Download,
  RefreshCw,
  Archive,
  AlertTriangle,
  ArrowRight,
  SlidersHorizontal,
  Trash2,
  CheckCircle2,
  History,
  BookOpen,
  Orbit,
  Upload,
  ChevronLeft,
} from 'lucide-react';

const DEFAULT_SUBJECT_BUBBLES = [
  { id: 'subj_math', title: 'Mathematics', description: 'Calculus, linear algebra, statistics & formal proofs', color: 'blue', icon: 'Ruler' },
  { id: 'subj_english', title: 'English & Literature', description: 'Literary analysis, rhetorical essays & close reading', color: 'purple', icon: 'BookOpen' },
  { id: 'subj_history', title: 'History & Social Studies', description: 'Historiography, primary source evaluation & analysis', color: 'amber', icon: 'Landmark' },
  { id: 'subj_cs', title: 'Computer Science', description: 'Algorithms, data structures & software engineering', color: 'green', icon: 'Code2' },
  { id: 'subj_biology', title: 'Biology & Life Sciences', description: 'Genetics, cellular biology & lab investigations', color: 'cyan', icon: 'Dna' },
  { id: 'subj_psychology', title: 'Psychology & Cognitive Sciences', description: 'Empirical research, cognitive neuroscience & case studies', color: 'indigo', icon: 'Brain' },
];

/**
 * Deduplication partitioning algorithm (§3.4.1)
 * Guarantees every visible assignment card appears in EXACTLY ONE subject section.
 */
function partitionCardsBySubject(cards, bubbles) {
  const cardMap = new Map();
  bubbles.forEach((b) => cardMap.set(b.id, []));
  const unassigned = [];
  const assignedCardIds = new Set();

  // Pass 1: Exact matches by subject_id or bubble_id
  for (const card of cards) {
    if (!card || card.id == null) continue;
    const cardId = String(card.id);
    const targetBubble = bubbles.find(
      (b) => b.id === card.subject_id || b.id === card.bubble_id
    );
    if (targetBubble) {
      cardMap.get(targetBubble.id).push(card);
      assignedCardIds.add(cardId);
    }
  }

  // Pass 2: Direct name / class_code matching
  for (const card of cards) {
    if (!card || card.id == null) continue;
    const cardId = String(card.id);
    if (assignedCardIds.has(cardId)) continue;

    const cSubject = (card.subject || '').trim().toLowerCase();
    const cClass = (card.class_code || '').trim().toLowerCase();

    const targetBubble = bubbles.find((b) => {
      const bTitle = (b.title || '').trim().toLowerCase();
      return (
        (cSubject && cSubject.includes(bTitle)) ||
        (bTitle && bTitle.includes(cSubject)) ||
        (cClass && cClass.includes(bTitle))
      );
    });

    if (targetBubble) {
      cardMap.get(targetBubble.id).push(card);
      assignedCardIds.add(cardId);
    }
  }

  // Pass 3: Keyword heuristic classification
  for (const card of cards) {
    if (!card || card.id == null) continue;
    const cardId = String(card.id);
    if (assignedCardIds.has(cardId)) continue;

    const cName = `${card.subject || ''} ${card.class_code || ''}`.toLowerCase();
    const aTitle = (card.name || card.title || '').toLowerCase();
    const blob = `${cName} ${aTitle}`;

    const targetBubble = bubbles.find((b) => {
      const title = (b.title || '').toLowerCase();
      const desc = (b.description || '').toLowerCase();
      if (title.includes('math') && /math|calc|algebra|stat|geometry|integral/.test(blob)) return true;
      if (title.includes('english') && /eng|lit|writing|essay|novel|poem|rhetoric/.test(blob)) return true;
      if (title.includes('history') && /hist|social|gov|reconstruction|war|ancient|president|civics/.test(blob)) return true;
      if ((title.includes('computer') || title.includes('cs')) && /cs|code|comp|algorithm|neural|python|machine|software|react|git/.test(blob)) return true;
      if (title.includes('biology') && /bio|life|lab|genetic|cell|dna|crispr|organ/.test(blob)) return true;
      if (title.includes('psych') && /psych|cog|behav|bias|decision|brain|neuro/.test(blob)) return true;
      if (desc.length > 5 && blob.includes(desc.slice(0, 10))) return true;
      return false;
    });

    if (targetBubble) {
      cardMap.get(targetBubble.id).push(card);
      assignedCardIds.add(cardId);
    } else {
      unassigned.push(card);
    }
  }

  return { cardMap, unassigned };
}

export function AssignmentCardDashboard({
  userId = 'student_demo',
  isGuest = false,
  onSelectAssignment = null,
}) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  // Modals & Navigation state
  const [launchToDocAssignment, setLaunchToDocAssignment] = useState(null);
  const [turnedInIds, setTurnedInIds] = useState(() => new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);

  // Level-1 Settings disclosure
  const [openSettingsSubjectId, setOpenSettingsSubjectId] = useState(null);
  const [settingsVersion, setSettingsVersion] = useState(0);

  // Custom Bubbles
  const [customBubbles, setCustomBubbles] = useState([]);

  // Subject drill-in + dump-into-subject. `selectedSubjectId === null` is the
  // dashboard level (the bubble grid); anything else is that one subject open.
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [dumpTargetSubject, setDumpTargetSubject] = useState(null);

  // Notices
  const [exportNotice, setExportNotice] = useState('');
  const [bubbleExporting, setBubbleExporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const mountedRef = useRef(true);
  const fetchRequestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetchCustomBubbles();
  }, [userId, retryCount]);

  // Refetch when window regains focus (throttled to avoid visibilitychange + focus double-fire storm)
  useEffect(() => {
    let lastRefetch = 0;
    const refetch = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastRefetch > 1000) {
        lastRefetch = now;
        fetchDashboardData();
      }
    };
    document.addEventListener('visibilitychange', refetch);
    window.addEventListener('focus', refetch);
    return () => {
      document.removeEventListener('visibilitychange', refetch);
      window.removeEventListener('focus', refetch);
    };
  }, [userId]);

  // Re-fetch on assignment created event
  useEffect(() => {
    const handleCreated = () => fetchDashboardData();
    window.addEventListener('helpotron:assignment-created', handleCreated);
    return () => window.removeEventListener('helpotron:assignment-created', handleCreated);
  }, []);

  // Listen to settings update to re-render override badges
  useEffect(() => {
    const handleSettings = () => setSettingsVersion((v) => v + 1);
    window.addEventListener('helpotron:settings-updated', handleSettings);
    return () => window.removeEventListener('helpotron:settings-updated', handleSettings);
  }, []);

  async function fetchCustomBubbles() {
    try {
      const data = await api.getCustomBubbles();
      if (!mountedRef.current) return;
      if (data?.bubbles) {
        const seen = new Set();
        setCustomBubbles(
          data.bubbles.filter((b) => {
            if (!b || b.id == null) return false;
            if (seen.has(b.id)) return false;
            seen.add(b.id);
            return true;
          })
        );
      }
    } catch (e) {
      if (mountedRef.current) console.warn('Failed to load custom bubbles:', e);
    }
  }

  async function fetchDashboardData() {
    const reqId = ++fetchRequestIdRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setFetchError(null);
    }
    try {
      const [cardsData, turnedInRes] = await Promise.all([
        api.assignmentCards(),
        api.getTurnedInAssignments().catch(() => null),
      ]);

      if (!mountedRef.current || reqId !== fetchRequestIdRef.current) return;

      if (cardsData?.cards) {
        setCards(normalizeCards(cardsData.cards));
      } else if (Array.isArray(cardsData)) {
        setCards(normalizeCards(cardsData));
      } else {
        setCards([]);
      }

      setTurnedInIds(
        new Set(
          (turnedInRes?.history || [])
            .map((h) => h.id ?? h.assignment_id)
            .filter((id) => id != null)
            .map(String)
        )
      );
    } catch (err) {
      if (!mountedRef.current || reqId !== fetchRequestIdRef.current) return;
      console.error('Error loading dashboard data:', err);
      setFetchError(err?.message || 'Upstream telemetry service timed out.');
    } finally {
      if (mountedRef.current && reqId === fetchRequestIdRef.current) {
        setLoading(false);
        setRetrying(false);
      }
    }
  }

  const handleRetry = () => {
    setRetrying(true);
    setRetryCount((c) => c + 1);
  };

  const handleCreateSubject = async (newSubjectData) => {
    const res = await api.addCustomBubble(newSubjectData);
    if (res?.bubble) {
      setCustomBubbles((prev) => [...prev, res.bubble]);
      setExportNotice(`✅ Subject "${newSubjectData.title}" initialized.`);
      setTimeout(() => setExportNotice(''), 4000);
    }
  };

  const handleDeleteBubble = async (bubbleId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this custom subject?')) return;
    try {
      await api.deleteCustomBubble(bubbleId);
      setCustomBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
      if (openSettingsSubjectId === bubbleId) setOpenSettingsSubjectId(null);
    } catch (e) {
      alert('Could not delete this subject. Please check your connection and try again.');
    }
  };

  const handleExportAllData = async () => {
    setExportingAll(true);
    try {
      const data = await api.exportAllUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `helpotron_complete_user_export_${userId || 'student'}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('✅ Complete data archive exported successfully.');
      setTimeout(() => setExportNotice(''), 4000);
    } catch (e) {
      setExportNotice('❌ Failed to export data.');
      setTimeout(() => setExportNotice(''), 4000);
    } finally {
      setExportingAll(false);
    }
  };

  const handleExportBubble = async (title, e) => {
    if (e) e.stopPropagation();
    if (!title) return;
    setBubbleExporting(true);
    try {
      await api.exportAssignmentData({ bubble: title });
      setExportNotice(`✅ Export for ${title} complete.`);
      setTimeout(() => setExportNotice(''), 4000);
    } catch (e) {
      setExportNotice(
        `❌ Export failed — ${e && e.status === 404 ? 'nothing recorded for this subject yet.' : e.message || 'try again.'}`
      );
      setTimeout(() => setExportNotice(''), 5000);
    } finally {
      setBubbleExporting(false);
    }
  };

  const handleExportAssignment = async (assignmentId, e) => {
    if (e) e.stopPropagation();
    try {
      await api.exportAssignmentData({ assignment_id: assignmentId });
      setExportNotice(`✅ Assignment #${assignmentId} export downloaded.`);
      setTimeout(() => setExportNotice(''), 4000);
    } catch (err) {
      setExportNotice(`❌ Failed to export assignment: ${err.message || 'try again.'}`);
      setTimeout(() => setExportNotice(''), 4000);
    }
  };

  // Filter turned-in assignments (they live in history only)
  const visibleCards = useMemo(() => {
    return cards.filter((c) => c && c.id != null && !turnedInIds.has(String(c.id)));
  }, [cards, turnedInIds]);

  // Combine default subjects and custom bubbles
  const allSubjectBubbles = useMemo(() => {
    return [
      ...DEFAULT_SUBJECT_BUBBLES,
      ...customBubbles.map((b) => ({ ...b, is_custom: true })),
    ];
  }, [customBubbles]);

  // Partition cards to guarantee strict 1:1 subject binding with 0 duplicates
  const { cardMap, unassigned } = useMemo(() => {
    return partitionCardsBySubject(visibleCards, allSubjectBubbles);
  }, [visibleCards, allSubjectBubbles]);

  // All subject sections to render
  const finalSubjects = useMemo(() => {
    const list = [...allSubjectBubbles];
    if (unassigned.length > 0) {
      list.push({
        id: 'subj_other',
        title: 'General & Electives',
        description: 'Cross-disciplinary coursework and unassigned problem sets',
        icon: 'BookOpen',
        color: 'blue',
      });
    }
    return list;
  }, [allSubjectBubbles, unassigned.length]);

  // Read overrides count for a given subject
  // Overrides the SERVER actually resolves, matched on the subject NAME.
  //
  // The previous version read `settings.subject_configs[subjId]` — a localStorage
  // only, id-keyed store that no server code reads — so this indicator lit up for
  // legacy local junk and stayed dark for every real override. Overrides live in
  // `settings.scoped` on the server and are keyed by name, because that is what the
  // resolver gets in its context (`routes_overlord` passes the subject NAME).
  //
  // The map comes from the server (localStorage never receives it — see the header
  // of `lib/scopedSettings.js`), not from `loadSettings()`.
  const scopedMap = useScopedMap();
  const getSubjectOverridePaths = (subjectTitle) =>
    overriddenPathsAt(scopedMap, 'subject', subjectTitle);
  const getSubjectOverrideCount = (subjectTitle) => getSubjectOverridePaths(subjectTitle).length;

  // 1. FIRST-LOAD SKELETON STATE
  if (loading && cards.length === 0) {
    return (
      <div className="space-y-8 max-w-[1440px] mx-auto p-4 md:p-8 animate-pulse">
        {/* Header Shimmer */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-surface-container-high rounded-xl" />
            <div className="h-4 w-96 bg-surface-container rounded-lg" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-11 w-32 bg-surface-container-high rounded-xl" />
            <div className="h-11 w-11 bg-surface-container rounded-xl" />
          </div>
        </div>

        {/* 2-3 Section Shimmers */}
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/20 p-6 md:p-8 space-y-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-container-high" />
                <div className="space-y-2">
                  <div className="h-5 w-44 bg-surface-container-high rounded-lg" />
                  <div className="h-3.5 w-32 bg-surface-container rounded-md" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-10 w-36 bg-surface-container rounded-xl" />
                <div className="h-10 w-28 bg-surface-container rounded-xl" />
              </div>
            </div>
            {/* Tablet 3-col Grid Skeletons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-3">
                <div className="h-28 bg-surface-container-low rounded-2xl" />
                <div className="h-28 bg-surface-container-low rounded-2xl" />
              </div>
              <div className="md:col-span-1 space-y-3">
                <div className="h-44 bg-surface-container-low rounded-2xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 2. FETCH ERROR RECOVERY STATE (§7 Bug 5 rule: NEVER six fake-empty subjects)
  if (fetchError && cards.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto p-4 md:p-8 space-y-8 animate-fadeIn">
        {/* Error Recovery Card */}
        <div className="w-full relative overflow-hidden rounded-3xl bg-error-container/15 border border-error/30 p-6 md:p-8 shadow-xl backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-error/15 flex items-center justify-center shrink-0 text-error shadow-[0_0_16px_rgba(255,180,171,0.2)]">
                <AlertTriangle className="w-6 h-6 stroke-[1.75]" />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-title-md text-title-md text-on-surface font-semibold">
                    Couldn't load your coursework
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-error/20 font-chip-status text-[10px] text-error uppercase font-semibold">
                    Server timed out
                  </span>
                </div>
                <p className="font-code-sm text-xs text-error/90 break-all pt-1">
                  {fetchError}
                </p>
                  <div className="flex items-center gap-3 pt-2 text-on-surface-variant font-code-sm text-xs">
                    <span>Nothing was changed. Try again in a moment.</span>
                  </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="h-11 px-6 rounded-xl bg-error text-on-error font-label-caps text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(255,180,171,0.25)] hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Reconnecting...' : 'Retry Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1440px] mx-auto p-4 md:p-8">
      {/* Export / System Notice */}
      {exportNotice && (
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-2xl text-xs text-primary font-label-caps uppercase tracking-wider flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mb-1">
            Your subjects
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Open a subject to work on it, or dump material into one for your agent.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsCreatingSubject(true)}
            className="h-11 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_24px_rgba(89,216,201,0.25)] hover:bg-primary-container transition-all cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2]" />
            <span>New Subject</span>
          </button>
          <button
            type="button"
            onClick={handleExportAllData}
            disabled={exportingAll}
            className="h-11 px-4 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center gap-2 cursor-pointer font-label-caps text-xs uppercase tracking-wider disabled:opacity-60"
            title="Export complete user data archive"
            aria-label="Export complete user data"
          >
            {exportingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{exportingAll ? 'Exporting…' : 'Export Archive'}</span>
          </button>
        </div>
      </div>

      {/* Dashboard level: one medium card per subject. The owner's shape for
          this page is bubbles, not a wall of assignment rows — you pick a
          subject, then work inside it. */}
      {selectedSubjectId === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {finalSubjects.map((bubble) => {
            const subjectCards = (
              bubble.id === 'subj_other' ? unassigned : cardMap.get(bubble.id) || []
            ).filter((c) => c != null && c.id != null);
            const activeCount = subjectCards.filter(
              (c) => getAssignmentBucket(c.status) === 'in_progress'
            ).length;
            const pendingCount = subjectCards.filter(
              (c) => getAssignmentBucket(c.status) === 'pending'
            ).length;

            return (
              <div
                key={bubble.id}
                className="group relative bg-surface-container-lowest/80 backdrop-blur-xl rounded-3xl border border-outline-variant/20 p-5 md:p-6 shadow-sm hover:border-primary/40 hover:shadow-[0_0_28px_rgba(89,216,201,0.10)] transition-all flex flex-col"
              >
                {/* Whole card opens the subject; the dump button sits above it so
                    a click there does not also navigate. */}
                <button
                  type="button"
                  onClick={() => setSelectedSubjectId(bubble.id)}
                  className="flex items-start gap-4 text-left cursor-pointer w-full"
                  aria-label={`Open ${bubble.title}`}
                >
                  <SubjectTile icon={bubble.icon} color={bubble.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-title-md text-base font-semibold text-on-surface truncate">
                        {bubble.title}
                      </h3>
                      {bubble.is_custom && (
                        <span className="font-chip-status text-[10px] text-primary bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5 uppercase">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="font-code-sm text-xs text-on-surface-variant mt-1">
                      {subjectCards.length} {subjectCards.length === 1 ? 'assignment' : 'assignments'} present
                    </p>
                    {/* Overrides change this subject's behaviour silently, so they
                        have to be visible from here — the controls are one level in. */}
                    {getSubjectOverridePaths(bubble.title).length > 0 && (
                      <span
                        data-subject-overridden={bubble.title}
                        title={`${getSubjectOverridePaths(bubble.title).length} setting(s) override the global default for this subject`}
                        className="inline-flex items-center gap-1.5 mt-1.5 text-[10px] font-chip-status uppercase tracking-wider text-sem-amber"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sem-amber" />
                        {getSubjectOverridePaths(bubble.title).length} override
                        {getSubjectOverridePaths(bubble.title).length === 1 ? '' : 's'} vs global
                      </span>
                    )}
                  </div>
                </button>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-chip-status uppercase tracking-wider border ${
                      activeCount > 0
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-surface-container border-outline-variant/25 text-on-surface-variant'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        activeCount > 0 ? 'bg-primary' : 'bg-on-surface-variant/40'
                      }`}
                    />
                    {activeCount} active
                  </span>
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-chip-status uppercase tracking-wider border bg-error-container/20 border-error/25 text-on-error-container">
                      {pendingCount} pending
                    </span>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-outline-variant/15 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setDumpTargetSubject(bubble.title)}
                    className="h-9 px-3 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center gap-2 cursor-pointer font-label-caps text-[11px] uppercase tracking-wider"
                    title={`Dump text or a file into ${bubble.title}`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Dump</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSubjectId(bubble.id)}
                    className="h-9 px-3 rounded-xl text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center gap-1.5 cursor-pointer font-label-caps text-[11px] uppercase tracking-wider"
                  >
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="space-y-8">
        {/* One subject, opened. */}
        <button
          type="button"
          onClick={() => setSelectedSubjectId(null)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer font-label-caps text-xs uppercase tracking-wider"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>All subjects</span>
        </button>
        {finalSubjects.filter((b) => b.id === selectedSubjectId).map((bubble) => {
          const subjectCards = (
            bubble.id === 'subj_other'
              ? unassigned
              : cardMap.get(bubble.id) || []
          ).filter((c) => c != null && c.id != null);

          // Categorize into in_progress vs pending (§3.4.1 bucket fix: completed is NOT in In Progress)
          const pendingCards = subjectCards.filter(
            (c) => getAssignmentBucket(c.status) === 'pending'
          );
          const inProgressCards = subjectCards.filter(
            (c) => getAssignmentBucket(c.status) === 'in_progress'
          );

          const overrideCount = getSubjectOverrideCount(bubble.title);
          const isSettingsOpen = openSettingsSubjectId === bubble.id;

          return (
            <section
              key={bubble.id}
              className="bg-surface-container-lowest/80 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-sm border border-outline-variant/20 flex flex-col gap-6"
            >
              {/* Subject Section Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-outline-variant/15 pb-5">
                <div className="flex items-center gap-4">
                  <SubjectTile icon={bubble.icon} color={bubble.color} size={48} />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-title-md text-title-md font-semibold text-on-surface">
                        {bubble.title}
                      </h3>
                      {bubble.is_custom && (
                        <span className="font-chip-status text-[10px] text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-0.5 uppercase">
                          Custom
                        </span>
                      )}
                    </div>
                    {/* Honest Count Line: {N} in progress · {M} pending approval */}
                    <p className="font-code-sm text-xs text-on-surface-variant mt-0.5">
                      {inProgressCards.length} in progress · {pendingCards.length} pending approval
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap self-end lg:self-auto">
                  {/* Single per-card action — settings, export and delete live
                      inside the panel (owner 09-06: one option per card, not three) */}
                  <button
                    type="button"
                    onClick={() => setOpenSettingsSubjectId(isSettingsOpen ? null : bubble.id)}
                    aria-expanded={isSettingsOpen}
                    className={`h-11 px-4 rounded-xl border font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                      isSettingsOpen
                        ? 'bg-primary/15 border-primary/50 text-primary'
                        : 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Subject Settings</span>
                    {overrideCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-sem-amber shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Subject Settings Disclosure (§4.3 Level-1 Config) */}
              {isSettingsOpen && (
                <SubjectSettingsPanel
                  subject={bubble}
                  isOpen={isSettingsOpen}
                  onClose={() => setOpenSettingsSubjectId(null)}
                  onSettingsChanged={() => setSettingsVersion((v) => v + 1)}
                  onExport={() => handleExportBubble(bubble.title)}
                  onDelete={() => handleDeleteBubble(bubble.id)}
                  isCustom={bubble.is_custom}
                  settings={loadSettings()}
                />
              )}

              {/* Subject Body: Empty State vs Tablet 3-col Grid */}
              {subjectCards.length === 0 ? (
                /* SECTION A: EMPTY SUBJECT STATE (§3.4.1) */
                <div className="rounded-2xl bg-surface-container-low/40 border border-dashed border-outline-variant/30 p-8 md:p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-primary mb-4 shadow-inner">
                    <BookOpen className="w-8 h-8 stroke-[1.75]" />
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-surface-container mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="font-chip-status text-[10px] text-primary uppercase tracking-widest">
                      Ready for assignments
                    </span>
                  </div>
                  <h4 className="font-title-md text-title-md font-semibold text-on-surface mb-2">
                    No assignments in {bubble.title} yet
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md mb-6">
                    Add assignment details, upload notes, or drop a prompt to get started with this subject.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider shadow-[0_0_24px_rgba(89,216,201,0.25)] hover:bg-primary-container transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4 stroke-[2]" />
                    <span>Import Assignment</span>
                  </button>
                </div>
              ) : (
                /* §3.4.1 Tablet Grid Rule: md:grid-cols-3, Col-Span-2 for In-Progress, Col-Span-1 for Pending Approval */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                  {/* IN PROGRESS COLUMN (md:col-span-2) */}
                  <div className="col-span-1 md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                        In Progress ({inProgressCards.length})
                      </h4>
                    </div>

                    {inProgressCards.length === 0 ? (
                      <div className="bg-surface-container-low/40 rounded-2xl p-6 border border-dashed border-outline-variant/30 text-center">
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          Nothing in progress right now — kick off an agent thread and it will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {inProgressCards.map((card) => (
                          <AssignmentCard
                            key={card.id}
                            card={card}
                            variant="in_progress"
                            onSelect={() => onSelectAssignment && onSelectAssignment(card)}
                            onExport={handleExportAssignment}
                            onLaunchToDoc={() => setLaunchToDocAssignment(card)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* PENDING APPROVAL COLUMN (md:col-span-1) */}
                  <div className="col-span-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                        <span>Pending Approval</span>
                        {pendingCards.length > 0 && (
                          <span className="bg-error-container text-on-error-container px-2 py-0.2 rounded-full text-[10px] font-bold">
                            {pendingCards.length}
                          </span>
                        )}
                      </h4>
                    </div>

                    {pendingCards.length === 0 ? (
                      <div className="bg-surface-container-low/40 rounded-2xl p-6 border border-dashed border-outline-variant/30 text-center">
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          Nothing needs your approval — you are all caught up.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingCards.map((card) => (
                          <AssignmentCard
                            key={card.id}
                            card={card}
                            variant="pending"
                            onSelect={() => onSelectAssignment && onSelectAssignment(card)}
                            onExport={handleExportAssignment}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      )}

      {/* Dump-into-subject */}
      <SubjectDumpModal
        isOpen={!!dumpTargetSubject}
        subject={dumpTargetSubject}
        onClose={() => setDumpTargetSubject(null)}
        onDumped={() => fetchDashboardData()}
      />

      {/* Create Subject Dialog */}
      <CreateSubjectDialog
        isOpen={isCreatingSubject}
        onClose={() => setIsCreatingSubject(false)}
        onCreated={handleCreateSubject}
        existingTitles={finalSubjects.map((s) => s.title)}
      />

      {/* New Assignment Modal */}
      <NewAssignmentModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onCreated={() => {
          setShowImportModal(false);
          fetchDashboardData();
        }}
      />

      {/* Launch to Doc Modal */}
      <LaunchToDocModal
        isOpen={!!launchToDocAssignment}
        assignment={launchToDocAssignment}
        onClose={() => setLaunchToDocAssignment(null)}
      />
    </div>
  );
}

export default AssignmentCardDashboard;
