import { useEffect, useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  /** decimals used when displaying the committed value */
  decimals?: number;
}

/**
 * Numeric input that keeps the raw text while the user edits (so "0" can be deleted and
 * intermediate states like "" or "1." are allowed) and commits only valid numbers.
 */
export function NumInput({ value, onChange, min, max, step, decimals }: Props) {
  // fixed decimals, then trim trailing zeros only after a decimal point (20 stays 20, 0.70 → 0.7)
  const fmt = (v: number) => (decimals !== undefined ? v.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : String(v));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(fmt(value)); }, [value, focused]);

  return (
    <input
      type="number" inputMode="decimal" min={min} max={max} step={step ?? 'any'}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setText(fmt(value)); }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === '') return;
        const n = Number(raw.replace(',', '.'));
        if (!Number.isFinite(n)) return;
        let v = n;
        if (min !== undefined && v < min) v = min;
        if (max !== undefined && v > max) v = max;
        onChange(v);
      }}
    />
  );
}
