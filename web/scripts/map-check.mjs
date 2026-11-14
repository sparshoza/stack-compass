// Checks the map in a real browser (headless Chrome or Edge, no extra
// dependencies), against a running preview or dev server:
//
//   npm --prefix web run build && npm --prefix web run preview
//   node web/scripts/map-check.mjs [http://localhost:4173]
//
// 1. A click, then a second click whose press moves a few pixels (a shaky
//    double click), must never leave the map camera on NaN, which draws an
//    empty map. Every camera matrix sent to WebGL is checked.
// 2. On a 390px phone, every tool of a route must land in the strip of map
//    between the top bar and the tool panel. The panel is hidden for the
//    screenshot and the accent pixels (route dots and edges) are measured.
// 3. At 1440px with Help me choose open, every lit tool of a stack and of
//    One piece matches must sit right of the sheet with room for its label
//    (accent pixels measured the same way).
// Exits 1 on any failure.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const base = process.argv[2] ?? 'http://localhost:4173'
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Counts camera matrices with NaN; `__lastNaN` says whether the latest frame had one. */
const WATCH_CAMERA = `{
  window.__nan = 0; window.__lastNaN = false
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const original = C.prototype.uniformMatrix3fv
    C.prototype.uniformMatrix3fv = function (location, transpose, m, ...rest) {
      window.__lastNaN = !!m && Array.from(m).some(Number.isNaN)
      if (window.__lastNaN) window.__nan++
      return original.call(this, location, transpose, m, ...rest)
    }
  }
}`

async function openPage(url, width, height) {
  const exe = browsers.find((b) => existsSync(b))
  if (!exe) throw new Error('No Chrome or Edge found')
  const port = 9400 + Math.floor(Math.random() * 400)
  const browser = spawn(exe, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'map-check-'))}`,
    'about:blank',
  ])
  let targets
  for (let i = 0; i < 30 && !targets; i++) {
    await sleep(300)
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    } catch {}
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = {}
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending[m.id]) {
      pending[m.id](m.result)
      delete pending[m.id]
    }
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      pending[++id] = r
      ws.send(JSON.stringify({ id, method, params }))
    })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_CAMERA })
  await send('Page.navigate', { url })
  await sleep(4500)
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value
  const mouse = (type, x, y, clickCount = 0) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount })
  const close = () => {
    ws.close()
    browser.kill()
  }
  return { send, evaluate, mouse, close }
}

/** Decodes an 8-bit RGB or RGBA PNG (what Chrome's screenshots are) into rows of pixels. */
function decodePng(buffer) {
  let at = 8
  let width = 0
  let height = 0
  let channels = 4
  const data = []
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at)
    const type = buffer.toString('ascii', at + 4, at + 8)
    const body = buffer.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      channels = body[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') data.push(body)
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]
      const left = x >= channels ? out[y * stride + x - channels] : 0
      const up = y > 0 ? out[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0
      let add = 0
      if (filter === 1) add = left
      else if (filter === 2) add = up
      else if (filter === 3) add = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)]
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      out[y * stride + x] = (v + add) & 255
    }
  }
  return { width, height, pixel: (x, y) => [...out.subarray(y * stride + x * channels, y * stride + x * channels + 3)] }
}

const failures = []

// 1. A shaky double click never blanks the map.
{
  const page = await openPage(`${base}/`, 1440, 900)
  await page.mouse('mousePressed', 700, 300, 1)
  await page.mouse('mouseReleased', 700, 300, 1)
  await sleep(80)
  await page.mouse('mousePressed', 700, 300, 1)
  for (let k = 1; k < 5; k++) await page.mouse('mouseMoved', 700 + k * 10, 300 + k * 5)
  await page.mouse('mouseReleased', 740, 320, 1)
  await sleep(1500)
  const state = await page.evaluate('({ nan: window.__nan, stuck: window.__lastNaN })')
  console.log('shaky double click:', JSON.stringify(state))
  if (state.stuck || state.nan > 0) failures.push(`camera went NaN after a shaky double click (${state.nan} frames)`)
  page.close()
}

// 2. On a phone, every tool of a route is drawn in the open strip of map.
const ACCENT = [0xc8, 0xfa, 0x5c]
const routes = (process.env.MAP_CHECK_ROUTES ?? 'fastapi:postgresql,postgresql:mongodb,django:rails,dragonfly:redis,contentful:stripe')
  .split(',')
  .map((pair) => pair.split(':'))
for (const [from, to] of routes) {
  const page = await openPage(`${base}/?focus=${from}&to=${to}`, 390, 844)
  const strip = await page.evaluate(`(() => {
    const bar = document.querySelector('header, [role=banner]').getBoundingClientRect()
    const panel = document.querySelector('[role=dialog]').getBoundingClientRect()
    // Hide everything over the map, so a route tool under the bar or the panel shows up as outside.
    for (const el of document.querySelectorAll('header, [role=dialog], footer, button, a')) el.style.visibility = 'hidden'
    return { top: Math.round(bar.bottom), bottom: Math.round(panel.top) }
  })()`)
  await sleep(300)
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  const png = decodePng(Buffer.from(shot.data, 'base64'))
  let box = null
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = png.pixel(x, y)
      if (Math.abs(r - ACCENT[0]) + Math.abs(g - ACCENT[1]) + Math.abs(b - ACCENT[2]) > 24) continue
      box = box
        ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
        : { x0: x, y0: y, x1: x, y1: y }
    }
  }
  const inside = box && box.y0 >= strip.top && box.y1 <= strip.bottom && box.x0 >= 0 && box.x1 < png.width
  console.log(`route ${from} to ${to}: strip ${strip.top}..${strip.bottom}, route drawn ${box ? `${box.y0}..${box.y1}` : 'nowhere'}`)
  if (!inside) failures.push(`route ${from} to ${to} is not inside the open strip on a phone`)
  page.close()
}

// 3. At 1440px, lit tools are framed beside the open Help me choose sheet, not under it.
const SHEET_RIGHT = 464
const LABEL_ROOM = 40
const lit = (process.env.MAP_CHECK_LIT ?? 't=saas&c=payments,transactional-email|t=saas|m=piece&l=auth|m=piece&l=database&f=need:vectors,run:managed').split('|')
for (const query of lit) {
  const page = await openPage(`${base}/?${query}`, 1440, 900)
  await sleep(1500)
  await page.evaluate(`(() => {
    for (const el of document.querySelectorAll('header, [role=dialog], footer, button, a')) el.style.visibility = 'hidden'
  })()`)
  await sleep(300)
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  const png = decodePng(Buffer.from(shot.data, 'base64'))
  let box = null
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = png.pixel(x, y)
      if (Math.abs(r - ACCENT[0]) + Math.abs(g - ACCENT[1]) + Math.abs(b - ACCENT[2]) > 24) continue
      box = box
        ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
        : { x0: x, y0: y, x1: x, y1: y }
    }
  }
  const ok = box && box.x0 >= SHEET_RIGHT + LABEL_ROOM && box.x1 < png.width
  console.log(`lit ${query}: drawn ${box ? `x ${box.x0}..${box.x1}, y ${box.y0}..${box.y1}` : 'nowhere'}`)
  if (!ok) failures.push(`lit tools for ${query} are not all right of the sheet at 1440px`)
  page.close()
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('map check passed')
process.exit(0)
