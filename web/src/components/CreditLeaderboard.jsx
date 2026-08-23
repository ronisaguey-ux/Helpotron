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
    rank: 4,
    current_alias: 'QuantumScholar_42',
    opt_in: true,
    credits_used: 4820.0,
  });
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
          setCustomAlias(res.user_stats.current_alias || 'QuantumScholar_42');
          setOptIn(res.user_stats.opt_in !== false);
        }
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
    const num = Math.floor(10 + Math.random() * 90);
    setCustomAlias(`${pick}_${num}`);
  };

  const topScore = leaderboard.length > 0 ? leaderboard[0].credits_used : 15000;

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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ─── Header & Description ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Credits Used Leaderboard</h1>
              <p className="text-xs text-slate-400">
                Top learners ranked purely by compute credits utilized. No social feeds or friend requests.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchLeaderboard}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          Refresh Standings
        </button>
      </div>

      {/* ─── Top Metric Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SectionCard id="creditleaderboard-rank" padding="p-4" className="rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-950 border border-amber-500/20" header={
          <div className="flex items-center justify-between w-full text-xs text-amber-300/80">
            <span>Your Current Rank</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
        }>
          <div className="text-2xl font-bold text-white flex items-baseline gap-2">
            <span>#{userStats.rank}</span>
            <span className="text-xs font-normal text-slate-400 font-mono">of {leaderboard.length} Scholars</span>
          </div>
          <div className="text-[11px] text-amber-400/90 mt-1 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" /> Top 15% Computing Powerhouse
          </div>
        </SectionCard>

        <SectionCard id="creditleaderboard-used" padding="p-4" className="rounded-2xl bg-slate-900/60 border border-white/10" header={
          <div className="flex items-center justify-between w-full text-xs text-slate-400">
            <span>Your Credits Used</span>
            <Zap className="w-4 h-4 text-blue-400" />
          </div>
        }>
          <div className="text-2xl font-bold text-blue-400 font-mono">
            {Number(userStats.credits_used || 4820).toLocaleString()} <span className="text-xs text-slate-400">cr</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Available: {Number(userCredits || 10029).toLocaleString()} cr
          </div>
        </SectionCard>

        <SectionCard id="creditleaderboard-name" padding="p-4" className="rounded-2xl bg-slate-900/60 border border-white/10" header={
          <div className="flex items-center justify-between w-full text-xs text-slate-400">
            <span>Leaderboard Display Name</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
        }>
          <div className="text-base font-bold text-emerald-300 font-mono truncate">
            {userStats.current_alias || 'QuantumScholar_42'}
          </div>
          <div className="text-[11px] text-emerald-400/80 mt-1 flex items-center gap-1">
            <span>🔒 Real identity hidden</span>
          </div>
        </SectionCard>
      </div>

      {/* ─── Student Milestones & Study Streaks (DES-PSY-002) ────────── */}
      <SectionCard id="creditleaderboard-milestones" padding="p-4" className="rounded-2xl bg-gradient-to-r from-blue-950/30 via-slate-900 to-indigo-950/30 border border-blue-500/20" header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Your Academic Study Milestones</h2>
          </div>
          <span className="text-[11px] text-blue-400 font-mono">Level 4 Scholar</span>
        </div>
      }>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/20 flex items-center gap-2.5">
            <span className="text-lg">🔥</span>
            <div>
              <div className="text-xs font-semibold text-amber-300">7-Day Streak</div>
              <div className="text-[10px] text-slate-400">Active Study Streak</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-indigo-500/20 flex items-center gap-2.5">
            <span className="text-lg">🎓</span>
            <div>
              <div className="text-xs font-semibold text-indigo-300">Quiz Master</div>
              <div className="text-[10px] text-slate-400">95% Practice Accuracy</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-blue-500/20 flex items-center gap-2.5">
            <span className="text-lg">⚡</span>
            <div>
              <div className="text-xs font-semibold text-blue-300">Fast Synthesist</div>
              <div className="text-[10px] text-slate-400">12 Study Packs Built</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/20 flex items-center gap-2.5">
            <span className="text-lg">🛡️</span>
            <div>
              <div className="text-xs font-semibold text-emerald-300">Data Contributor</div>
              <div className="text-[10px] text-slate-400">+150 Micro-Credits</div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ─── Custom Alias & Privacy Customizer ────────────────────────── */}
      <SectionCard id="creditleaderboard-alias" className="rounded-2xl bg-slate-900/80 border border-blue-500/20 space-y-4" header={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Customize Your Leaderboard Alias</h2>
          </div>
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Your account email and real name remain 100% private.
          </span>
        </div>
      }>

        <form onSubmit={handleSaveAlias} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 relative">
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Public Display Alias
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAlias}
                  onChange={(e) => setCustomAlias(e.target.value)}
                  placeholder="e.g. ApexScholar_99"
                  maxLength={35}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-white/10 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  type="button"
                  onClick={handleRandomize}
                  title="Randomize Alias"
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <Dices className="w-4 h-4 text-purple-400" />
                  <span className="hidden sm:inline">Random</span>
                </button>
              </div>
            </div>

            <div className="md:col-span-3 flex flex-col justify-end">
              <label className="text-[11px] font-mono text-slate-400 mb-1">
                Leaderboard Visibility
              </label>
              <button
                type="button"
                onClick={() => setOptIn(!optIn)}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer ${
                  optIn
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {optIn ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-400" /> Publicly Ranked
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" /> Hidden / Private
                  </>
                )}
              </button>
            </div>

            <div className="md:col-span-3 flex flex-col justify-end">
              <button
                type="submit"
                disabled={saving || !customAlias.trim()}
                className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-md shadow-blue-500/20 transition cursor-pointer flex items-center justify-center gap-1.5"
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
                  'Update Leaderboard Name'
                )}
              </button>
            </div>
          </div>
        </form>
      </SectionCard>

      {/* ─── Search & Standings List ─────────────────────────────────── */}
      <SectionCard id="creditleaderboard-standings" padding="p-0" className="rounded-2xl bg-slate-900/60 border border-white/10 overflow-hidden" header={
        <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Global Standings (Credits Used)</h2>
            <span className="text-[11px] font-mono text-slate-400">({filteredLeaderboard.length} Scholars)</span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by alias or academic level..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      }>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02] text-slate-400 font-mono text-[11px]">
                <th className="py-3 px-4 w-16 text-center">Rank</th>
                <th className="py-3 px-4">Scholar Alias</th>
                <th className="py-3 px-4">Academic Level</th>
                <th className="py-3 px-4">Tier Badge</th>
                <th className="py-3 px-4 text-right">Credits Used</th>
                <th className="py-3 px-4 w-40 text-right">Relative Expended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLeaderboard.map((row) => {
                const isSelf = row.is_self || row.alias === userStats.current_alias;
                const ratio = Math.min(100, (row.credits_used / (topScore || 1)) * 100);

                let rankVisual = `#${row.rank}`;
                let rankClass = 'text-slate-400';
                if (row.rank === 1) {
                  rankVisual = '🥇 1st';
                  rankClass = 'text-amber-400 font-bold';
                } else if (row.rank === 2) {
                  rankVisual = '🥈 2nd';
                  rankClass = 'text-slate-200 font-bold';
                } else if (row.rank === 3) {
                  rankVisual = '🥉 3rd';
                  rankClass = 'text-amber-600 font-bold';
                }

                return (
                  <tr
                    key={row.alias + row.rank}
                    className={`transition-colors ${
                      isSelf
                        ? 'bg-blue-600/10 border-l-4 border-l-blue-500 font-medium'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className={`py-3.5 px-4 text-center font-mono ${rankClass}`}>
                      {rankVisual}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-white flex items-center gap-2">
                      <span>{row.alias}</span>
                      {isSelf && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          You
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {row.level || 'Undergraduate'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-mono bg-white/5 text-slate-300 border border-white/10">
                        {row.badge || '⭐ Contender'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                      {Number(row.credits_used).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">cr</span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              row.rank === 1
                                ? 'bg-gradient-to-r from-amber-500 to-amber-300'
                                : isSelf
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-400'
                                : 'bg-gradient-to-r from-slate-500 to-slate-400'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                          {Math.round(ratio)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredLeaderboard.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500 font-mono">
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
