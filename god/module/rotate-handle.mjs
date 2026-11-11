/**
 * Ручка обертання токена, як у Roll20: у виділеного токена над ним кружечок — тягни, і токен крутиться.
 * Крок 5°, з Shift — плавно; Alt — крок 45°. Під час руху лише прев'ю, документ оновлюється при відпусканні.
 */
/**
 * Розміри ручки — від клітинки сцени, але на екрані не менше ~5 px і не більше ~9 px радіуса:
 * на дрібній сітці ручка не затуляє токен, на великій і при віддаленні — не губиться.
 */
function dims() {
  const grid = canvas.grid?.size ?? canvas.dimensions?.size ?? 100
  const zoom = canvas.stage?.scale?.x || 1
  const r = Math.min(9 / zoom, Math.max(5 / zoom, grid * 0.07))
  return { r, gap: r * 2.2, line: Math.max(1, r * 0.28) }
}
let layer = null, drag = null

const enabled = () => { try { return game.settings.get('god', 'rotationHandle') } catch { return true } }
const deg = (dx, dy) => ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360

function ensureLayer() {
  if (layer && !layer.destroyed && layer.parent) return layer
  layer = new PIXI.Container()
  layer.eventMode = 'static'
  layer.sortableChildren = true
  layer.zIndex = 10000
  ;(canvas.tokens ?? canvas.stage).addChild(layer)
  return layer
}

/** Позиція ручки: над токеном з урахуванням його повороту */
function handlePos(token, rotation) {
  const c = token.center, r = (token.h / 2) + dims().gap
  const a = (rotation ?? token.document.rotation ?? 0) * Math.PI / 180
  return { x: c.x + Math.sin(a) * r, y: c.y - Math.cos(a) * r, cx: c.x, cy: c.y }
}

function drawHandle(token) {
  const g = new PIXI.Graphics()
  g.eventMode = 'static'
  g.cursor = 'grab'
  g.godToken = token.id
  const paint = rot => {
    const p = handlePos(token, rot), { r: R, gap: GAP, line } = dims()
    g.clear()
    const k = (token.h / 2) / ((token.h / 2) + GAP)
    const edge = { x: p.cx + (p.x - p.cx) * k, y: p.cy + (p.y - p.cy) * k }
    g.lineStyle(line, 0xf3c267, 0.9).moveTo(edge.x, edge.y).lineTo(p.x, p.y)
    g.lineStyle(line, 0x141822, 1).beginFill(0xf3c267, 1).drawCircle(p.x, p.y, R).endFill()
    g.lineStyle(0).beginFill(0x141822, 1).drawCircle(p.x, p.y, R * 0.28).endFill()
    g.hitArea = new PIXI.Circle(p.x, p.y, R * 1.7)
  }
  paint()
  g.godPaint = paint
  g.on('pointerdown', ev => {
    ev.stopPropagation()
    drag = { token, g, rot: token.document.rotation ?? 0 }
    g.cursor = 'grabbing'
    canvas.stage.on('pointermove', onMove)
    canvas.stage.once('pointerup', onUp)
    canvas.stage.once('pointerupoutside', onUp)
  })
  return g
}

function onMove(ev) {
  if (!drag) return
  const pt = ev.getLocalPosition?.(canvas.stage) ?? canvas.mousePosition
  const c = drag.token.center
  let rot = deg(pt.x - c.x, pt.y - c.y)
  const oe = ev.data?.originalEvent ?? ev.nativeEvent ?? ev
  const step = oe?.shiftKey ? 1 : oe?.altKey ? 45 : 5
  rot = Math.round(rot / step) * step % 360
  drag.rot = rot
  // прев'ю: крутимо лише картинку, без запису в базу
  const mesh = drag.token.mesh
  if (mesh) mesh.angle = rot
  drag.g.godPaint(rot)
}

async function onUp() {
  canvas.stage.off('pointermove', onMove)
  if (!drag) return
  const { token, rot } = drag
  drag = null
  if (token.document && rot !== token.document.rotation) await token.document.update({ rotation: rot })
  refresh()
}

/** Перемалювати ручки для всіх виділених токенів, які можна крутити */
export function refresh() {
  if (!canvas?.ready || drag) return
  const L = ensureLayer()
  for (const c of L.removeChildren()) c.destroy()
  if (!enabled()) return
  for (const t of canvas.tokens?.controlled ?? []) {
    if (!t.isOwner || t.document.lockRotation || !t.visible) continue
    L.addChild(drawHandle(t))
  }
}

export function registerRotationHandle() {
  game.settings.register('god', 'rotationHandle', {
    name: 'Ручка обертання токена', hint: 'Як у Roll20: у виділеного токена над ним кружечок — тягни, щоб повернути (крок 5°, Shift — плавно, Alt — 45°).',
    scope: 'client', config: true, type: Boolean, default: true, onChange: () => refresh(),
  })
  const later = () => setTimeout(refresh, 0)
  Hooks.on('canvasReady', () => { layer = null; later() })
  Hooks.on('controlToken', later)
  // масштаб сцени змінився — ручка тримає розмір на екрані
  let panTimer = null
  Hooks.on('canvasPan', () => { clearTimeout(panTimer); panTimer = setTimeout(refresh, 80) })
  Hooks.on('updateToken', later)
  Hooks.on('deleteToken', later)
  Hooks.on('refreshToken', t => { if (t.controlled && !drag) later() })
}
