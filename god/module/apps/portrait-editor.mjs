/**
 * Портрет листа: вибір шматка картинки (зсув і масштаб) без зміни самого файлу.
 * Зберігається у flags.god.portrait = { x, y, zoom } — відсотки object-position і множник масштабу.
 * Токен — окрема картинка (prototypeToken), портрет на нього не впливає.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const FP = () => foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker

export const DEFAULT_CROP = { x: 50, y: 0, zoom: 1 }
export const portraitCrop = actor => ({ ...DEFAULT_CROP, ...(actor?.getFlag?.('god', 'portrait') ?? {}) })
/** CSS-змінні для <img class="god-portrait"> */
export const cropStyle = c => `--px: ${c.x}%; --py: ${c.y}%; --pz: ${c.zoom};`

export async function editPortrait(actor, { height = 260 } = {}) {
  const state = { src: actor.img, ...portraitCrop(actor) }
  const content = `
    <div class="god-crop" style="height:${height}px"><img class="god-portrait-img" src="${esc(state.src)}" alt="" draggable="false"></div>
    <label class="god-dlg-field god-crop-zoom"><span><i class="fa-solid fa-magnifying-glass-plus"></i> Масштаб</span>
      <input type="range" name="zoom" min="1" max="4" step="0.05" value="${state.zoom}"></label>
    <p class="god-hint">Тягни картинку мишею, щоб вибрати шматок. Коліщатко — масштаб.</p>
    <div class="god-crop-tools">
      <button type="button" data-crop="pick"><i class="fa-solid fa-image"></i> Інша картинка</button>
      <button type="button" data-crop="reset"><i class="fa-solid fa-rotate-left"></i> Скинути</button>
    </div>`
  const bind = root => {
    const box = root?.querySelector?.('.god-crop'), img = box?.querySelector('img'), zoom = root.querySelector('[name="zoom"]')
    if (!box) return
    const apply = () => { img.style.cssText = cropStyle(state); zoom.value = state.zoom }
    apply()
    let drag = null
    box.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, sx: state.x, sy: state.y }; box.setPointerCapture(ev.pointerId); box.classList.add('dragging') })
    box.addEventListener('pointermove', ev => {
      if (!drag) return
      // Тягнемо картинку: рух вправо відкриває лівіший шматок
      const k = 100 / state.zoom
      state.x = clamp(drag.sx - (ev.clientX - drag.x) / box.clientWidth * k, 0, 100)
      state.y = clamp(drag.sy - (ev.clientY - drag.y) / box.clientHeight * k, 0, 100)
      apply()
    })
    const stop = () => { drag = null; box.classList.remove('dragging') }
    box.addEventListener('pointerup', stop); box.addEventListener('pointercancel', stop)
    box.addEventListener('wheel', ev => { ev.preventDefault(); state.zoom = clamp(+(state.zoom - Math.sign(ev.deltaY) * 0.1).toFixed(2), 1, 4); apply() }, { passive: false })
    zoom.addEventListener('input', () => { state.zoom = Number(zoom.value) || 1; apply() })
    root.querySelector('[data-crop="reset"]').addEventListener('click', () => { Object.assign(state, DEFAULT_CROP); apply() })
    root.querySelector('[data-crop="pick"]').addEventListener('click', () => {
      new (FP())({ type: 'image', current: state.src, callback: path => { state.src = path; img.src = path; Object.assign(state, DEFAULT_CROP); apply() } }).browse()
    })
  }
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: `Портрет: ${actor.name}`, icon: 'fa-solid fa-crop-simple' },
    classes: ['god-dialog', 'god-crop-dialog'], position: { width: 340 }, rejectClose: false, content,
    render: (event, dialog) => bind(dialog?.element ?? event?.target?.element ?? dialog),
    buttons: [{ action: 'save', label: 'Зберегти', icon: 'fa-solid fa-check', default: true, callback: () => ({ ...state }) }],
  })
  if (!res || typeof res !== 'object') return
  const upd = { 'flags.god.portrait': { x: Math.round(res.x * 10) / 10, y: Math.round(res.y * 10) / 10, zoom: res.zoom } }
  if (res.src !== actor.img) upd.img = res.src
  return actor.update(upd)
}

/** Окрема картинка токена: прототип + вже розставлені токени цього актора */
export function pickTokenImage(actor) {
  const cur = actor.isToken ? actor.token?.texture?.src : actor.prototypeToken?.texture?.src
  return new (FP())({ type: 'imagevideo', current: cur, callback: path => actor.setTokenImage(path) }).browse()
}
