import { cssGrey, cssRgb, formatAmount } from '../lib/color';
import type { ColourCluster } from '../types';
import { Slider } from './Slider';

interface ColoursPanelProps {
  clusters: ColourCluster[];
  amounts: number[];
  active: number;
  onChange: (index: number, value: number) => void;
  onCommit: () => void;
}

export function ColoursPanel({ clusters, amounts, active, onChange, onCommit }: ColoursPanelProps) {
  return (
    <section>
      <h2>
        Colours in this photo <span>{clusters.length || ''}</span>
      </h2>
      <div className="chips">
        {!clusters.length && <p className="empty">No strong colours found outside the protected areas.</p>}
        {clusters.map((c, i) => (
          <div key={`${c.family}-${i}`} className={`chip${i === active ? ' active' : ''}`}>
            <span className="swatch" style={{ background: cssRgb(c.rgb) }} />
            <span className="chip-name">
              {c.name}
              <small>{Math.round(c.share * 100)}%</small>
            </span>
            <span className="value">{formatAmount(amounts[i] ?? 0)}</span>
            <Slider
              id={`colour-${i}`}
              label={`${c.name} intensity`}
              value={amounts[i] ?? 0}
              track={`linear-gradient(90deg,${cssGrey(c.rgb)},${cssRgb(c.rgb)})`}
              onChange={(v) => onChange(i, v)}
              onCommit={onCommit}
              onReset={() => { onChange(i, 0); onCommit(); }}
            />
          </div>
        ))}
      </div>
      <p className="hint">
        Drag a slider, or use the Colour tool: press on the photo and drag right or up to strengthen that colour, left or down
        to fade it. Double-click any slider to reset it.
      </p>
    </section>
  );
}
