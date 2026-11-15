/**
 * Вікна під розмір екрана: жодне вікно системи (лист, діалог, панель) не виходить за край,
 * а кнопки внизу діалогу завжди видно — прокручується лише вміст.
 *
 * Діалоги підганяються прямо в JS (inline max-height на .dialog-content), а не ланцюжком flex-правил:
 * так прокрутка не залежить від того, як саме Foundry v13/v14 будує рамку діалогу.
 * Вікно після цього підсувається, щоб верх і низ були на екрані.
 */
const M = 8

/** Нова позиція, щоб прямокутник rect помістився в екран W×H (чиста логіка — для тестів) */
export function fitRect(rect, W, H, m = M) {
  const out = {}
  const maxW = Math.max(200, W - 2 * m), maxH = Math.max(160, H - 2 * m)
  let { left, top, width, height } = rect
  if (width > maxW) { out.width = width = maxW }
  if (height > maxH) { out.height = height = maxH }
  const nl = Math.min(Math.max(m, left), W - width - m), nt = Math.min(Math.max(m, top), H - height - m)
  if (Math.round(nl) !== Math.round(left)) out.left = Math.round(nl)
  if (Math.round(nt) !== Math.round(top)) out.top = Math.round(nt)
  return out
}

/** Скільки висоти дати вмісту діалогу: екран мінус рамка (шапка, кнопки, відступи), не менше 120 */
export const contentMax = (screenH, frameH, contentH, m = M) => Math.max(120, Math.floor(screenH - 2 * m - (frameH - contentH)))

const isDialog = app => !!app?.element?.classList?.contains('god-dialog')   // лише діалоги системи — чужі не чіпаємо
const ours = app => {
  const el = app?.element
  if (!el?.classList || !app.hasFrame) return false
  return el.classList.contains('god') || isDialog(app)
}

function fitDialog(app) {
  const el = app.element
  if (!el.querySelector('.dialog-content')) return false
  // рамка — за вмістом (зафіксована раніше висота обрізала б кнопки)
  if (el.style.height && el.style.height !== 'auto') { app.setPosition({ height: 'auto' }); el.style.height = 'auto' }
  return sizeDialog(el)
}

/** Обмежити вміст діалогу так, щоб уся рамка вмістилась у вікно браузера */
export function sizeDialog(el, H = window.innerHeight) {
  const dc = el.querySelector('.dialog-content')
  if (!dc) return false
  // «рамка без вмісту» = шапка + кнопки + відступи: міряємо, стиснувши вміст до нуля
  dc.style.overflowY = 'hidden'
  dc.style.maxHeight = '0px'
  const chrome = el.getBoundingClientRect().height
  dc.style.maxHeight = `${contentMax(H, chrome, 0)}px`
  dc.style.overflowY = 'auto'
  return true
}

function fit(app) {
  if (!ours(app) || app.minimized || !app.rendered) return
  const dialog = isDialog(app) && fitDialog(app)
  const r = app.element.getBoundingClientRect()
  if (!r.width || !r.height) return
  const pos = fitRect({ left: r.left, top: r.top, width: r.width, height: r.height }, window.innerWidth, window.innerHeight)
  if (dialog) delete pos.height        // висоту діалогу вже обмежено вмістом
  if (Object.keys(pos).length) app.setPosition(pos)
}

/** Діалог міг вирости (розгорнули «Додатково», додали рядок) — підігнати ще раз */
function watch(app) {
  const el = app.element
  if (!isDialog(app) || el.dataset.godFit) return
  el.dataset.godFit = '1'
  let t = null
  const again = () => { clearTimeout(t); t = setTimeout(() => fit(app), 30) }
  el.addEventListener('toggle', again, true)
  const form = el.querySelector('.dialog-content')
  if (form && typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(again)
    for (const child of form.children) ro.observe(child)
  }
}

export function registerFit() {
  Hooks.on('renderApplicationV2', app => requestAnimationFrame(() => { fit(app); if (ours(app)) watch(app) }))
  let t = null
  window.addEventListener('resize', () => {
    clearTimeout(t)
    t = setTimeout(() => { for (const app of foundry.applications.instances?.values?.() ?? []) fit(app) }, 150)
  })
}
