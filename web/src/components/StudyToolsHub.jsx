// Contextual Study Tools Module (Embedded inside Assignment Workspaces)
import React from 'react';
import { HelpCircle, BrainCircuit, FileText, CheckSquare, Sparkles, BookOpen, Calculator } from 'lucide-react';

export const ContextualStudyTools = ({ assignment, onLaunchTool }) => {
  const TOOLS = [
    { id: 'explain', title: 'Explain Concept', icon: HelpCircle, desc: 'Step-by-step conceptual breakdown' },
    { id: 'quiz_me', title: 'Quiz Me', icon: BrainCircuit, desc: 'Interactive practice quiz against rubric' },
    { id: 'flashcards', title: 'Flashcards', icon: BookOpen, desc: 'FSRS-scheduled memory cards' },
    { id: 'rubric_check', title: 'Rubric Checker', icon: CheckSquare, desc: 'Verify draft against grading criteria' }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.id}
            onClick={() => onLaunchTool(tool.id, assignment.id)}
            className="p-3 rounded-lg border bg-card hover:bg-accent/50 text-left transition-colors space-y-1"
          >
            <div className="flex items-center gap-2 text-primary">
              <Icon className="h-4 w-4" />
              <span className="text-xs font-semibold text-foreground">{tool.title}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{tool.desc}</p>
          </button>
        );
      })}
    </div>
  );
};
export default ContextualStudyTools;

export { ContextualStudyTools as StudyToolsHub };
export default ContextualStudyTools;
