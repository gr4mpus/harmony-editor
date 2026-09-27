import type { CSSProperties } from 'react';

interface SliderProps {
  id: string;
  label: string;
  /** -1…1 */
  value: number;
  onChange: (value: number) => void;
  /** Called when the user lets go, so the change can be added to undo history. */
  onCommit: () => void;
  /** Double-click resets to 0. */
  onReset: () => void;
  disabled?: boolean;
  /** CSS background for the track, e.g. a grey-to-colour gradient. */
  track?: string;
}

/** A -100…+100 slider that reports -1…1. */
export function Slider({ id, label, value, onChange, onCommit, onReset, disabled, track }: SliderProps) {
  return (
    <input
      type="range"
      id={id}
      min={-100}
      max={100}
      step={1}
      value={Math.round(value * 100)}
      aria-label={label}
      disabled={disabled}
      style={track ? ({ '--track': track } as CSSProperties) : undefined}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
      onDoubleClick={onReset}
    />
  );
}
