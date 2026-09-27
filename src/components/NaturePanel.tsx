import { cssGrey, cssRgb, formatAmount } from '../lib/color';
import type { Region, ToneAdjust } from '../types';
import { Slider } from './Slider';
import { Toggle } from './Toggle';

interface AreaProps {
  id: string;
  title: string;
  region: Region | null;
  missing: string;
  value: ToneAdjust;
  toneLabels: [string, string];
  toneTrack: string;
  onChange: (value: ToneAdjust) => void;
  onCommit: () => void;
}

function AreaControl({ id, title, region, missing, value, toneLabels, toneTrack, onChange, onCommit }: AreaProps) {
  const has = !!region;
  const swatch = !region ? 'var(--line)' : region.rgb2 ? `linear-gradient(${cssRgb(region.rgb)},${cssRgb(region.rgb2)})` : cssRgb(region.rgb);
  return (
    <div className={`chip${has ? '' : ' off'}`}>
      <span className="swatch" style={{ background: swatch }} />
      <span className="chip-name">
        {title}
        <small>{region ? `${Math.max(1, Math.round(region.pct * 100))}% of photo` : missing}</small>
      </span>
      <span />
      <div className="row">
        <span>Intensity</span>
        <Slider
          id={`${id}-amount`}
          label={`${title} intensity`}
          value={value.amount}
          disabled={!has}
          track={region ? `linear-gradient(90deg,${cssGrey(region.rgb)},${cssRgb(region.rgb)})` : undefined}
          onChange={(v) => onChange({ ...value, amount: v })}
          onCommit={onCommit}
          onReset={() => { onChange({ ...value, amount: 0 }); onCommit(); }}
        />
        <span className="value">{formatAmount(value.amount)}</span>
      </div>
      <div className="row">
        <span>Tone</span>
        <Slider
          id={`${id}-tone`}
          label={`${title} tone, ${toneLabels[0].toLowerCase()} to ${toneLabels[1].toLowerCase()}`}
          value={value.tone}
          disabled={!has}
          track={toneTrack}
          onChange={(v) => onChange({ ...value, tone: v })}
          onCommit={onCommit}
          onReset={() => { onChange({ ...value, tone: 0 }); onCommit(); }}
        />
        <span className="value">{formatAmount(value.tone)}</span>
      </div>
      <div className="ends">
        <span>{toneLabels[0]}</span>
        <span>{toneLabels[1]}</span>
      </div>
    </div>
  );
}

interface NaturePanelProps {
  sky: Region | null;
  greenery: Region | null;
  skyValue: ToneAdjust;
  greeneryValue: ToneAdjust;
  onSky: (v: ToneAdjust) => void;
  onGreenery: (v: ToneAdjust) => void;
  onCommit: () => void;
  showAreas: boolean;
  onShowAreas: (v: boolean) => void;
}

export function NaturePanel(p: NaturePanelProps) {
  return (
    <section>
      <h2>Nature</h2>
      <div className="chips">
        <AreaControl
          id="sky"
          title="Sky"
          region={p.sky}
          missing="No sky found"
          value={p.skyValue}
          toneLabels={['Cooler', 'Warmer']}
          toneTrack="linear-gradient(90deg,#5d8fd6,#8a8f98,#e0a868)"
          onChange={p.onSky}
          onCommit={p.onCommit}
        />
        <AreaControl
          id="greenery"
          title="Greenery"
          region={p.greenery}
          missing="No greenery found"
          value={p.greeneryValue}
          toneLabels={['Golden', 'Lush']}
          toneTrack="linear-gradient(90deg,#b9a53f,#6f8f3c,#2f7a55)"
          onChange={p.onGreenery}
          onCommit={p.onCommit}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <Toggle
          id="show-areas"
          label="Show detected areas"
          note="Sky in blue, greenery in green, objects in amber"
          checked={p.showAreas}
          onChange={p.onShowAreas}
          color="var(--areas)"
        />
      </div>
    </section>
  );
}
