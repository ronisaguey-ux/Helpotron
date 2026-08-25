// Complete Assignment Workspace with Subagent Team, Task Graph & Context Dock
import React, { useState } from 'react';
import { Users, CheckCircle2, Circle, Clock, MessageSquare, Paperclip, Send, BookOpen, Brain, Sparkles, AlertCircle } from 'lucide-react';

export const AssignmentWorkspace = ({ assignment, user, onSendMessage, onAttachFile }) => {
  const [activeTab, setActiveTab] = useState('workspace'); // workspace, team, tasks, study, context
  const [chatMessage, setChatMessage] = useState('');

  const SUBAGENTS = [
    { role: 'Researcher', status: 'COMPLETE', currentTask: '12 primary sources indexed', progress: 100 },
    { role: 'Source Analyst', status: 'WORKING', currentTask: 'Evaluating citation credibility', progress: 65 },
    { role: 'Academic Writer', status: 'WORKING', currentTask: 'Drafting section 2 (Methodology)', progress: 40 },
    { role: 'Reviewer & QA', status: 'WAITING', currentTask: 'Waiting for draft completion', progress: 0 }
  ];

  const TASKS = [
    { id: 1, title: 'Parse assignment rubric & requirements', status: 'DONE' },
    { id: 2, title: 'Extract key concepts from uploaded lecture notes', status: 'DONE' },
    { id: 3, title: 'Build evidence synthesis map', status: 'IN_PROGRESS' },
    { id: 4, title: 'Draft structured response', status: 'IN_PROGRESS' },
    { id: 5, title: 'Review citations & verify against rubric', status: 'PENDING' }
  ];

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto p-6 space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{assignment.title}</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">{assignment.course_code || 'BIO-201'}</span>
          </div>
          <p className="text-xs text-muted-foreground">Due: {assignment.due_date || 'Tomorrow, 11:59 PM'} • Teacher: {assignment.teacher_name || 'Dr. Smith'}</p>
        </div>

        {/* Best Next Action Banner */}
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 px-4 py-2 rounded-lg">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-foreground">Recommended Next Action:</span>{' '}
            <span className="text-muted-foreground">Review evidence synthesis map before draft generation.</span>
          </div>
          <button className="text-xs font-semibold px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            Do it
          </button>
        </div>
      </div>

      {/* Subagent Team Live Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {SUBAGENTS.map((agent) => (
          <div key={agent.role} className="p-3 rounded-lg border bg-card/60 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{agent.role}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                agent.status === 'COMPLETE' ? 'bg-emerald-500/10 text-emerald-500' :
                agent.status === 'WORKING' ? 'bg-blue-500/10 text-blue-500' : 'bg-muted text-muted-foreground'
              }`}>
                {agent.status}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{agent.currentTask}</p>
            <div className="w-full bg-muted rounded-full h-1">
              <div className="bg-primary h-1 rounded-full transition-all duration-300" style={{ width: `${agent.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export { AssignmentWorkspace as AssignmentDetailView };
export default AssignmentWorkspace;

