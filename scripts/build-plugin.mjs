// Bundle src/plugin/index.ts -> dist/onecomme-rolling-credit/plugin.js (CommonJS, Node).
import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, 'dist/onecomme-rolling-credit')

await build({
  entryPoints: [resolve(root, 'src/plugin/index.ts')],
  outfile: resolve(outDir, 'plugin.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'info',
  // The source uses `module.exports` on purpose (OneComme requires it); output is CJS.
  logOverride: { 'commonjs-variable-in-esm': 'silent' },
})

// The repo root is "type": "module"; mark the plugin folder as CommonJS so Node
// (and OneComme) load plugin.js correctly even when run from inside this repo.
await writeFile(resolve(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
