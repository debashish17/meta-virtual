/* global process, setTimeout, fetch, WebSocket, console */  // a Node script; the app lint config is for the browser
// Bake the office's people: Mixamo characters and moves (FBX, downloaded by the owner from
// mixamo.com; the raw files are not kept in the repo) into
//   apps/web/public/assets/people/<body>.glb, moves.glb, LICENSE.txt
//   packages/shared/src/people/bodies.generated.json
//
//   node apps/web/scripts/people/bake.mjs --src <folder>
//
// <folder> holds Ch13_nonPBR.fbx, Ch23_nonPBR.fbx, Ch33_nonPBR.fbx and the move files listed in
// bake.html (Idle, walking, standard run, Acknowledging, Dismissing Gesture, Talking On Phone,
// Button Pushing, Stand To Sit, Sit To Stand, "Having A Meeting, Male", Typing). The work runs in headless
// Chrome (bake.html) so the files are read by the same three.js the app plays them with.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) =>
  a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]]] : pairs, []))
if (!args.src) throw new Error('usage: node bake.mjs --src <folder with the Mixamo FBX files>')
const src = path.resolve(args.src)
const outAssets = path.join(repo, 'apps/web/public/assets/people')
const outManifest = path.join(repo, 'packages/shared/src/people/bodies.generated.json')
const three = path.join(repo, 'apps/web/node_modules/three')
const chrome = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.fbx': 'application/octet-stream', '.glb': 'model/gltf-binary' }
fs.rmSync(outAssets, { recursive: true, force: true })   // nothing else lives here; drop files from earlier bakes
fs.mkdirSync(outAssets, { recursive: true })
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (req.method === 'PUT' && url.startsWith('/out/')) {
    // the page uploads each finished file here
    const name = path.basename(url)
    const out = fs.createWriteStream(path.join(outAssets, name))
    req.pipe(out)
    out.on('finish', () => { console.log(`${name}  ${(fs.statSync(path.join(outAssets, name)).size / 1024).toFixed(0)} KB`); res.writeHead(200); res.end() })
    return
  }
  const file = url === '/' ? path.join(here, 'bake.html')
    : url.startsWith('/three/') ? path.join(three, url.slice(7))
      : url.startsWith('/in/') ? path.join(src, url.slice(4)) : null
  const root = url.startsWith('/three/') ? three : url.startsWith('/in/') ? src : here
  if (!file || !path.resolve(file).startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const pagePort = server.address().port
const port = 9343
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-people-'))
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      .then((list) => list.find((t) => t.type === 'page')).catch(() => undefined)
  }
  if (!target) throw new Error('Chrome did not start')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let nextId = 0
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  // the page reports its progress with console.log
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.method === 'Runtime.consoleAPICalled') console.log('  ' + msg.params.args.map((a) => a.value ?? a.description).join(' '))
  })
  await send('Runtime.enable')
  await send('Page.navigate', { url: `http://127.0.0.1:${pagePort}/` })
  for (let i = 0; i < 100 && !(await evaluate('Boolean(window.__ready)').catch(() => false)); i++) await sleep(200)
  const result = await evaluate('window.bake()')
  for (const line of result.report) console.log(line)
  // shrink every file: drop keyframes that add nothing, then meshopt-compress geometry and
  // animation (the app's GLTFLoader decodes it); about a quarter of the size, no visible change
  await MeshoptEncoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
  for (const name of result.files) {
    const file = path.join(outAssets, name)
    const before = fs.statSync(file).size
    const doc = await io.read(file)
    await doc.transform(resample(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
    await io.write(file, doc)
    console.log(`${name}  ${(before / 1024).toFixed(0)} KB -> ${(fs.statSync(file).size / 1024).toFixed(0)} KB`)
  }
  fs.writeFileSync(path.join(outAssets, 'LICENSE.txt'), [
    'People and moves: Mixamo (https://www.mixamo.com), Adobe. Mixamo characters and animations are',
    'royalty-free to use in projects; they may not be redistributed or sold as standalone assets.',
    'Keep this repository private, or leave this folder out of any public copy of it.',
    'Converted by apps/web/scripts/people/bake.mjs.',
  ].join('\n') + '\n')
  fs.writeFileSync(outManifest, JSON.stringify(result.manifest, null, 1) + '\n')
  console.log(`manifest -> ${path.relative(repo, outManifest)}`)
  ws.close()
} finally {
  browser.kill()
  server.close()
  await sleep(300)
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
}
