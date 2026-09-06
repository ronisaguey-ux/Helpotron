import React from 'react';
import {
  Ruler,
  BookOpen,
  Landmark,
  Code2,
  Dna,
  Brain,
  Atom,
  Calculator,
  FlaskConical,
  Microscope,
  Compass,
  Orbit,
  GraduationCap,
  Layers,
} from 'lucide-react';

export const SUBJECT_GLYPHS = {
  Ruler,
  BookOpen,
  Landmark,
  Code2,
  Dna,
  Brain,
  Atom,
  Calculator,
  FlaskConical,
  Microscope,
  Compass,
  Orbit,
};

const COLOR_MAP = {
  amber: {
    bg: 'bg-sem-amber/15',
    text: 'text-sem-amber',
    glow: 'shadow-[0_0_16px_rgba(245,158,11,0.22)]',
    border: 'border-sem-amber/30',
  },
  blue: {
    bg: 'bg-sem-blue/15',
    text: 'text-sem-blue',
    glow: 'shadow-[0_0_16px_rgba(59,130,246,0.22)]',
    border: 'border-sem-blue/30',
  },
  green: {
    bg: 'bg-sem-green/15',
    text: 'text-sem-green',
    glow: 'shadow-[0_0_16px_rgba(16,185,129,0.22)]',
    border: 'border-sem-green/30',
  },
  cyan: {
    bg: 'bg-sem-cyan/15',
    text: 'text-sem-cyan',
    glow: 'shadow-[0_0_16px_rgba(6,182,212,0.22)]',
    border: 'border-sem-cyan/30',
  },
  indigo: {
    bg: 'bg-sem-indigo/15',
    text: 'text-sem-indigo',
    glow: 'shadow-[0_0_16px_rgba(99,102,241,0.22)]',
    border: 'border-sem-indigo/30',
  },
  deepgreen: {
    bg: 'bg-sem-deepgreen/15',
    text: 'text-sem-deepgreen',
    glow: 'shadow-[0_0_16px_rgba(5,150,105,0.22)]',
    border: 'border-sem-deepgreen/30',
  },
  purple: {
    bg: 'bg-secondary/15',
    text: 'text-secondary',
    glow: 'shadow-[0_0_16px_rgba(168,85,247,0.22)]',
    border: 'border-secondary/30',
  },
  slate: {
    bg: 'bg-sem-slate/15',
    text: 'text-sem-slate',
    glow: 'shadow-[0_0_16px_rgba(100,116,139,0.22)]',
    border: 'border-sem-slate/30',
  },
};

/**
 * SubjectTile Component — 48px Tinted Orb Tile (§3.4.1 & §3.4.5)
 *
 * Renders a 48px tinted orb with calibrated semantic background,
 * soft luminescence glow, and 24px Lucide glyph.
 */
export default function SubjectTile({
  icon = 'BookOpen',
  color = 'blue',
  size = 48,
  className = '',
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;

  // Resolve Lucide Icon Component
  let IconComponent = null;
  if (typeof icon === 'string') {
    // Check direct name match
    if (SUBJECT_GLYPHS[icon]) {
      IconComponent = SUBJECT_GLYPHS[icon];
    } else {
      // Map legacy emojis or common names to Lucide icons
      const s = icon.trim();
      if (s === '📐') IconComponent = Ruler;
      else if (s === '📖' || s === '📚') IconComponent = BookOpen;
      else if (s === '🏛️') IconComponent = Landmark;
      else if (s === '💻') IconComponent = Code2;
      else if (s === '🧬') IconComponent = Dna;
      else if (s === '🧠') IconComponent = Brain;
      else if (s === '⚛️') IconComponent = Atom;
      else if (s === '🔬' || s === '🧪') IconComponent = FlaskConical;
      else if (s === '📝') IconComponent = BookOpen;
      else if (s === '🫧') IconComponent = Orbit;
      else {
        // Find case-insensitive
        const key = Object.keys(SUBJECT_GLYPHS).find(
          (k) => k.toLowerCase() === s.toLowerCase()
        );
        IconComponent = key ? SUBJECT_GLYPHS[key] : GraduationCap;
      }
    }
  } else if (React.isValidElement(icon)) {
    return (
      <div
        className={`w-12 h-12 rounded-xl ${c.bg} ${c.text} ${c.glow} border ${c.border} flex items-center justify-center shrink-0 ${className}`}
      >
        {icon}
      </div>
    );
  } else {
    IconComponent = Layers;
  }

  return (
    <div
      className={`w-12 h-12 rounded-xl ${c.bg} ${c.text} ${c.glow} border ${c.border} flex items-center justify-center shrink-0 transition-transform ${className}`}
      aria-hidden="true"
    >
      <IconComponent className="w-6 h-6 stroke-[1.75]" />
    </div>
  );
}
