import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { haptics } from '../../platform';
import { LAYERS, useStore, type LayerId } from '../../store';
import { ConverterPanel } from '../converter/ConverterPanel';
import { Icon } from '../Icon';
import { mathfield } from '../mathfield/controller';
import {
  LAYER_KEYS,
  LAYER_LABELS,
  type KeyAction,
  type KeyDef,
  type KeyFace,
  type KeypadLayer,
} from './layers';

function runAction(action: KeyAction) {
  const s = useStore.getState();
  switch (action.type) {
    case 'insert':
      mathfield.insert(action.latex);
      break;
    case 'command':
      mathfield.command(action.command);
      break;
    case 'backspace':
      mathfield.command('deleteBackward');
      break;
    case 'clear':
      mathfield.clear();
      s.clearError();
      break;
    case 'evaluate':
      void s.evaluate();
      return;
    case 'shift':
      s.toggleShift();
      return;
    case 'hyp':
      s.toggleHyp();
      return;
    case 'sheet':
      s.openSheet(action.sheet);
      return;
    case 'refresh-rates':
      void s.refreshRates(true);
      return;
  }
  // One-shot shift, like hardware calculators.
  if (s.shift && action.type === 'insert') s.toggleShift();
  s.updatePreview();
}

function keyClass(def: KeyDef, toggle: boolean, pressed: boolean): string {
  const c = ['key', `key--${def.role}`];
  if (def.action.type === 'sheet') c.push('key--sheet');
  if (def.action.type === 'clear') c.push('key--clear');
  if (toggle) c.push('key--toggle');
  if (def.role === 'fn' && def.label.length > 5) c.push('key--long');
  if (pressed) c.push('is-pressed');
  return c.join(' ');
}

function Key({ def, shift, hyp }: { def: KeyDef; shift: boolean; hyp: boolean }) {
  const [pressed, setPressed] = useState(false);
  const active: KeyFace = (shift && hyp && def.shiftHyp) || (hyp && def.hyp) || (shift && def.shift) || def;
  const alt = !shift && def.shift ? def.shift.label : shift && def.shift ? def.label : null;
  const toggled = def.action.type === 'shift' ? shift : def.action.type === 'hyp' ? hyp : undefined;

  const press = () => {
    setPressed(true);
    setTimeout(() => setPressed(false), 90);
    if (def.role === 'eq') haptics.equals();
    else haptics.key();
    runAction(active.action);
  };

  return (
    <button
      type="button"
      className={keyClass(def, toggled !== undefined, pressed)}
      style={def.span ? { gridColumn: `span ${def.span}` } : undefined}
      aria-label={active.aria}
      aria-pressed={toggled}
      data-key={def.id}
      // Keep focus in the mathfield so the caret stays put.
      onPointerDown={(e) => e.preventDefault()}
      onClick={press}
    >
      {def.icon ? <Icon name={def.icon} size={24} /> : <span className="key__glyph">{active.label}</span>}
      {alt && (
        <span className="key__alt" aria-hidden="true">
          {alt}
        </span>
      )}
    </button>
  );
}

function KeyGrid({ layer }: { layer: KeypadLayer }) {
  const shift = useStore((s) => s.shift);
  const hyp = useStore((s) => s.hyp);
  return (
    <div className="keypad" role="group" aria-label={`${LAYER_LABELS[layer]} keys`}>
      {LAYER_KEYS[layer].map((k) => (
        <Key key={k.id} def={k} shift={shift} hyp={hyp} />
      ))}
    </div>
  );
}

export function LayerSwitcher() {
  const layer = useStore((s) => s.layer);
  const setLayer = useStore((s) => s.setLayer);
  return (
    <div className="layers" role="tablist" aria-label="Keypad layers">
      {LAYERS.map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          className="pill"
          aria-selected={l === layer}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setLayer(l)}
        >
          {LAYER_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

export function Keypad() {
  const layer = useStore((s) => s.layer);
  const setLayer = useStore((s) => s.setLayer);
  const start = useRef<{ x: number; y: number } | null>(null);

  if (layer === 'convert') return <ConverterPanel />;

  const onDown = (e: ReactPointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = LAYERS.indexOf(layer);
    const next: LayerId = LAYERS[(i + (dx < 0 ? 1 : LAYERS.length - 1)) % LAYERS.length];
    setLayer(next);
  };

  return (
    <div
      className={`keypads${layer !== 'basic' ? ' keypads--pair' : ''}`}
      onPointerDown={onDown}
      onPointerUp={onUp}
    >
      <KeyGrid layer={layer} />
      {layer !== 'basic' && (
        <div className="keypad-companion">
          <KeyGrid layer="basic" />
        </div>
      )}
    </div>
  );
}
