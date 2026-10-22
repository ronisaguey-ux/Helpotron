import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Inbox, Library as LibraryIcon, Brain } from 'lucide-react';

/**
 * MobileBottomBar — Four core destinations, always visible (DIRECTION #31).
 * Destinations: Dashboard / Dump / Library / My Agent
 * Touch targets >= 44px, safe area padding.
 */
export default function MobileBottomBar({
  activeView,
  onNavigate,
  hasPendingReview = false,
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const SLOTS = [
    { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard, hasBadge: hasPendingReview },
    { key: 'dump', label: 'Dump', Icon: Inbox },
    { key: 'library', label: 'Library', Icon: LibraryIcon },
    { key: 'agent', label: 'My Agent', Icon: Brain },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className={[
        'fixed bottom-0 left-0 right-0 z-40 lg:hidden',
        'bg-surface-container-lowest/85 backdrop-blur-xl',
        'border-t border-outline-variant/20',
        scrolled ? 'shadow-[0_-4px_16px_rgba(0,0,0,0.3)]' : '',
        'pb-safe select-none transition-shadow duration-200',
      ].filter(Boolean).join(' ')}
    >
      <div className="grid grid-cols-4 h-14 max-w-md mx-auto items-center px-2">
        {SLOTS.map(({ key, label, Icon, hasBadge }) => {
          const isActive = activeView === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              className={[
                'relative flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer min-h-[44px] min-w-[44px] py-1',
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-on-surface-variant'}`} />
                {hasBadge && (
                  <span
                    className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-sem-amber ring-2 ring-background"
                    title="Action pending review"
                    aria-label="Pending review"
                  />
                )}
              </div>
              <span className="text-[10px] font-medium leading-none tracking-tight">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
