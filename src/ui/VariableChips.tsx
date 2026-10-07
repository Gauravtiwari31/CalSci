import { useStore } from '../store';
import { mathfield } from './mathfield/controller';
import { MathView } from './MathView';

const shortValue = (latex: string) => (latex.length > 40 ? '…' : latex);

export function VariableChips() {
  const variables = useStore((s) => s.variables);
  const functions = useStore((s) => s.functions);
  const vars = Object.values(variables)
    .filter((v) => v.name !== 'Ans')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const fns = Object.values(functions);
  if (!vars.length && !fns.length) return null;

  const insert = (latex: string) => {
    mathfield.insert(latex);
    useStore.getState().updatePreview();
  };
  const nameLatex = (n: string) => n.replace(/_(\w+)$/, '_{$1}');

  return (
    <div className="chips" role="list" aria-label="Pinned variables">
      {vars.map((v) => (
        <button
          key={v.name}
          type="button"
          role="listitem"
          className="pill chip"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insert(nameLatex(v.name))}
          aria-label={`Insert variable ${v.name}`}
        >
          <MathView className="chip__name" latex={nameLatex(v.name)} />
          <span className="chip__value">
            =&nbsp;
            {v.latex.length > 40 ? '…' : <MathView latex={shortValue(v.latex)} />}
          </span>
        </button>
      ))}
      {fns.map((f) => (
        <button
          key={f.name}
          type="button"
          role="listitem"
          className="pill chip"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insert(`${f.name}\\left(#?\\right)`)}
          aria-label={`Insert function ${f.name}`}
        >
          <MathView className="chip__name" latex={`${f.name}(${f.params.join(',')})`} />
        </button>
      ))}
    </div>
  );
}
