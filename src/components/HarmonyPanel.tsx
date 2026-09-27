import { HARMONY_INFO } from '../lib/harmony';
import type { ColourCluster, HarmonyResult } from '../types';
import { ColourWheel } from './ColourWheel';

interface HarmonyPanelProps {
  clusters: ColourCluster[];
  harmony: HarmonyResult | null;
  active: number;
}

export function HarmonyPanel({ clusters, harmony, active }: HarmonyPanelProps) {
  const pct = Math.round((harmony?.confidence ?? 0) * 100);
  return (
    <section>
      <h2>Colour harmony</h2>
      <div className="harmony-row">
        <ColourWheel clusters={clusters} harmony={harmony} active={active} />
        <div>
          <p className="harmony-name">{harmony?.type ?? '–'}</p>
          <div className="confidence">{pct ? `Confidence ${pct}%` : ''}</div>
          <div className="meter"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      <p className="harmony-desc">{harmony ? HARMONY_INFO[harmony.type] : ''}</p>
    </section>
  );
}
