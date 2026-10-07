// Long-lived engine instances shared by the UI.
import * as Comlink from 'comlink';
import { NumericEngine } from '../engine/numeric';
import type { NumericWorkerLike, RouterDeps } from '../engine/router';
import { SympyClient } from '../engine/sympy/client';
import { DEFAULT_SETTINGS } from '../engine/types';
import type { NumericWorkerApi } from '../workers/numeric.worker';

export const numeric = new NumericEngine(DEFAULT_SETTINGS.precision);

const pyodideIndex = new URL(`${import.meta.env.BASE_URL}pyodide/`, window.location.href).href;
export const cas = new SympyClient(pyodideIndex);

let numericRemote: Comlink.Remote<NumericWorkerApi> | null = null;
const numericWorker: NumericWorkerLike = {
  evaluate(job) {
    numericRemote ??= Comlink.wrap<NumericWorkerApi>(
      new Worker(new URL('../workers/numeric.worker.ts', import.meta.url), { type: 'module' }),
    );
    const transfer = Object.values(job.lists).map((a) => a.buffer);
    return numericRemote.evaluate(Comlink.transfer(job, transfer));
  },
};

export const deps: RouterDeps = { numeric, cas, numericWorker };
