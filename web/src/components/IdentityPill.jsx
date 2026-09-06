/**
 * IdentityPill.jsx — Agent Persona Switcher & Identity Pill Trigger (Stitch v6 / §3.6.3).
 * Pure SVG glyphs, 44px rows, escape/click-outside dismissal, and guaranteed Coach fallback.
 */
import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, PenTool, HelpCircle, Sparkles, ChevronDown, Check, Plus, GraduationCap } from 'lucide-react';
import { PRESET_PERSONAS } from '../lib/agentPresets.js';

function getPersonaIcon(type, className = 'w-4 h-4') {
  switch (type) {
    case 'scholar':
      return <BookOpen className={className} />;
    case 'editor':
      return <PenTool className={className} />;
    case 'coach':
      return <HelpCircle className={className} />;
    default:
      return <GraduationCap className={className} />;
  }
}

export default function IdentityPill({
  identities = [],
  activeIdentityId = 'scholar',
  onSelectIdentity = () => {},
  onNewIdentity = () => {},
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Combine default presets with any custom user identities
  const allIdentities = [
    ...PRESET_PERSONAS,
    ...identities.filter((idItem) => !PRESET_PERSONAS.some((p) => p.id === idItem.id)),
  ];

  // Guaranteed fallback: never null (defaults to The Coach if not found)
  const activeIdentity =
    allIdentities.find((i) => i.id === activeIdentityId) ||
    PRESET_PERSONAS.find((p) => p.id === 'coach') ||
    PRESET_PERSONAS[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Identity Pill Trigger */}
      <button
        type="button"
        id="identity-pill-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Current Identity: ${activeIdentity.name}. Click to switch persona.`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="h-11 px-unit-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface flex items-center gap-micro-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {/* Custom Glyph Orb */}
        <div className="w-7 h-7 rounded-lg bg-secondary-container text-secondary flex items-center justify-center shrink-0 shadow-inner">
          {getPersonaIcon(activeIdentity.iconType || activeIdentity.id, 'w-4 h-4')}
        </div>
        <div className="flex flex-col text-left">
          <span className="font-code-sm text-[10px] text-outline uppercase tracking-wider leading-none">
            IDENTITY
          </span>
          <span className="font-body-sm text-body-sm font-semibold text-on-surface leading-tight mt-0.5 truncate max-w-[140px] sm:max-w-[180px]">
            {activeIdentity.name}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-on-surface-variant transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Identity Popover Dropdown Menu */}
      {open && (
        <div
          role="menu"
          aria-labelledby="identity-pill-btn"
          className="absolute right-0 top-13 w-72 rounded-xl bg-surface-container-lowest/95 backdrop-blur-xl border border-outline-variant/30 shadow-2xl p-unit-2 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-unit-3 py-1.5 border-b border-outline-variant/15">
            <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
              Select Active Agent Persona
            </span>
          </div>

          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pt-1">
            {allIdentities.map((persona) => {
              const isSelected = persona.id === activeIdentity.id;
              return (
                <button
                  key={persona.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onSelectIdentity(persona.id);
                    setOpen(false);
                  }}
                  className={`min-h-[44px] flex items-center justify-between p-unit-2 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 text-on-surface border border-primary/20'
                      : 'hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-micro-2 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-highest text-on-surface-variant'
                      }`}
                    >
                      {getPersonaIcon(persona.iconType || persona.id, 'w-4 h-4')}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`font-body-sm text-body-sm font-semibold truncate ${
                          isSelected ? 'text-primary' : 'text-on-surface'
                        }`}
                      >
                        {persona.name}
                      </p>
                      <p className="font-code-sm text-[11px] text-outline truncate">
                        {persona.tagline || persona.description || 'Custom Persona'}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="h-px bg-surface-container-highest my-1" />

          {/* Action: New Identity */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNewIdentity();
            }}
            className="min-h-[44px] flex items-center gap-micro-2 p-unit-2 rounded-lg hover:bg-surface-container-high text-primary font-label-caps text-label-caps uppercase transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-primary shrink-0" />
            <span>+ New Identity</span>
          </button>
        </div>
      )}
    </div>
  );
}
