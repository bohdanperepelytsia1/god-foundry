/**
 * Вікна під розмір екрана: жодне вікно системи (лист, діалог, панель) не виходить за край,
 * а кнопки внизу діалогу завжди видно — прокручується лише вміст.
 * CSS обмежує висоту (див. «Вікна під екран» у god.css), а тут вікно підсувається,
 * щоб верх і низ були на екрані: після відкриття, при зміні розміру вікна браузера.
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

const ours = app => {
  const el = app?.element
  if (!el?.classList || !app.hasFrame) return false
  return el.classList.contains('god') || el.classList.contains('god-dialog') || el.classList.contains('dialog')
    || app instanceof foundry.applications.api.DialogV2
}

function fit(app) {
  if (!ours(app) || app.minimized || !app.rendered) return
  const r = app.element.getBoundingClientRect()
  if (!r.width || !r.height) return
  const pos = fitRect({ left: r.left, top: r.top, width: r.width, height: r.height }, window.innerWidth, window.innerHeight)
  if (Object.keys(pos).length) app.setPosition(pos)
}

export function registerFit() {
  Hooks.on('renderApplicationV2', app => requestAnimationFrame(() => fit(app)))
  let t = null
  window.addEventListener('resize', () => {
    clearTimeout(t)
    t = setTimeout(() => { for (const app of foundry.applications.instances?.values?.() ?? []) fit(app) }, 150)
  })
}
