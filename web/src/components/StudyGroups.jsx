import React, { useState, useEffect } from 'react';
import api from '../api';
import { Users, Plus, UserPlus, BookOpen, Shield } from 'lucide-react';

export default function StudyGroups({ publicId }) {
  const [groups, setGroups] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGroups() {
      try {
        const res = await api.get(`/groups/my?public_id=${publicId || 'RoniDev'}`);
        setGroups(res.data?.groups || res || [
          { id: 1, name: "Distributed Systems Lab", code: "DIST-99", members: 4, course: "CS-504" },
          { id: 2, name: "Algorithmic Decision Support", code: "ALGO-42", members: 6, course: "PSYC-240" }
        ]);
      } catch {
        setGroups([
          { id: 1, name: "Distributed Systems Lab", code: "DIST-99", members: 4, course: "CS-504" },
          { id: 2, name: "Algorithmic Decision Support", code: "ALGO-42", members: 6, course: "PSYC-240" }
        ]);
      } finally {
        setLoading(false);
      }
    }
    loadGroups();
  }, [publicId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400"/> Collaborative Neural Clusters
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Share synthesized course graphs, prompt embeddings, and anti-detector calibrations.
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/20 transition-all cursor-pointer">
          <Plus className="w-4 h-4"/> Create Cluster
        </button>
      </div>

      <div className="glass-panel rounded-xl p-5 border border-cyan-500/20">
        <h3 className="text-xs font-mono uppercase text-slate-300 mb-3 flex items-center gap-2">
          <UserPlus className="w-3.5 h-3.5 text-cyan-400"/> Join Existing Node
        </h3>
        <div className="flex gap-3">
          <input 
            type="text"
            placeholder="Enter Cluster Invite Code (e.g. CS504-SYNC)..."
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg glass-input text-xs font-mono placeholder:text-slate-500"
          />
          <button className="px-5 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono transition-all cursor-pointer">
            Connect
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g.id} className="glass-panel rounded-xl p-5 border border-white/5 hover:border-cyan-500/30 transition-all">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase">{g.course}</span>
                <h4 className="text-sm font-semibold text-slate-100 mt-0.5">{g.name}</h4>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300 border border-white/10">
                {g.members || 4} Peers
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Code: <strong className="text-cyan-300">{g.code || 'CLUSTER-01'}</strong></span>
              <button className="text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer">Open Feed →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
