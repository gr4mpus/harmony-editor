import { FAMILY_NAMES, SLOT_HUES, cssRgb } from '../lib/color';
import type { ColourCluster, HarmonyResult } from '../types';

const polar = (angle: number, r: number): [number, number] => {
  const t = ((angle - 90) * Math.PI) / 180;
  return [r * Math.cos(t), r * Math.sin(t)];
};

interface ColourWheelProps {
  clusters: ColourCluster[];
  harmony: HarmonyResult | null;
  active: number;
}

/** 12-slot artist's wheel. Detected colours are dots sized by how much of the photo they cover. */
export function ColourWheel({ clusters, harmony, active }: ColourWheelProps) {
  const present = new Set(clusters.map((c) => c.family));
  const groups = harmony?.groups ?? [];
  return (
    <svg viewBox="-80 -80 160 160" width={130} height={130} role="img" aria-label="Colour wheel with the detected colours">
      {SLOT_HUES.map((hue, i) => {
        const [x0, y0] = polar(i * 30 - 15, 72), [x1, y1] = polar(i * 30 + 15, 72);
        const [x2, y2] = polar(i * 30 + 15, 50), [x3, y3] = polar(i * 30 - 15, 50);
        return (
          <path
            key={i}
            d={`M${x0} ${y0}A72 72 0 0 1 ${x1} ${y1}L${x2} ${y2}A50 50 0 0 0 ${x3} ${y3}Z`}
            fill={`hsl(${hue},70%,55%)`}
            opacity={present.has(i) ? 1 : 0.2}
            stroke="#18191c"
            strokeWidth={1.5}
          >
            <title>{FAMILY_NAMES[i]}</title>
          </path>
        );
      })}
      {groups.length > 1 &&
        (() => {
          const pts = groups.map((g) => polar(g.angle, 44).join(',')).join(' ');
          const props = { points: pts, fill: 'none', stroke: '#ebe8e2', strokeWidth: 1.5, strokeDasharray: '3 3' };
          return groups.length > 2 ? <polygon {...props} /> : <polyline {...props} />;
        })()}
      {clusters.map((c, i) => {
        const [x, y] = polar(c.wheel, 61);
        return (
          <circle key={i} cx={x} cy={y} r={Math.min(12, 4 + c.share * 30)} fill={cssRgb(c.rgb)} stroke={i === active ? '#e6b45e' : '#fff'} strokeWidth={2} />
        );
      })}
    </svg>
  );
}
