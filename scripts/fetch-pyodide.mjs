// Copies Pyodide core from node_modules into public/pyodide/ and downloads the
// SymPy + mpmath wheels (plus their dependency closure) from the Pyodide CDN so
// the app can do symbolic math fully offline. Run once after `npm install`.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pyodide');
const out = join(root, 'public', 'pyodide');
const WANTED = ['sympy'];

const pkg = JSON.parse(await readFile(join(src, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(src, 'pyodide-lock.json'), 'utf8'));
const cdn = `https://cdn.jsdelivr.net/pyodide/v${pkg.version}/full/`;

await mkdir(out, { recursive: true });
for (const f of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  await copyFile(join(src, f), join(out, f));
}

const closure = new Set();
const visit = (name) => {
  if (closure.has(name)) return;
  const entry = lock.packages[name];
  if (!entry) throw new Error(`Package ${name} not in pyodide-lock.json`);
  closure.add(name);
  entry.depends.forEach(visit);
};
WANTED.forEach(visit);

const exists = async (p) => stat(p).then(() => true, () => false);
let total = 0;
for (const name of closure) {
  const { file_name, sha256 } = lock.packages[name];
  const dest = join(out, file_name);
  if (!(await exists(dest))) {
    process.stdout.write(`Downloading ${file_name}… `);
    const res = await fetch(cdn + file_name);
    if (!res.ok) throw new Error(`${res.status} fetching ${cdn + file_name}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const digest = createHash('sha256').update(buf).digest('hex');
    if (digest !== sha256) throw new Error(`sha256 mismatch for ${file_name}`);
    await writeFile(dest, buf);
    console.log('ok');
  }
  total += (await stat(dest)).size;
}
for (const f of ['pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide.asm.mjs']) total += (await stat(join(out, f))).size;
console.log(`Pyodide v${pkg.version} + ${[...closure].join(', ')} in public/pyodide (${(total / 1048576).toFixed(1)} MB)`);
