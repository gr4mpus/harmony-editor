import type { ModelStatus } from '../types';
import { Toggle } from './Toggle';

interface PeoplePanelProps {
  status: ModelStatus;
  message: string;
  protectBody: boolean;
  protectHair: boolean;
  showProtected: boolean;
  onProtectBody: (v: boolean) => void;
  onProtectHair: (v: boolean) => void;
  onShowProtected: (v: boolean) => void;
}

const STATUS_TEXT: Record<ModelStatus, string> = {
  loading: 'Loading AI person detection…',
  ready: 'AI person detection is on.',
  fallback:
    "AI person detection couldn't load (it needs an internet connection the first time). Using skin-tone detection instead, which is less precise.",
};

export function PeoplePanel(p: PeoplePanelProps) {
  return (
    <section>
      <h2>People protection</h2>
      <Toggle label="Faces" note="Always protected" checked disabled />
      <Toggle id="protect-body" label="Skin on arms, neck and hands" checked={p.protectBody} onChange={p.onProtectBody} />
      <Toggle id="protect-hair" label="Hair" checked={p.protectHair} onChange={p.onProtectHair} />
      <Toggle id="show-protected" label="Show protected areas" note="Pink overlay on the photo" checked={p.showProtected} onChange={p.onShowProtected} />
      <div className="status" role="status">
        <span className={`dot ${p.status}`} />
        <span>
          {STATUS_TEXT[p.status]}
          {p.message ? ` ${p.message}` : ''}
        </span>
      </div>
      <p className="hint">Clothes stay editable. Your photo is processed in this browser and never uploaded.</p>
    </section>
  );
}
