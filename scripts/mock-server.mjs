// Local mock of OneComme for development (no OneComme needed).
// Loads the built plugin.js, serves dist/ at /plugins/<uid>/ and routes
// /api/plugins/<uid> to plugin.request(). Binds to 127.0.0.1:11180 only.
//
//   npm run build && npm run mock
//   POST /mock/comments with a JSON array of comments to feed plugin.subscribe('comments').
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname, join, normalize, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const distDir = resolve(root, 'dist/onecomme-rolling-credit')
const plugin = require(join(distDir, 'plugin.js'))
const UID = plugin.uid
const PORT = 11180

const mem = {}
const store = {
  get: (k) => mem[k] ?? plugin.defaultState?.[k],
  set: (k, v) => (mem[k] = JSON.parse(JSON.stringify(v))),
}
plugin.init(
  { store, log: console, dir: distDir, filepath: join(distDir, 'plugin.js') },
  {
    pro: false,
    services: [
      { id: 'frame-main', name: '我的頻道', url: 'https://www.youtube.com/watch?v=main' },
      { id: 'frame-collab', name: '聯動對象', url: 'https://www.youtube.com/watch?v=collab' },
    ],
    comments: [],
  },
)

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  try {
    if (url.pathname === `/api/plugins/${UID}`) {
      const body = req.method === 'GET' ? undefined : await readBody(req)
      const out = await plugin.request({ url: url.href, method: req.method, params: Object.fromEntries(url.searchParams), body })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(out))
    }
    if (url.pathname === '/mock/comments' && req.method === 'POST') {
      plugin.subscribe('comments', JSON.parse(await readBody(req)))
      res.writeHead(204)
      return res.end()
    }
    const prefix = `/plugins/${UID}/`
    if (url.pathname.startsWith(prefix)) {
      const file = normalize(join(distDir, url.pathname.slice(prefix.length) || 'index.html'))
      if (!file.startsWith(distDir)) throw Object.assign(new Error('forbidden'), { code: 'ENOENT' })
      const data = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
      return res.end(data)
    }
    res.writeHead(404)
    res.end('not found')
  } catch (e) {
    res.writeHead(e?.code === 'ENOENT' ? 404 : 500)
    res.end(String(e?.message ?? e))
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`mock OneComme: http://localhost:${PORT}/plugins/${UID}/settings.html`)
})
