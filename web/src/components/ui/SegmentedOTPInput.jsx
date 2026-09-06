import React, { useRef, useEffect } from 'react';

/**
 * SegmentedOTPInput — LUMINOUS GLASS 6-Cell Segmented Passcode Input (Spec 3.2.3)
 * Features:
 * - 6 cells formatted with 3-3 split divider
 * - Auto-advance on digit input
 * - Backspace jumps back and clears previous cell
 * - Arrow left/right navigation
 * - Full clipboard paste-spread (pastes full 6-digit code across all cells)
 * - Error shake state + focused glow
 * - 44px+ min touch targets for mobile accessibility
 */
export default function SegmentedOTPInput({
  value = '',
  onChange,
  length = 6,
  error = false,
  disabled = false,
  autoFocus = true,
  className = '',
}) {
  const inputsRef = useRef([]);

  // Split current string value into array of characters
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, [autoFocus]);

  const setDigit = (index, char) => {
    const chars = [...digits];
    chars[index] = char;
    const newVal = chars.join('').replace(/\s+$/, '');
    onChange?.(newVal);
  };

  const handleChange = (e, index) => {
    const val = e.target.value;
    if (!val) {
      setDigit(index, '');
      return;
    }

    // Take the last character entered
    const lastChar = val.slice(-1);
    if (!/^[0-9]$/.test(lastChar)) return;

    const chars = [...digits];
    chars[index] = lastChar;
    const nextVal = chars.join('');
    onChange?.(nextVal);

    // Auto-advance to next empty cell
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
      inputsRef.current[index + 1]?.select();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Current cell is empty, clear and focus previous cell
        e.preventDefault();
        setDigit(index - 1, '');
        inputsRef.current[index - 1]?.focus();
      } else {
        // Clear current cell
        setDigit(index, '');
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    onChange?.(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  return (
    <div
      className={`flex items-center justify-center gap-1.5 sm:gap-2.5 select-none ${error ? 'animate-shake' : ''} ${className}`}
      onPaste={handlePaste}
      role="group"
      aria-label="One-Time Passcode Inputs"
    >
      {Array.from({ length }, (_, i) => {
        const isMiddleSplit = length === 6 && i === 3;
        return (
          <React.Fragment key={i}>
            {isMiddleSplit && (
              <span className="w-2 sm:w-3 h-0.5 bg-outline-variant/60 rounded-full mx-0.5 sm:mx-1 shrink-0" aria-hidden="true" />
            )}
            <input
              ref={(el) => (inputsRef.current[i] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digits[i]}
              disabled={disabled}
              onChange={(e) => handleChange(e, i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onFocus={(e) => e.target.select()}
              aria-label={`Digit ${i + 1} of ${length}`}
              className={[
                'w-10 sm:w-12 h-13 sm:h-14 text-center font-tabular-stat-lg text-lg sm:text-xl font-bold rounded-xl transition-all duration-150',
                'bg-surface-container-low text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                'focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed',
                error
                  ? 'border-2 border-error ring-2 ring-error/20'
                  : 'border border-outline-variant/40 focus:border-primary focus:ring-2 focus:ring-primary/30 shadow-[0_0_12px_rgba(120,245,229,0.15)]',
              ].join(' ')}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}
