import { MAX_OBJECTS } from '../config';
import { cssGrey, cssRgb, formatAmount } from '../lib/color';
import type { SelectedObject } from '../types';
import { Slider } from './Slider';

interface ObjectsPanelProps {
  objects: SelectedObject[];
  amounts: Record<number, number>;
  active: number;
  onChange: (id: number, value: number) => void;
  onCommit: () => void;
  onRemove: (id: number) => void;
  onHover: (id: number) => void;
}

export function ObjectsPanel({ objects, amounts, active, onChange, onCommit, onRemove, onHover }: ObjectsPanelProps) {
  return (
    <section>
      <h2>
        Objects <span>{objects.length ? `${objects.length} / ${MAX_OBJECTS}` : ''}</span>
      </h2>
      <div className="chips">
        {!objects.length && <p className="empty">No objects selected yet.</p>}
        {objects.map((o, k) => {
          const v = amounts[o.id] ?? 0;
          return (
            <div
              key={o.id}
              className={`chip${o.id === active ? ' active' : ''}`}
              onPointerEnter={() => onHover(o.id)}
              onPointerLeave={() => onHover(-1)}
            >
              <span className="swatch" style={{ background: cssRgb(o.rgb) }} />
              <span className="chip-name">
                Object {k + 1}
                <small>
                  {o.name} · {Math.max(1, Math.round(o.pct * 100))}%{o.ai ? '' : ' · by colour'}
                </small>
              </span>
              <span className="chip-actions">
                <span className="value">{formatAmount(v)}</span>
                <button className="remove" aria-label={`Remove object ${k + 1}`} title="Remove" onClick={() => onRemove(o.id)}>
                  ×
                </button>
              </span>
              <Slider
                id={`object-${o.id}`}
                label={`Object ${k + 1} intensity`}
                value={v}
                track={`linear-gradient(90deg,${cssGrey(o.rgb)},${cssRgb(o.rgb)})`}
                onChange={(nv) => onChange(o.id, nv)}
                onCommit={onCommit}
                onReset={() => { onChange(o.id, 0); onCommit(); }}
              />
            </div>
          );
        })}
      </div>
      <p className="hint">
        Choose the Object tool, then click anything in the photo (a car, a shirt, a flower) to select it. You can select up to{' '}
        {MAX_OBJECTS} objects.
      </p>
    </section>
  );
}
