import React, { useState, useEffect } from 'react';
import api from '../api.js';
import SectionCard from './SectionCard.jsx';
import {
  Trophy,
  ShieldCheck,
  Zap,
  Sparkles,
  Search,
  CheckCircle2,
  RefreshCw,
  Edit3,
  Dices,
  Eye,
  EyeOff,
  Flame,
  Award,
} from 'lucide-react';

const RANDOM_ALIASES = [
  'QuantumScholar',
  'NeuralNomad',
  'ApexSynthesist',
  'CyberAlchemist',
  'TensorVoyager',
  'LogicSpecter',
  'CalculusPhantom',
  'AeroPhilosopher',
  'PrismLearner',
  'ZeroDrift_AI',
  'BioCognitive',
  'VectorPioneer',
];

export default function CreditLeaderboard({ userId, userCredits }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [userStats, setUserStats] = useState({
    // 08-27: honest defaults — null until real leaderboard data loads.
    rank: null,
    current_alias: null,
    opt_in: false,
    credits_used: null,
  });
  const [microCredits, setMicroCredits] = useState(null);
  const [customAlias, setCustomAlias] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await api.getLeaderboard();
      if (res && res.leaderboard) {
        setLeaderboard(res.leaderboard);
        if (res.user_stats) {
          setUserStats(res.user_stats);
          setCustomAlias(res.user_stats.current_alias || '');
          setOptIn(res.user_stats.opt_in !== false);
        }
      }
      // Real Micro-Credits balance (datalake history endpoint, session auth).
      try {
        const mc = await api.getMicrocreditsHistory(userId);
        if (mc && typeof mc.balance === 'number') setMicroCredits(mc.balance);
      } catch { /* microcredits are optional — milestone shows "—" */ }
    } catch (e) {
      console.warn('Leaderboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [userId]);

  const handleSaveAlias = async (e) => {
    e?.preventDefault();
    if (!customAlias.trim()) return;
    setSaving(true);
    try {
      await api.updateLeaderboardAlias({
        alias: customAlias.trim(),
        opt_in: optIn,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchLeaderboard();
    } catch (err) {
      console.error('Failed to save alias:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRandomize = () => {
    const pick = RANDOM_ALIASES[Math.floor(Math.random() * RANDOM_ALIASES.length)];
    const num = Math.floor(10 + Math.random() * 90);
    setCustomAlias(`${pick}_${num}`);
  };

  const topScore = leaderboard.length > 0 ? leaderboard[0].credits_used : 1;

  // Normalize entries: the demo layer returns public_id instead of alias and
  // omits rank/level/badge — fill defaults so search + render never crash.
  const normalizedLeaderboard = leaderboard.map((entry, i) => ({
    ...entry,
    alias: entry.alias || entry.public_id,
    rank: entry.rank || i + 1,
    level: entry.level || 'Undergraduate',
    badge: entry.badge || '⭐ Contender',
  }));

  const filteredLeaderboard = normalizedLeaderboard.filter((item) =>
    String(item.alias || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.level && item.level.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selfEntry = normalizedLeaderboard.find((e) => e.is_self);
  const selfLevel = selfEntry?.level || null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ─── Header & Description ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Credits Used Leaderboard</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Top learners ranked purely by compute credits utilized. No social feeds or friend requests.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchLeaderboard}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs bg-white/5 hover:bg-[var(--color-surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--accent)]' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ─── Top Metric Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SectionCard id="creditleaderboard-rank" padding="p-4" header={
          <div className="flex items-center justify-between w-full text-xs text-amber-300/90">
            <span>Your Current Rank</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
        }>
          <div className="text-2xl font-bold text-white flex items-baseline gap-2">
            <span>{userStats.rank != null ? `#${userStats.rank}` : '—'}</span>
            <span className="text-xs font-normal text-[var(--text-muted)] font-mono">of {leaderboard.length} Scholars</span>
          </div>
          <div className="text-xs text-amber-400/90 mt-1 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" />
            {userStats.rank != null && leaderboard.length > 0
              ? `Top ${Math.max(1, Math.round((userStats.rank / leaderboard.length) * 100))}%`
              : 'Not ranked yet — use the platform to appear'}
          </div>
        </SectionCard>

        <SectionCard id="creditleaderboard-used" padding="p-4" header={
          <div className="flex items-center justify-between w-full text-xs text-[var(--text-muted)]">
            <span>Your Credits Used</span>
            <Zap className="w-4 h-4 text-[var(--accent)]" />
          </div>
        }>
          <div className="text-2xl font-bold text-[var(--accent)] font-mono">
            {userStats.credits_used != null ? Number(userStats.credits_used).toLocaleString() : '—'} <span className="text-xs text-[var(--text-muted)]">cr</span>
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            Available: {Number(userCredits || 0).toLocaleString()} cr
          </div>
        </SectionCard>

        <SectionCard id="creditleaderboard-name" padding="p-4" header={
          <div className="flex items-center justify-between w-full text-xs text-[var(--text-muted)]">
            <span>Leaderboard Display Name</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
        }>
          <div className="text-base font-bold text-emerald-300 font-mono truncate">
            {userStats.current_alias || 'Not set yet'}
          </div>
          <div className="text-xs text-emerald-400/80 mt-1 flex items-center gap-1">
            <span>🔒 Real identity hidden</span>
          </div>
        </SectionCard>
      </div>

      {/* ─── Student Milestones & Study Streaks (DES-PSY-002) ────────── */}
      <SectionCard id="creditleaderboard-milestones" padding="p-4" header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Your Academic Study Milestones</h2>
          </div>
          <span className="text-[11px] text-[var(--accent)] font-mono">{selfLevel || 'Unranked'}</span>
        </div>
      }>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <span className="text-lg" aria-hidden="true">🔥</span>
            <div>
              <div className="text-xs font-semibold text-amber-300">Study Streak</div>
              <div className="text-[10px] font-mono text-[var(--text-muted)]">—</div>
            </div>
          </div>
          <div className="p-2.5 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <span className="text-lg" aria-hidden="true">🎓</span>
            <div>
              <div className="text-xs font-semibold text-indigo-300">Quiz Practice</div>
              <div className="text-[10px] font-mono text-[var(--text-muted)]">—</div>
            </div>
          </div>
          <div className="p-2.5 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <span className="text-lg" aria-hidden="true">⚡</span>
            <div>
              <div className="text-xs font-semibold text-blue-300">Study Packs Built</div>
              <div className="text-[10px] font-mono text-[var(--text-muted)]">—</div>
            </div>
          </div>
          <div className="p-2.5 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <span className="text-lg" aria-hidden="true">🛡️</span>
            <div>
              <div className="text-xs font-semibold text-emerald-300">Micro-Credits</div>
              <div className="text-[10px] font-mono text-[var(--text-muted)]">
                {microCredits != null ? `+${Number(microCredits).toLocaleString()}` : '—'}
              </div>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-3">
          Milestone values come from your live account activity — stats with no recorded activity show “—”.
        </p>
      </SectionCard>

      {/* ─── Custom Alias & Privacy Customizer ────────────────────────── */}
      <SectionCard id="creditleaderboard-alias" className="space-y-4" header={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-white">Customize Your Leaderboard Alias</h2>
          </div>
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Your account email and real name remain 100% private.
          </span>
        </div>
      }>

        <form onSubmit={handleSaveAlias} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 relative">
              <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Public Display Alias
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAlias}
                  onChange={(e) => setCustomAlias(e.target.value)}
                  placeholder="e.g. ApexScholar_99"
                  maxLength={35}
                  className="clean-input flex-1 px-3.5 py-2 text-xs font-mono text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleRandomize}
                  title="Randomize Alias"
                  className="px-3 py-2 rounded-[var(--radius-sm)] bg-white/5 hover:bg-[var(--color-surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <Dices className="w-4 h-4 text-[var(--accent)]" />
                  <span className="hidden sm:inline">Random</span>
                </button>
              </div>
            </div>

            <div className="md:col-span-3 flex flex-col justify-end">
              <label className="text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Leaderboard Visibility
              </label>
              <button
                type="button"
                onClick={() => setOptIn(!optIn)}
                className={`w-full py-2 px-3 rounded-[var(--radius-sm)] border text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer ${
                  optIn
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-white/4 border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--text-primary)]'
                }`}
              >
                {optIn ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-400" /> Publicly Ranked
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Hidden / Private
                  </>
                )}
              </button>
            </div>

            <div className="md:col-span-3 flex flex-col justify-end">
              <button
                type="submit"
                disabled={saving || !customAlias.trim()}
                className="w-full py-2 px-4 rounded-[var(--radius-sm)] text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_4px_18px_rgba(139,92,246,0.30)] transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> Saved!
                  </>
                ) : (
                  'Save Alias'
                )}
              </button>
            </div>
          </div>
        </form>
      </SectionCard>

      {/* ─── Search & Standings List ─────────────────────────────────── */}
      <SectionCard id="creditleaderboard-standings" padding="p-0" className="overflow-hidden" header={
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Global Standings (Credits Used)</h2>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">({filteredLeaderboard.length} Scholars)</span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by alias or academic level..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="clean-input w-full pl-8 pr-3 py-2 text-xs font-mono text-white outline-none"
            />
          </div>
        </div>
      }>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 w-16 text-center">Rank</th>
                <th className="py-3 px-4">Scholar Alias</th>
                <th className="py-3 px-4">Academic Level</th>
                <th className="py-3 px-4">Tier Badge</th>
                <th className="py-3 px-4 text-right">Credits Used</th>
                <th className="py-3 px-4 w-40 text-right">Relative Expended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredLeaderboard.map((row) => {
                const isSelf = row.is_self || row.alias === userStats.current_alias;
                const ratio = Math.min(100, (row.credits_used / (topScore || 1)) * 100);

                let rankVisual = `#${row.rank}`;
                let rankClass = 'text-[var(--text-muted)]';
                if (row.rank === 1) {
                  rankVisual = '🥇 1st';
                  rankClass = 'text-amber-400 font-bold';
                } else if (row.rank === 2) {
                  rankVisual = '🥈 2nd';
                  rankClass = 'text-[var(--text-primary)] font-bold';
                } else if (row.rank === 3) {
                  rankVisual = '🥉 3rd';
                  rankClass = 'text-amber-600 font-bold';
                }

                return (
                  <tr
                    key={row.alias + row.rank}
                    className={`transition-colors ${
                      isSelf
                        ? 'bg-[var(--accent-subtle)] border-l-[3px] border-l-[var(--accent)] font-medium'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className={`py-3.5 px-4 text-center font-mono ${rankClass}`}>
                      {rankVisual}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-white">
                      {/* flex belongs on an inner div — a flex <td> drops out of
                          table-cell layout on some mobile webkit builds */}
                      <span className="flex items-center gap-2">
                        <span>{row.alias}</span>
                        {isSelf && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] bg-[var(--accent-subtle)] text-[var(--accent)] border border-[rgba(139,92,246,0.35)]">
                            You
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-muted)]">
                      {row.level || 'Undergraduate'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-mono bg-white/5 text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                        {row.badge || '⭐ Contender'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                      {Number(row.credits_used).toLocaleString()} <span className="text-[10px] text-[var(--text-muted)] font-normal">cr</span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-[var(--color-surface-raised)] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              row.rank === 1
                                ? 'bg-gradient-to-r from-amber-500 to-amber-300'
                                : isSelf
                                ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]'
                                : 'bg-[var(--color-border-soft)]'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] w-8 text-right">
                          {Math.round(ratio)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredLeaderboard.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)] font-mono">
                    No scholars found matching "{searchQuery}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
