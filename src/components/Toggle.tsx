import type { CSSProperties, ReactNode } from 'react';

interface ToggleProps {
  id?: string;
  label: ReactNode;
  note?: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Colour of the switch when on. */
  color?: string;
}

export function Toggle({ id, label, note, checked, onChange, disabled, color }: ToggleProps) {
  return (
    <label className="toggle" style={color ? ({ '--toggle-on': color } as CSSProperties) : undefined}>
      <div>
        {label}
        {note && <em>{note}</em>}
      </div>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="track" />
    </label>
  );
}
