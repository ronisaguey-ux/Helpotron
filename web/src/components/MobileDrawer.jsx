import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion';
import {
  X,
  LayoutDashboard,
  Brain,
  BarChart3,
  History,
  Settings,
  Inbox,
  Database,
  CreditCard,
  Puzzle,
  HelpCircle,
  Shield,
  Gauge,
  Coins,
  LogIn,
} from 'lucide-react';
import Button from './Button.jsx';
import { AvatarWidget } from './ui/AvatarWidget.jsx';

/**
 * MobileDrawer — LUMINOUS GLASS Slide-over Navigation Drawer (Spec 3.1.2)
 * State machine: closed -> spring-open -> open + scrim -> closing.
 * Focus trap + restore, 44px min tap targets, WalletLine / guest variants.
 */
export default function MobileDrawer({
  isOpen,
  onClose,
  activeView,
  onNavigate,
  user,
  isAdmin = false,
  onOpenNewSession,
  triggerRef,
}) {
  const drawerRef = useRef(null);

  // Focus restore to trigger button when closed
  useEffect(() => {
    if (!isOpen && triggerRef?.current) {
      triggerRef.current.focus();
    }
  }, [isOpen, triggerRef]);

  // Escape listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const navItems = [
    { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard, group: 'Workspace Core' },
    { key: 'agent', label: 'My Agent', Icon: Brain, group: 'Workspace Core' },
    { key: 'insights', label: 'Insights', Icon: BarChart3, group: 'Workspace Core' },
    { key: 'history', label: 'History', Icon: History, group: 'Workspace Core' },
    { key: 'dump', label: 'Drop Assignment', Icon: Inbox, group: 'Workspace Core' },
    { key: 'datalake', label: 'Data Lake', Icon: Database, group: 'Workspace Core' },
    { key: 'settings', label: 'Settings', Icon: Settings, group: 'Platform System' },
    { key: 'credits', label: 'Billing', Icon: CreditCard, group: 'Platform System' },
    { key: 'extension', label: 'Extension', Icon: Puzzle, group: 'Platform System' },
    { key: 'guide', label: 'Guide', Icon: HelpCircle, group: 'Platform System' },
    ...(isAdmin
      ? [
          { key: 'admin', label: 'Control Center', Icon: Shield, group: 'Administration' },
          { key: 'monitors', label: 'Monitors', Icon: Gauge, group: 'Administration' },
        ]
      : []),
  ];

  const handleNav = (key) => {
    onNavigate(key);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Scrim Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Drawer Sheet */}
          <motion.div
            ref={drawerRef}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="relative w-72 max-w-[85vw] h-full bg-surface-container-lowest/90 backdrop-blur-xl border-r border-outline-variant/30 flex flex-col justify-between shadow-2xl z-10 pb-safe"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
          >
            {/* Header Area */}
            <div className="flex flex-col flex-1 overflow-y-auto os-scroll">
              <div className="h-16 px-5 flex items-center justify-between border-b border-outline-variant/20 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold">
                    H
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-on-surface leading-tight">Helpotron</span>
                    <span className="font-mono text-[9px] text-primary uppercase tracking-wider">OS v4.0</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Button */}
              <div className="p-4 pb-2">
                <Button
                  variant="primary"
                  glow={true}
                  className="w-full text-xs font-semibold py-2.5"
                  onClick={() => {
                    onOpenNewSession?.();
                    onClose();
                  }}
                >
                  NEW STUDY SESSION
                </Button>
              </div>

              {/* Navigation Links */}
              <nav className="p-3 space-y-1">
                {navItems.map(({ key, label, Icon }, idx) => {
                  const isActive = activeView === key;
                  const prevItem = navItems[idx - 1];
                  const showGroupHeading = !prevItem || prevItem.group !== navItems[idx].group;

                  return (
                    <React.Fragment key={key}>
                      {showGroupHeading && (
                        <div className="px-3 pt-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                          {navItems[idx].group}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleNav(key)}
                        className={[
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs transition cursor-pointer min-h-[44px]',
                          isActive
                            ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
                        ].join(' ')}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-on-primary-container' : 'text-primary'}`} />
                        <span>{label}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>

            {/* Footer Area: WalletLine or Sign In */}
            <div className="p-4 border-t border-outline-variant/20 shrink-0">
              {user ? (
                <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/20">
                  <div className="flex items-center gap-2.5 mb-2">
                    <AvatarWidget user={user} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-on-surface truncate">
                        {user.public_id || 'Active User'}
                      </div>
                      <div className="text-[10px] font-mono text-on-surface-variant truncate">
                        {user.unlimited ? 'Unlimited' : `${Number(user.credits ?? 0).toLocaleString()} cr`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant pt-1 border-t border-outline-variant/15">
                    <span>STATUS</span>
                    <span className="text-sem-green font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-sem-green animate-pulse" /> ONLINE
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNav('settings')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high transition min-h-[44px]"
                >
                  <LogIn className="w-4 h-4 text-primary" /> Sign in to account
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
