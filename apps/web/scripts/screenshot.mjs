/* global process, setTimeout, fetch, WebSocket, Buffer, console */  // a Node script; the app lint config is for the browser
// Render the office at 1440 x 810 and save it to docs/screenshots/ (IMPLEMENTATION_PLAN M1, task 6).
//
//   pnpm --filter @office/web screenshot                   # needs `pnpm dev` running
//   node apps/web/scripts/screenshot.mjs --url <url> --out <file.png>
//   ... --before "__officeDebug.teleport(30, 20)"          # run in the page once it is ready
//
// Drives a local Chrome over the DevTools protocol (Node's built-in WebSocket; no extra
// dependencies), waits for the scene's `window.__officeReady` flag, captures the page and
// samples the frame rate. CHROME overrides the browser path.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) =>
  a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]]] : pairs, []))
const url = args.url ?? 'http://localhost:5173/?mode=office'
const out = path.resolve(args.out ?? path.join(here, '../../../docs/screenshots/office-m1.png'))
const [width, height] = [1440, 810]
const chrome = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const port = 9341

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-shot-'))
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--ignore-gpu-blocklist', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })

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
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value

  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  const started = Date.now()
  while (!(await evaluate('Boolean(window.__officeReady)').catch(() => false))) {
    if (Date.now() - started > 90_000) throw new Error(`scene not ready after 90 s at ${url}`)
    await sleep(500)
  }
  if (args.before) await evaluate(args.before)   // e.g. "__officeDebug.teleport(30, 20)"
  await sleep(1500)  // let contact shadows and late textures settle
  const fps = await evaluate(`new Promise((done) => { let n = 0; const t0 = performance.now();
    const tick = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : done(n / ((performance.now() - t0) / 1000)) };
    requestAnimationFrame(tick) })`)
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`saved ${out} (${width}x${height}); headless frame rate ~${fps.toFixed(0)} fps (software rendering: not a GPU benchmark)`)
  ws.close()
} finally {
  browser.kill()
  await sleep(300)
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
}
