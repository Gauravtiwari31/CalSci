// Runs the real SymPy bridge in Node through Pyodide, so router and
// serializer tests exercise exactly what the worker runs in the app.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';
import type { CasLike } from '../../src/engine/router';
import { CalcError } from '../../src/engine/types';

const root = fileURLToPath(new URL('../../', import.meta.url));
const indexURL = `${root}public/pyodide/`;

let handlePromise: Promise<(payload: string) => string> | null = null;

export const pyodideAvailable =
  existsSync(`${indexURL}sympy-1.14.0-py3-none-any.whl`) || existsSync(indexURL);

export function loadHandle() {
  handlePromise ??= (async () => {
    const py = await loadPyodide({ indexURL });
    await py.loadPackage(['sympy'], { messageCallback: () => {} });
    py.runPython(readFileSync(`${root}src/engine/sympy/bridge.py`, 'utf8'));
    return py.globals.get('handle') as (payload: string) => string;
  })();
  return handlePromise;
}

export const nodeCas: CasLike = {
  async request(req) {
    const handle = await loadHandle();
    const raw = handle(
      JSON.stringify({
        op: req.op,
        args: req.args,
        angle: req.angle ?? 'rad',
        digits: req.digits ?? 30,
        complex: req.complex ?? false,
      }),
    );
    const body = JSON.parse(raw);
    if (body.error) return { id: 'n', ok: false, error: body.error };
    return { id: 'n', ok: true, latex: body.latex, approx: body.approx ?? undefined };
  },
};

export const offlineCas: CasLike = {
  request: () => Promise.reject(new CalcError('Advanced math failed to load: offline', 'cas-load')),
};
