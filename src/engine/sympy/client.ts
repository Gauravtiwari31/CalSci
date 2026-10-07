// Lifecycle of the Pyodide worker: lazy load on first use, per-call timeout
// with terminate + respawn, and recycling every 200 calls to cap WASM heap growth.
import * as Comlink from 'comlink';
import type { LoadStage, PyodideWorkerApi } from '../../workers/pyodide.worker';
import { CalcError, type AngleMode, type MathJson } from '../types';

export type CasOp =
  | 'integrate'
  | 'limit'
  | 'solve'
  | 'series'
  | 'dsolve'
  | 'laplace'
  | 'simplify'
  | 'expand'
  | 'factor'
  | 'diff'
  | 'eval';

export interface CasRequest {
  id: string;
  op: CasOp;
  args: MathJson[];
  timeoutMs: number;
  angle?: AngleMode;
  digits?: number;
  complex?: boolean;
}

export type CasResponse =
  | { id: string; ok: true; latex: string; approx?: string }
  | { id: string; ok: false; error: { code: string; message: string } };

export type CasStatus =
  | { state: 'idle' }
  | { state: 'loading'; stage: LoadStage; progress: number }
  | { state: 'ready' }
  | { state: 'failed'; message: string };

const RECYCLE_AFTER = 200;
const STAGE_PROGRESS: Record<LoadStage, number> = { core: 0.15, sympy: 0.6, ready: 1 };

export interface CasBackend {
  run(payload: string): Promise<string>;
}

export class SympyClient {
  private worker: Worker | null = null;
  private remote: Comlink.Remote<PyodideWorkerApi> | null = null;
  private ready: Promise<void> | null = null;
  private calls = 0;
  private everLoaded = false;
  private seq = 0;
  status: CasStatus = { state: 'idle' };
  onStatus?: (s: CasStatus) => void;

  constructor(
    private readonly indexURL: string,
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL('../../workers/pyodide.worker.ts', import.meta.url), { type: 'module' }),
  ) {}

  private setStatus(s: CasStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  private spawn(): Promise<void> {
    this.worker = this.createWorker();
    this.remote = Comlink.wrap<PyodideWorkerApi>(this.worker);
    this.calls = 0;
    const silent = this.everLoaded; // respawns after the first load don't show progress
    const onStage = (stage: LoadStage) => {
      if (!silent)
        this.setStatus(
          stage === 'ready'
            ? { state: 'ready' }
            : { state: 'loading', stage, progress: STAGE_PROGRESS[stage] },
        );
    };
    if (!silent) this.setStatus({ state: 'loading', stage: 'core', progress: 0.05 });
    this.ready = this.remote.init(this.indexURL, Comlink.proxy(onStage)).then(
      () => {
        this.everLoaded = true;
        this.setStatus({ state: 'ready' });
      },
      (e: unknown) => {
        this.kill();
        const message = e instanceof Error ? e.message : String(e);
        this.setStatus({ state: 'failed', message });
        throw new CalcError(`Advanced math failed to load: ${message}`, 'cas-load');
      },
    );
    return this.ready;
  }

  private kill() {
    this.remote?.[Comlink.releaseProxy]();
    this.worker?.terminate();
    this.worker = null;
    this.remote = null;
    this.ready = null;
  }

  /** Start loading without running anything (e.g. when the Calculus layer opens). */
  warm(): Promise<void> {
    return this.ready ?? this.spawn();
  }

  get isLoaded() {
    return this.everLoaded;
  }

  async request(req: Omit<CasRequest, 'id'>): Promise<CasResponse> {
    const id = `cas-${++this.seq}`;
    if (!this.ready) this.spawn();
    if (this.calls >= RECYCLE_AFTER) {
      this.kill();
      this.spawn();
    }
    await this.ready;
    const remote = this.remote!;
    this.calls++;
    const payload = JSON.stringify({
      op: req.op,
      args: req.args,
      angle: req.angle ?? 'rad',
      digits: req.digits ?? 30,
      complex: req.complex ?? false,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new CalcError(`Took too long, stopped after ${Math.round(req.timeoutMs / 1000)} s`, 'timeout'),
          ),
        req.timeoutMs,
      );
    });
    try {
      const raw = await Promise.race([remote.run(payload), timeout]);
      const body = JSON.parse(raw) as {
        latex?: string;
        approx?: string | null;
        error?: { code: string; message: string };
      };
      if (body.error) return { id, ok: false, error: body.error };
      return { id, ok: true, latex: body.latex ?? '', approx: body.approx ?? undefined };
    } catch (e) {
      if (e instanceof CalcError && e.code === 'timeout') {
        // The worker is stuck in Python; the only way out is to terminate it.
        this.kill();
        this.spawn().catch(() => {});
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  dispose() {
    this.kill();
  }
}
