// Unified My Agent Operating Console
import React, { useState } from 'react';
import { Bot, Sparkles, Send, Paperclip, Undo2, ShieldCheck, History, FileText, Settings, Play } from 'lucide-react';

export const AIWorkspace = ({ user, activeScope, onExecuteAction, onRollbackAction }) => {
  const [autonomyLevel, setAutonomyLevel] = useState('routine'); // suggestion, ask, routine, autonomous
  const [actionLedger, setActionLedger] = useState([]);
  const [activeArtifacts, setActiveArtifacts] = useState([]);

  return (
    <div className="h-full flex flex-col max-w-6xl mx-auto p-6 space-y-6">
      {/* Agent Header & Autonomy Controller */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">My Agent</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500">● Ready</span>
            </div>
            <p className="text-xs text-muted-foreground">Universal Natural Language Control Plane for Helpotron</p>
          </div>
        </div>

        {/* Autonomy Level Spectrum */}
        <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Autonomy:</span>
          {['suggestion', 'ask', 'routine', 'autonomous'].map((level) => (
            <button
              key={level}
              onClick={() => setAutonomyLevel(level)}
              className={`text-xs px-2.5 py-1 rounded-md capitalize transition-colors ${
                autonomyLevel === level ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {level === 'routine' ? 'Trusted' : level}
            </button>
          ))}
        </div>
      </div>

      {/* Action Ledger & Undo Ribbon */}
      {actionLedger.length > 0 && (
        <div className="bg-muted/30 border rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <History className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Latest Agent Action:</span>
            <span className="text-muted-foreground">{actionLedger[0].description}</span>
          </div>
          <button
            onClick={() => onRollbackAction(actionLedger[0].id)}
            className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo Action
          </button>
        </div>
      )}
    </div>
  );
};
export default AIWorkspace;
