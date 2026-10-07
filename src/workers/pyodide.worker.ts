/// <reference lib="webworker" />
// SymPy in Pyodide (spec §5.3). The Python bridge is a fixed module; requests
// carry MathJSON as data, never as code.
import * as Comlink from 'comlink';
import type { PyodideAPI } from 'pyodide';
import bridgeSource from '../engine/sympy/bridge.py?raw';

export type LoadStage = 'core' | 'sympy' | 'ready';

let py: PyodideAPI | null = null;
let handle: ((payload: string) => string) | null = null;
let loading: Promise<void> | null = null;

async function load(indexURL: string, onStage?: (stage: LoadStage) => void): Promise<void> {
  if (py) return;
  if (!loading) {
    loading = (async () => {
      onStage?.('core');
      const mod = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as typeof import('pyodide');
      const instance = await mod.loadPyodide({ indexURL, fullStdLib: false });
      onStage?.('sympy');
      await instance.loadPackage(['sympy'], { messageCallback: () => {}, errorCallback: () => {} });
      instance.runPython(bridgeSource);
      handle = instance.globals.get('handle');
      py = instance;
      onStage?.('ready');
    })();
  }
  return loading;
}

const api = {
  async init(indexURL: string, onStage?: (stage: LoadStage) => void) {
    await load(indexURL, onStage);
  },
  run(payload: string): string {
    if (!handle) throw new Error('SymPy is not loaded');
    return handle(payload);
  },
};

export type PyodideWorkerApi = typeof api;
Comlink.expose(api);
