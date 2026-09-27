import { useRef } from 'react';
import type { Tool } from '../types';

interface TopBarProps {
  tool: Tool;
  onTool: (tool: Tool) => void;
  onOpenFile: (file: File) => void;
  onSample: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  split: boolean;
  onToggleSplit: () => void;
  onHoldOriginal: (show: boolean) => void;
  onExport: (type: 'image/jpeg' | 'image/png') => void;
}

export function TopBar(p: TopBarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <header className="topbar">
      <div className="brand">
        <i aria-hidden="true" />
        Harmony
      </div>
      <div className="group">
        <button className="btn primary" onClick={() => fileInput.current?.click()}>Open photo</button>
        <button className="btn" onClick={p.onSample}>Sample</button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onOpenFile(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="seg" role="group" aria-label="Tool">
        <button aria-pressed={p.tool === 'colour'} title="Drag on a colour to change it everywhere (C)" onClick={() => p.onTool('colour')}>Colour</button>
        <button aria-pressed={p.tool === 'object'} title="Click an object to select it (O)" onClick={() => p.onTool('object')}>Object</button>
      </div>
      <div className="group">
        <button className="btn" disabled={!p.canUndo} title="Undo (Ctrl+Z)" onClick={p.onUndo}>Undo</button>
        <button className="btn" disabled={!p.canRedo} title="Redo (Ctrl+Shift+Z)" onClick={p.onRedo}>Redo</button>
        <button className="btn" onClick={p.onReset}>Reset all</button>
      </div>
      <div className="group">
        <button className={`btn${p.split ? ' on' : ''}`} aria-pressed={p.split} onClick={p.onToggleSplit}>Split view</button>
        <button
          className="btn"
          title="Hold to see the original (or hold the \ key)"
          onPointerDown={() => p.onHoldOriginal(true)}
          onPointerUp={() => p.onHoldOriginal(false)}
          onPointerLeave={() => p.onHoldOriginal(false)}
          onPointerCancel={() => p.onHoldOriginal(false)}
        >
          Hold for original
        </button>
      </div>
      <div className="group">
        <button className="btn" onClick={() => p.onExport('image/jpeg')}>Export JPG</button>
        <button className="btn" onClick={() => p.onExport('image/png')}>PNG</button>
      </div>
    </header>
  );
}
