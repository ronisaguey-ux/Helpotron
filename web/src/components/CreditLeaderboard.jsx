import React, { useState, useEffect } from 'react';
import api from '../api.js';
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
  Flame,
  Award,
  Lock,
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

export default function CreditLeaderboard({ userId = '', userCredits = 0 }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [userStats, setUserStats] = useState({
    rank: null,
    current_alias: null,
    opt_in: true,
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
      try {
        const mc = await api.getMicrocreditsHistory(userId);
        if (mc && typeof mc.balance === 'number') setMicroCredits(mc.balance);
      } catch {
        /* optional telemetry */
      }
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
    setCustomAlias(pick);
  };

  const filteredLeaderboard = leaderboard.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.alias || '').toLowerCase().includes(q) ||
      String(item.rank || '').includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Alias Customizer */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Peer Standings</span>
              <span className="text-outline-variant font-code-sm text-xs">/</span>
              <span className="font-chip-status text-[10px] text-sem-blue bg-sem-blue/10 px-2 py-0.5 rounded-full uppercase">
                Anonymized
              </span>
            </div>
            <h2 className="font-title-md text-xl text-on-surface font-semibold">
              Global Synthesis &amp; Compute Leaderboard
            </h2>
            <p className="font-body-sm text-xs text-on-surface-variant max-w-xl">
              Compare your compute velocity with peers. Student identities are protected by cryptographic pseudonyms.
            </p>
          </div>
        </div>

        {/* Alias Configuration Row */}
        <form onSubmit={handleSaveAlias} className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/15 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={customAlias}
                onChange={(e) => setCustomAlias(e.target.value)}
                placeholder="Choose custom pseudonym"
                maxLength={32}
                className="w-full h-11 px-3.5 pr-10 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-sm text-xs focus:outline-none focus:border-primary transition"
              />
              <button
                type="button"
                onClick={handleRandomize}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-primary transition"
                title="Randomize pseudonym"
              >
                <Dices className="w-4 h-4" />
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                className="rounded bg-surface-container border-outline-variant text-primary focus:ring-primary"
              />
              <span>Appear on public leaderboard</span>
            </label>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="submit"
              disabled={saving || !customAlias.trim()}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase tracking-wider font-semibold transition active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Update Alias'}
            </button>
          </div>
        </form>
      </div>

      {/* Pinned Current User Row */}
      <div className="bg-surface-container-low border-2 border-primary/40 rounded-3xl p-5 shadow-[0_0_20px_rgba(120,245,229,0.12)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold text-lg font-tabular-stat">
            {userStats.rank ? `#${userStats.rank}` : '—'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-title-md text-base text-on-surface font-semibold">
                {userStats.current_alias || customAlias || 'Your Account (You)'}
              </span>
              <span className="font-chip-status text-[10px] text-primary bg-primary/15 px-2 py-0.5 rounded-full uppercase">
                YOU
              </span>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Current Tier Compute Runway
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 sm:justify-end">
          <div className="text-right">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Tokens Deployed</span>
            <span className="font-tabular-stat text-lg text-primary font-bold">
              {userStats.credits_used !== null ? Number(userStats.credits_used * 100).toLocaleString() : '0'}
            </span>
          </div>
          <div className="text-right">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Micro-Credits</span>
            <span className="font-tabular-stat text-lg text-sem-green font-bold">
              {microCredits !== null ? microCredits.toLocaleString() : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Leaderboard Table */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by pseudonym..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-container-low border border-outline-variant/25 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition"
            />
          </div>
          <span className="font-code-sm text-xs text-on-surface-variant">
            {filteredLeaderboard.length} Verified Scholars
          </span>
        </div>

        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-2xl bg-surface-container-low/50 animate-pulse" />
            ))}
          </div>
        ) : filteredLeaderboard.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-surface-container-low/40 space-y-2">
            <Trophy className="w-8 h-8 text-on-surface-variant/40 mx-auto" />
            <p className="font-title-md text-sm text-on-surface font-medium">
              No one has earned referral credits yet
            </p>
            <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
              Share your referral link with peers to climb the ranks and earn compute credits!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLeaderboard.map((entry, idx) => {
              const isTop3 = entry.rank <= 3;
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border transition flex items-center justify-between gap-3 ${
                    isTop3
                      ? 'bg-surface-container-low/80 border-primary/20 hover:border-primary/40'
                      : 'bg-surface-container-low/40 border-outline-variant/10 hover:border-outline-variant/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-tabular-stat text-sm font-bold shrink-0 ${
                        entry.rank === 1
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : entry.rank === 2
                          ? 'bg-slate-300/15 text-slate-200 border border-slate-400/30'
                          : entry.rank === 3
                          ? 'bg-amber-700/15 text-amber-400 border border-amber-700/30'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {entry.rank}
                    </div>
                    <div className="min-w-0">
                      <span className="font-body-sm text-xs font-semibold text-on-surface truncate block">
                        {entry.alias}
                      </span>
                      <span className="font-code-sm text-[10px] text-on-surface-variant">
                        Scholar #{entry.rank}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-tabular-stat text-sm text-primary font-semibold block">
                      {Number(entry.credits_used || 0).toLocaleString()} Credits
                    </span>
                    <span className="font-code-sm text-[10px] text-on-surface-variant">
                      ~{Number((entry.credits_used || 0) * 100).toLocaleString()} tokens
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
