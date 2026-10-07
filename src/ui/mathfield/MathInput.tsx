import { MathfieldElement } from 'mathlive';
import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { MathView } from '../MathView';
import { mathfield } from './controller';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement> & {
        class?: string;
      };
    }
  }
}

/** Multi-letter names that should become operators when typed on a physical keyboard. */
const SHORTCUTS: Record<string, string> = {
  Ans: '\\operatorname{Ans}',
  to: '\\operatorname{to}',
  solve: '\\operatorname{solve}',
  simplify: '\\operatorname{simplify}',
  expand: '\\operatorname{expand}',
  factor: '\\operatorname{factor}',
  series: '\\operatorname{series}',
  laplace: '\\operatorname{laplace}',
  dsolve: '\\operatorname{dsolve}',
  det: '\\det',
  rank: '\\operatorname{rank}',
  mean: '\\operatorname{mean}',
  median: '\\operatorname{median}',
  npv: '\\operatorname{npv}',
  irr: '\\operatorname{irr}',
  pmt: '\\operatorname{pmt}',
  normcdf: '\\operatorname{normcdf}',
  nCr: '\\operatorname{nCr}',
  nPr: '\\operatorname{nPr}',
  ':=': '\\coloneq',
};

export function MathInput() {
  const ref = useRef<MathfieldElement>(null);
  const preview = useStore((s) => s.preview);
  const error = useStore((s) => s.error);
  const busy = useStore((s) => s.busy);
  // The converter has its own inputs; keep the mathfield mounted but out of the way.
  const hidden = useStore((s) => s.layer === 'convert');

  useEffect(() => {
    const mf = ref.current;
    if (!mf) return;
    mathfield.attach(mf);
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.smartFence = true;
    mf.smartSuperscript = true;
    mf.inlineShortcuts = { ...mf.inlineShortcuts, ...SHORTCUTS };
    mf.menuItems = [];
    mf.popoverPolicy = 'off';
    mf.scriptDepth = [3, 3];
    // Keep the OS keyboard closed on touch devices: the keypad is the keyboard.
    if (window.matchMedia('(pointer: coarse)').matches) {
      mf.setAttribute('inputmode', 'none');
      mf.shadowRoot?.querySelector('[part=keyboard-sink], textarea')?.setAttribute('inputmode', 'none');
    }

    const onInput = () => useStore.getState().updatePreview();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        void useStore.getState().evaluate();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        mathfield.clear();
        useStore.getState().updatePreview();
      } else if (ev.key === 'ArrowUp' && mf.value === '') {
        const last = useStore.getState().history.at(-1);
        if (last) {
          ev.preventDefault();
          mathfield.set(last.inputLatex);
          useStore.getState().updatePreview();
        }
      }
    };
    mf.addEventListener('input', onInput);
    mf.addEventListener('keydown', onKey, { capture: true });
    mf.focus();
    return () => {
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('keydown', onKey, { capture: true });
      mathfield.attach(null);
    };
  }, []);

  return (
    <div className="brutal display" hidden={hidden}>
      <div className="display__head">
        <span className="label">Expression</span>
        {busy && <span className="sticker sticker--plain">Working…</span>}
      </div>
      <math-field ref={ref} class="mf" aria-label="Expression input" data-testid="mathfield" />
      <div className="display__rule" aria-hidden="true" />
      {error ? (
        <div className="preview preview--error" role="alert">
          {error}
        </div>
      ) : (
        <div className="preview" aria-hidden={!preview}>
          <span className="label">Preview</span>
          {preview && (
            <>
              ≈&nbsp;
              <MathView latex={preview} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
