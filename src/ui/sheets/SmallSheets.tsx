import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { mathfield } from '../mathfield/controller';
import { MathView } from '../MathView';
import { Field, Sheet } from './Sheet';

export function MatrixSizeSheet() {
  const close = useStore((s) => s.closeSheet);
  const [hover, setHover] = useState<[number, number]>([2, 2]);
  const N = 6;
  const insert = (m: number, n: number) => {
    const row = Array.from({ length: n }, () => '#?').join('&');
    mathfield.insert(`\\begin{pmatrix}${Array.from({ length: m }, () => row).join('\\\\')}\\end{pmatrix}`);
    close();
  };
  return (
    <Sheet title="Insert matrix">
      <p>
        {hover[0]} × {hover[1]}
      </p>
      <div className="matrix-size" role="grid" aria-label="Matrix size">
        {Array.from({ length: N * N }, (_, k) => {
          const r = Math.floor(k / N) + 1;
          const c = (k % N) + 1;
          return (
            <button
              key={k}
              type="button"
              className={r <= hover[0] && c <= hover[1] ? 'is-in' : ''}
              aria-label={`${r} by ${c}`}
              onPointerEnter={() => setHover([r, c])}
              onFocus={() => setHover([r, c])}
              onClick={() => insert(r, c)}
            >
              {r === hover[0] && c === hover[1] ? `${r}×${c}` : ''}
            </button>
          );
        })}
      </div>
      <p className="hint">
        Use +row and +col on the matrix keys to grow it later. Pin a matrix result as A, B or C to reuse it.
      </p>
    </Sheet>
  );
}

const NAME = /^[A-Za-z](_[A-Za-z0-9]+)?$/;

export function PinSheet({ entryId }: { entryId: number }) {
  const variables = useStore((s) => s.variables);
  const pinEntry = useStore((s) => s.pinEntry);
  const close = useStore((s) => s.closeSheet);
  const entry = useStore((s) => s.history.find((e) => e.id === entryId));
  const suggestion = useMemo(() => {
    const isMatrix = entry?.resultLatex.includes('pmatrix');
    const pool = isMatrix ? 'ABCDEFGH' : 'abcdfghkmnpqruvw';
    return [...pool].find((c) => !variables[c]) ?? `v_${Object.keys(variables).length}`;
  }, [entry, variables]);
  const [name, setName] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!NAME.test(name)) {
      setError('Use one letter, optionally with a subscript like r_1');
      return;
    }
    try {
      await pinEntry(entryId, name);
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet title="Pin as variable">
      {entry && <MathView latex={entry.resultLatex} />}
      <Field label="Name" hint={variables[name] ? `Replaces the current value of ${name}` : undefined}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoComplete="off"
        />
      </Field>
      {error && (
        <p role="alert" style={{ color: 'var(--fault)' }}>
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={save}>
          Pin
        </button>
      </div>
    </Sheet>
  );
}

export function VariablesSheet() {
  const variables = useStore((s) => s.variables);
  const functions = useStore((s) => s.functions);
  const deleteVariable = useStore((s) => s.deleteVariable);
  const deleteFunction = useStore((s) => s.deleteFunction);
  const close = useStore((s) => s.closeSheet);
  const vars = Object.values(variables).sort((a, b) => a.name.localeCompare(b.name));
  const fns = Object.values(functions);
  const nameLatex = (n: string) => n.replace(/_(\w+)$/, '_{$1}');

  return (
    <Sheet title="Variables and functions">
      {vars.length === 0 && fns.length === 0 && (
        <p className="hint">
          None yet. Long-press a result and choose “Pin as variable”, or type a := 5 or f(x) := x² + 1.
        </p>
      )}
      {vars.length > 0 && (
        <ul className="list">
          {vars.map((v) => (
            <li key={v.name}>
              <button
                type="button"
                style={{ textAlign: 'left' }}
                onClick={() => {
                  mathfield.insert(v.name === 'Ans' ? '\\operatorname{Ans}' : nameLatex(v.name));
                  close();
                }}
              >
                <MathView
                  latex={`${v.name === 'Ans' ? '\\operatorname{Ans}' : nameLatex(v.name)}=${v.latex.length > 120 ? '\\ldots' : v.latex}`}
                />
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => deleteVariable(v.name)}
                aria-label={`Delete ${v.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {fns.length > 0 && (
        <>
          <h3 className="section-title">Functions</h3>
          <ul className="list">
            {fns.map((f) => (
              <li key={f.name}>
                <MathView latex={f.latex} />
                <button
                  type="button"
                  className="btn"
                  onClick={() => deleteFunction(f.name)}
                  aria-label={`Delete ${f.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
