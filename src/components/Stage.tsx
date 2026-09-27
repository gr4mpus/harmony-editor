import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cssRgb, formatAmount } from '../lib/color';
import type { RGB, Tool } from '../types';

/** Something the user can drag to change: a colour family or a selected object. */
export interface DragTarget {
  label: string;
  rgb: RGB;
  /** Value when the drag started, -1…1. */
  start: number;
}

export type TargetResult<T extends DragTarget> = T | { message: string };

const isMessage = <T extends DragTarget>(r: TargetResult<T>): r is { message: string } => 'message' in r;

interface StageProps<T extends DragTarget> {
  imageSize: { width: number; height: number } | null;
  workSize: { width: number; height: number } | null;
  tool: Tool;
  split: number;
  onSplit: (value: number) => void;
  busy: string | null;
  error: string | null;
  onDismissError: () => void;
  dropActive: boolean;
  onCanvas: (canvas: HTMLCanvasElement | null) => void;
  /** Called with the canvas's drawing-buffer size whenever the layout changes. */
  onResize: (width: number, height: number) => void;
  /** Works out what is under the pointer (may be async, e.g. AI object selection). */
  resolveTarget: (px: number, py: number) => Promise<TargetResult<T>> | TargetResult<T>;
  onDragValue: (target: T, value: number) => void;
  onDragEnd: (target: T) => void;
}

interface Label { x: number; y: number; text: string; rgb?: RGB }

export function Stage<T extends DragTarget>(p: StageProps<T>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [label, setLabel] = useState<Label | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{ target: T; x: number; y: number } | null>(null);
  const session = useRef<{ released: boolean; x: number; y: number; lx: number; ly: number } | null>(null);
  const busyPick = useRef(false);

  // Fit the photo inside the stage, keeping its aspect ratio
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !p.imageSize) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const pw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ph = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const s = Math.min(pw / p.imageSize!.width, ph / p.imageSize!.height);
      const width = Math.max(1, Math.floor(p.imageSize!.width * s)), height = Math.max(1, Math.floor(p.imageSize!.height * s));
      setBox({ width, height });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      p.onResize(Math.min(p.imageSize!.width, Math.round(width * dpr)), Math.min(p.imageSize!.height, Math.round(height * dpr)));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [p.imageSize]);

  const setCanvas = useCallback(
    (c: HTMLCanvasElement | null) => {
      canvasRef.current = c;
      p.onCanvas(c);
    },
    [],
  );

  const show = (l: Label | null, hideAfter?: number) => {
    window.clearTimeout(hideTimer.current);
    setLabel(l);
    if (hideAfter) hideTimer.current = window.setTimeout(() => { if (!drag.current) setLabel(null); }, hideAfter);
  };

  const locate = (e: ReactPointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const { width: w, height: h } = p.workSize!;
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    return {
      px: Math.min(w - 1, Math.max(0, Math.floor(u * w))),
      py: Math.min(h - 1, Math.max(0, Math.floor(v * h))),
      lx: e.clientX - r.left,
      ly: e.clientY - r.top,
      rect: r,
    };
  };

  const onPointerDown = async (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!p.workSize || busyPick.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = locate(e);
    const s = { released: false, x: e.clientX, y: e.clientY, lx: pos.lx, ly: pos.ly };
    session.current = s;
    if (p.tool === 'object') show({ x: pos.lx, y: pos.ly, text: 'Selecting object…' });
    busyPick.current = true;
    let res: TargetResult<T>;
    try {
      res = await p.resolveTarget(pos.px, pos.py);
    } finally {
      busyPick.current = false;
    }
    if (isMessage(res)) return show({ x: s.lx, y: s.ly, text: res.message }, 1600);
    const text = `${res.label} ${formatAmount(res.start)}`;
    if (s.released) return show({ x: s.lx, y: s.ly, text, rgb: res.rgb }, 1200);
    // Start dragging from wherever the pointer is now
    drag.current = { target: res, x: s.x, y: s.y };
    show({ x: s.lx, y: s.ly, text, rgb: res.rgb });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (session.current && !session.current.released) {
      const r = canvasRef.current!.getBoundingClientRect();
      Object.assign(session.current, { x: e.clientX, y: e.clientY, lx: e.clientX - r.left, ly: e.clientY - r.top });
    }
    const d = drag.current;
    if (!d) return;
    const pos = locate(e);
    const span = Math.max(160, Math.min(pos.rect.width, pos.rect.height) * 0.6);
    // Right or up = stronger, left or down = weaker
    const raw = d.target.start + (e.clientX - d.x - (e.clientY - d.y)) / span;
    const value = Math.round(Math.max(-1, Math.min(1, raw)) * 100) / 100;
    p.onDragValue(d.target, value);
    show({ x: pos.lx, y: pos.ly, text: `${d.target.label} ${formatAmount(value)}`, rgb: d.target.rgb });
  };

  const onPointerUp = () => {
    if (session.current) session.current.released = true;
    const d = drag.current;
    drag.current = null;
    if (d) {
      p.onDragEnd(d.target);
      show(label, 250);
    }
  };

  const onSplitMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    p.onSplit(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  return (
    <div className="stage" ref={stageRef}>
      <div className={`frame${p.tool === 'object' ? ' object' : ''}`} style={{ width: box.width, height: box.height }}>
        <canvas
          ref={setCanvas}
          aria-label="Photo preview. In Colour mode, press and drag on a colour to change its intensity. In Object mode, click an object to select it, then drag."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {p.split >= 0 && (
          <>
            <div
              className="split"
              style={{ left: `calc(${p.split * 100}% - 1px)` }}
              onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerMove={onSplitMove}
            />
            <div className="tag" style={{ left: 10 }}>Before</div>
            <div className="tag" style={{ right: 10 }}>After</div>
          </>
        )}
        {p.tool === 'object' && <div className="mode-hint">Click an object to select it, then drag right or up to strengthen its colour</div>}
        {label && (
          <div className="float-label" style={{ left: label.x, top: label.y }}>
            {label.rgb && <b style={{ background: cssRgb(label.rgb) }} />}
            {label.text}
          </div>
        )}
      </div>
      {p.busy && (
        <div className="busy">
          <div className="spinner" />
          <div>{p.busy}</div>
        </div>
      )}
      {p.dropActive && <div className="drop">Drop your photo to open it</div>}
      {p.error && (
        <div className="error" role="alert">
          <span>{p.error}</span>
          <button aria-label="Dismiss" onClick={p.onDismissError}>×</button>
        </div>
      )}
    </div>
  );
}
