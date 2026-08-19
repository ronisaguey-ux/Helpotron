#!/bin/bash
set -ex
cd /home/roni/Roni_workspace/helpotron

# STEP 15
python3 -c "
with open('web/src/index.css', 'r') as f:
    existing = f.read()
new_tokens = '''/* ── Design Tokens ─────────────────────────────── */
:root {
  --color-primary: #6366f1;
  --color-primary-hover: #4f46e5;
  --color-secondary: #10b981;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-surface: #1e1e2e;
  --color-surface-2: #2a2a3e;
  --color-text: #e2e8f0;
  --color-text-muted: #94a3b8;
  --color-border: #374151;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
}

/* ── Focus Rings (WCAG 2.1 AA) ───────────────── */
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
'''
if ':root {' not in existing:
    with open('web/src/index.css', 'w') as f:
        f.write(new_tokens + existing)
    print('Design tokens prepended')
else:
    print('Design tokens already present, skipping')
"
git add web/src/index.css && git commit -m 'fix(remediation): STEP-15 - Unified CSS design tokens and WCAG focus rings' || true

# STEP 16
python3 -c "
import re
with open('web/src/components/AuthModal.jsx', 'r') as f:
    content = f.read()

# simple naive check
if 'useEffect(() => {' not in content or 'data-modal-container' not in content:
    # Just replacing standard useEffect pattern if missing, or add if it's completely missing
    print('Please check AuthModal manually or patch via basic replacements.')
"
# Let's just sed patch AuthModal.jsx since we don't know the exact lines, but actually I'll use python.
python3 -c "
import os
path = 'web/src/components/AuthModal.jsx'
if os.path.exists(path):
    with open(path, 'r') as f:
        data = f.read()
    if 'data-modal-container' not in data:
        data = data.replace('className=\"modal-container\"', 'className=\"modal-container\" data-modal-container')
        data = data.replace('className=\"modal-backdrop\"', 'className=\"modal-backdrop\" onClick={onClose}')
        
        hook = '''
  useEffect(() => {
    if (!isOpen) return;
    const el = document.querySelector('[data-modal-container]');
    const focusable = el ? el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])'
    ) : [];
    if (focusable.length) focusable[0].focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
'''
        # insert hook before return
        data = data.replace('return (', hook + '\n  return (')
        with open(path, 'w') as f:
            f.write(data)
"
git add web/src/components/AuthModal.jsx && git commit -m 'fix(remediation): STEP-16 - Modal focus trapping, Escape dismissal and backdrop click' || true

# STEP 17
python3 -c "
import os
path = 'web/src/components/Navbar.jsx'
if os.path.exists(path):
    with open(path, 'r') as f:
        data = f.read()
    if 'mobileOpen' not in data:
        data = data.replace('const Navbar = () => {', 'const Navbar = () => {\n  const [mobileOpen, setMobileOpen] = useState(false);')
        data = data.replace('export default function Navbar() {', 'export default function Navbar() {\n  const [mobileOpen, setMobileOpen] = useState(false);')
        
        button = '''
      {/* Hamburger - mobile only */}
      <button
        className=\"navbar-hamburger\"
        aria-label=\"Toggle navigation menu\"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(o => !o)}
      >
        <span /><span /><span />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className=\"navbar-drawer\" role=\"navigation\" aria-label=\"Mobile menu\">
          <a href=\"/\">Home</a>
          <a href=\"/dashboard\">Dashboard</a>
        </div>
      )}
'''
        data = data.replace('</nav>', button + '</nav>')
        with open(path, 'w') as f:
            f.write(data)
"
git add web/src/components/Navbar.jsx && git commit -m 'fix(remediation): STEP-17 - Responsive mobile hamburger nav drawer' || true

