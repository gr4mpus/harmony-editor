import { useCallback, useEffect, useRef, useState } from 'react';
import { ColoursPanel } from './components/ColoursPanel';
import { HarmonyPanel } from './components/HarmonyPanel';
import { NaturePanel } from './components/NaturePanel';
import { ObjectsPanel } from './components/ObjectsPanel';
import { PeoplePanel } from './components/PeoplePanel';
import { Stage, type DragTarget, type TargetResult } from './components/Stage';
import { TopBar } from './components/TopBar';
import { MAX_OBJECTS } from './config';
import { useHistory } from './hooks/useHistory';
import { familyName } from './lib/color';
import { nearestCluster } from './lib/colourAnalysis';
import { UnsupportedFileError, decodeFile, makeSamplePhoto, preparePhoto, type PhotoSource } from './lib/image';
import { loadObjectModel, loadPeopleModels } from './lib/models';
import { selectObject } from './lib/objects';
import { buildProtection } from './lib/people';
import { analysePhoto, type Analysis } from './lib/pipeline';
import { HarmonyRenderer } from './lib/webglRenderer';
import type { Adjustments, ModelStatus, SelectedObject, Tool, ToneAdjust, WorkImage } from './types';

type Target = DragTarget & ({ kind: 'colour'; index: number } | { kind: 'object'; id: number });

const emptyAdjustments = (colours: number, objects: SelectedObject[] = []): Adjustments => ({
  colours: Array(colours).fill(0),
  sky: { amount: 0, tone: 0 },
  greenery: { amount: 0, tone: 0 },
  objects: Object.fromEntries(objects.map((o) => [o.id, 0])),
});

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 16));

export default function App() {
  const renderer = useRef<HarmonyRenderer | null>(null);
  const [rendererReady, setRendererReady] = useState(false);

  // Large per-pixel data lives in refs; React state holds what the UI shows.
  const work = useRef<WorkImage | null>(null);
  const objectMasks = useRef(new Map<number, Float32Array>());
  const nextObjectId = useRef(1);

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [analysis, setAnalysisState] = useState<Analysis | null>(null);
  const analysisRef = useRef<Analysis | null>(null);
  const setAnalysis = (a: Analysis | null) => { analysisRef.current = a; setAnalysisState(a); };

  // Slider values. The ref is updated synchronously so undo commits always see the latest values.
  const [adj, setAdjState] = useState<Adjustments>(emptyAdjustments(0));
  const adjRef = useRef(adj);
  const updateAdj = useCallback((fn: (a: Adjustments) => Adjustments) => {
    adjRef.current = fn(adjRef.current);
    setAdjState(adjRef.current);
  }, []);
  const history = useHistory<Adjustments>();
  const commit = useCallback(() => history.commit(adjRef.current), [history]);

  const [objects, setObjectsState] = useState<SelectedObject[]>([]);
  const objectsRef = useRef<SelectedObject[]>([]);
  const setObjects = (list: SelectedObject[]) => { objectsRef.current = list; setObjectsState(list); };

  const [tool, setToolState] = useState<Tool>('colour');
  const toolRef = useRef<Tool>('colour');
  const [split, setSplit] = useState(-1);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [showProtected, setShowProtected] = useState(false);
  const [protectHair, setProtectHair] = useState(true);
  const [protectBody, setProtectBody] = useState(true);
  const protectOpts = useRef({ hair: true, bodySkin: true });
  protectOpts.current = { hair: protectHair, bodySkin: protectBody };

  const [busy, setBusy] = useState<string | null>('Loading…');
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('loading');
  const [activeColour, setActiveColour] = useState(-1);
  const [activeObject, setActiveObject] = useState(-1);
  const [hoverObject, setHoverObject] = useState(-1);
  const [flashObject, setFlashObject] = useState(-1);
  const flashTimer = useRef<number | undefined>(undefined);

  /* ---------- setup ---------- */
  useEffect(() => {
    loadPeopleModels().then((m) => setModelStatus((s) => (s === 'loading' ? (m ? 'ready' : 'fallback') : s)));
  }, []);

  const onCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || renderer.current) return;
    try {
      renderer.current = new HarmonyRenderer(canvas);
      setRendererReady(true);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'WebGL is not available in this browser.');
    }
  }, []);

  /* ---------- opening a photo ---------- */
  const openSource = useCallback(
    async (source: PhotoSource) => {
      const r = renderer.current;
      if (!r) return;
      setError(null);
      setBusy('Opening photo…');
      try {
        await nextFrame();
        const photo = preparePhoto(source, r.maxTextureSize);
        r.setImage(photo.full, photo.width, photo.height);
        r.clearMasks();
        work.current = photo.work;
        objectMasks.current = new Map();
        setObjects([]);
        setActiveColour(-1);
        setActiveObject(-1);
        setAnalysis(null);
        setImageSize({ width: photo.width, height: photo.height });

        const models = await loadPeopleModels();
        const a = await analysePhoto(photo.work, models, protectOpts.current, setBusy);
        if (models && !a.aiPeople) setModelStatus('fallback');
        const { width: w, height: h } = photo.work;
        r.setMasks(w, h, a.protection.protect, a.greenery?.mask ?? null, a.sky?.mask ?? null);
        r.setObjects(w, h, []);
        setAnalysis(a);
        const fresh = emptyAdjustments(a.clusters.length);
        updateAdj(() => fresh);
        history.reset(fresh);
      } catch (e) {
        console.error(e);
        setError(e instanceof UnsupportedFileError ? e.message : "This photo couldn't be opened. Try a JPG, PNG or WEBP file.");
      } finally {
        setBusy(null);
      }
    },
    [history, updateAdj],
  );

  const openFile = useCallback(
    async (file: File) => {
      try {
        await openSource(await decodeFile(file));
      } catch (e) {
        setError(e instanceof UnsupportedFileError ? e.message : "This photo couldn't be opened.");
      }
    },
    [openSource],
  );

  // Open the sample photo once WebGL is ready (guarded against React StrictMode's double run)
  const sampleOpened = useRef(false);
  useEffect(() => {
    if (!rendererReady || sampleOpened.current) return;
    sampleOpened.current = true;
    openSource(makeSamplePhoto());
  }, [rendererReady, openSource]);

  /* ---------- people protection toggles ---------- */
  useEffect(() => {
    const a = analysisRef.current, wk = work.current, r = renderer.current;
    if (!a || !wk || !r) return;
    const protection = buildProtection(wk, a.people, { hair: protectHair, bodySkin: protectBody });
    r.setMasks(wk.width, wk.height, protection.protect, a.greenery?.mask ?? null, a.sky?.mask ?? null);
    setAnalysis({ ...a, protection });
  }, [protectHair, protectBody]);

  /* ---------- drawing ---------- */
  useEffect(() => {
    const r = renderer.current;
    if (!r || !analysis) return;
    const objectAmounts: [number, number, number, number] = [0, 0, 0, 0];
    const highlight: [number, number, number, number] = [0, 0, 0, 0];
    for (const o of objects) {
      objectAmounts[o.slot] = adj.objects[o.id] ?? 0;
      if (o.id === hoverObject || o.id === flashObject) highlight[o.slot] = 1;
    }
    r.draw({
      hues: analysis.clusters.map((c) => c.okHue),
      colourAmounts: adj.colours,
      skyAmount: analysis.sky ? adj.sky.amount : 0,
      skyTone: analysis.sky ? adj.sky.tone : 0,
      greenAmount: analysis.greenery ? adj.greenery.amount : 0,
      greenTone: analysis.greenery ? adj.greenery.tone : 0,
      objectAmounts,
      highlight,
      showProtected,
      showAreas,
      split,
      showOriginal,
    });
  }, [analysis, adj, objects, hoverObject, flashObject, showProtected, showAreas, split, showOriginal]);

  const onResize = useCallback((w: number, h: number) => renderer.current?.resize(w, h), []);

  /* ---------- editing ---------- */
  const setColour = (index: number, v: number) => {
    setActiveColour(index);
    updateAdj((a) => ({ ...a, colours: a.colours.map((x, i) => (i === index ? v : x)) }));
  };
  const setObjectAmount = (id: number, v: number) => {
    setActiveObject(id);
    updateAdj((a) => ({ ...a, objects: { ...a.objects, [id]: v } }));
  };
  const setSky = (v: ToneAdjust) => updateAdj((a) => ({ ...a, sky: v }));
  const setGreenery = (v: ToneAdjust) => updateAdj((a) => ({ ...a, greenery: v }));

  const uploadObjects = (list: SelectedObject[]) => {
    const wk = work.current;
    if (!wk) return;
    renderer.current?.setObjects(wk.width, wk.height, list.map((o) => ({ slot: o.slot, mask: objectMasks.current.get(o.id)! })));
  };

  const flash = (id: number) => {
    setFlashObject(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashObject(-1), 700);
  };

  const removeObject = (id: number) => {
    const list = objectsRef.current.filter((o) => o.id !== id);
    objectMasks.current.delete(id);
    setObjects(list);
    uploadObjects(list);
    if (activeObject === id) setActiveObject(-1);
    setHoverObject(-1);
    updateAdj((a) => {
      const rest = { ...a.objects };
      delete rest[id];
      return { ...a, objects: rest };
    });
    commit();
  };

  /** What's under the pointer: a colour family (Colour tool) or an object (Object tool). */
  const resolveTarget = async (px: number, py: number): Promise<TargetResult<Target>> => {
    const wk = work.current, a = analysisRef.current;
    if (!wk || !a) return { message: 'Still loading' };
    const i = py * wk.width + px;
    const isProtected = a.protection.protect[i] > 127;

    if (toolRef.current === 'colour') {
      if (isProtected) return { message: 'Protected area' };
      const la = wk.lab[i * 3 + 1], lb = wk.lab[i * 3 + 2];
      const k = nearestCluster(a.clusters, la, lb);
      if (k === null) return { message: Math.hypot(la, lb) < 0.03 ? 'No strong colour here' : 'Not one of the detected colours' };
      setActiveColour(k);
      const c = a.clusters[k];
      return { kind: 'colour', index: k, label: c.name, rgb: c.rgb, start: adjRef.current.colours[k] ?? 0 };
    }

    if (isProtected) return { message: 'Faces and skin are protected' };
    let obj = objectsRef.current.find((o) => (objectMasks.current.get(o.id)?.[i] ?? 0) > 0.5);
    if (!obj) {
      if (objectsRef.current.length >= MAX_OBJECTS) return { message: `You can select up to ${MAX_OBJECTS} objects. Remove one first.` };
      const model = await loadObjectModel();
      const sel = selectObject(wk, px, py, model);
      const used = new Set(objectsRef.current.map((o) => o.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      obj = { id: nextObjectId.current++, slot, name: familyName(sel.rgb), rgb: sel.rgb, pct: sel.pct, ai: sel.ai };
      objectMasks.current.set(obj.id, sel.mask);
      const list = [...objectsRef.current, obj];
      setObjects(list);
      uploadObjects(list);
      const id = obj.id;
      updateAdj((a2) => ({ ...a2, objects: { ...a2.objects, [id]: 0 } }));
    }
    setActiveObject(obj.id);
    flash(obj.id);
    const n = objectsRef.current.findIndex((o) => o.id === obj!.id) + 1;
    return { kind: 'object', id: obj.id, label: `Object ${n}`, rgb: obj.rgb, start: adjRef.current.objects[obj.id] ?? 0 };
  };

  const onDragValue = (t: Target, v: number) => (t.kind === 'colour' ? setColour(t.index, v) : setObjectAmount(t.id, v));

  /* ---------- history ---------- */
  const restore = (s: Adjustments | null) => {
    if (!s) return;
    updateAdj(() => ({ ...s, objects: Object.fromEntries(objectsRef.current.map((o) => [o.id, s.objects[o.id] ?? 0])) }));
  };
  const undo = () => restore(history.undo());
  const redo = () => restore(history.redo());
  const resetAll = () => {
    updateAdj(() => emptyAdjustments(analysisRef.current?.clusters.length ?? 0, objectsRef.current));
    commit();
  };

  const setTool = (t: Tool) => {
    toolRef.current = t;
    setToolState(t);
    if (t === 'object') loadObjectModel();
  };

  /* ---------- export ---------- */
  const exportImage = async (type: 'image/jpeg' | 'image/png') => {
    try {
      const blob = await renderer.current!.export(type);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `harmony-edit.${type === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    }
  };

  /* ---------- keyboard and drag-and-drop ---------- */
  const keyActions = useRef({ undo, redo, setTool, setShowOriginal });
  keyActions.current = { undo, redo, setTool, setShowOriginal };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = keyActions.current, key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); if (e.shiftKey) k.redo(); else k.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); k.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      if (e.key === '\\' && !e.repeat) k.setShowOriginal(true);
      else if (key === 'c') k.setTool('colour');
      else if (key === 'o') k.setTool('object');
    };
    const up = (e: KeyboardEvent) => { if (e.key === '\\') keyActions.current.setShowOriginal(false); };
    let depth = 0;
    const enter = (e: DragEvent) => { e.preventDefault(); depth++; setDropActive(true); };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDropActive(false);
      const f = e.dataTransfer?.files[0];
      if (f) openFileRef.current(f);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;

  return (
    <div className="app">
      <TopBar
        tool={tool}
        onTool={setTool}
        onOpenFile={openFile}
        onSample={() => openSource(makeSamplePhoto())}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={undo}
        onRedo={redo}
        onReset={resetAll}
        split={split >= 0}
        onToggleSplit={() => setSplit((s) => (s >= 0 ? -1 : 0.5))}
        onHoldOriginal={setShowOriginal}
        onExport={exportImage}
      />
      <div className="main">
        <Stage<Target>
          imageSize={imageSize}
          workSize={work.current ? { width: work.current.width, height: work.current.height } : null}
          tool={tool}
          split={split}
          onSplit={setSplit}
          busy={busy}
          error={error}
          onDismissError={() => setError(null)}
          dropActive={dropActive}
          onCanvas={onCanvas}
          onResize={onResize}
          resolveTarget={resolveTarget}
          onDragValue={onDragValue}
          onDragEnd={commit}
        />
        <aside className="panel">
          <HarmonyPanel clusters={analysis?.clusters ?? []} harmony={analysis?.harmony ?? null} active={activeColour} />
          <ColoursPanel clusters={analysis?.clusters ?? []} amounts={adj.colours} active={activeColour} onChange={setColour} onCommit={commit} />
          <NaturePanel
            sky={analysis?.sky ?? null}
            greenery={analysis?.greenery ?? null}
            skyValue={adj.sky}
            greeneryValue={adj.greenery}
            onSky={setSky}
            onGreenery={setGreenery}
            onCommit={commit}
            showAreas={showAreas}
            onShowAreas={setShowAreas}
          />
          <ObjectsPanel
            objects={objects}
            amounts={adj.objects}
            active={activeObject}
            onChange={setObjectAmount}
            onCommit={commit}
            onRemove={removeObject}
            onHover={setHoverObject}
          />
          <PeoplePanel
            status={modelStatus}
            message={analysis?.protection.message ?? ''}
            protectBody={protectBody}
            protectHair={protectHair}
            showProtected={showProtected}
            onProtectBody={setProtectBody}
            onProtectHair={setProtectHair}
            onShowProtected={setShowProtected}
          />
        </aside>
      </div>
      <footer className="footer">
        <span>Built by</span>
        <a href="https://gr4mpus.github.io/portfolio/" target="_blank" rel="noopener noreferrer">gr4mpus.github.io/portfolio</a>
      </footer>
    </div>
  );
}
