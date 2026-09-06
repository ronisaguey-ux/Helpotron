/* ────────────────────────────────────────────────────────────────────────────
 * ToastContainer.jsx — Global Toast Stack Manager (Stitch v6 / §3.22)
 * Listens to helpotron:toast events dispatched by showToast / toast.*
 * Maintains a luminous glass stack (max 3 toasts, 4s duration, role="status").
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import Toast from './Toast.jsx';
import { TOAST_EVENT } from '../../lib/overlay.js';

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToastEvent = (e) => {
      if (!e.detail) return;
      const { id, title, message, variant = 'info', duration = 4000 } = e.detail;

      setToasts((prev) => {
        // Keep max 3 toasts: drop oldest if needed
        const next = [...prev, { id, title, message, variant, duration }];
        return next.slice(-3);
      });

      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    };

    window.addEventListener(TOAST_EVENT, handleToastEvent);
    return () => window.removeEventListener(TOAST_EVENT, handleToastEvent);
  }, []);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      role="region"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast
            id={t.id}
            title={t.title}
            message={t.message}
            variant={t.variant}
            onDismiss={dismissToast}
          />
        </div>
      ))}
    </div>
  );
}
