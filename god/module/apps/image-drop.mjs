/**
 * Картинки з комп'ютера — перетягуванням на лист.
 * Тягнеш файл з провідника на лист → над портретом з'являються дві зони:
 *   «Портрет» — картинка листа (токен іде за нею, якщо окремого не задано), далі — кадрування;
 *   «Токен»   — окрема картинка для мапи, далі — масштаб, віддзеркалення, вписування, кільце.
 * Файл не перекодовується: PNG/WebP без фону лишаються прозорими.
 * Гравцю без права «Завантажувати файли» картинку завантажує майстер (через сокет системи).
 */
import { editPortrait, DEFAULT_CROP } from './portrait-editor.mjs'

const FP = () => foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const MAX_MB = 20, VIA_GM_MAX_MB = 8
const IMAGE_EXT = /\.(png|webp|jpe?g|gif|avif|svg)$/i
const VIDEO_EXT = /\.(webm|mp4|m4v)$/i

/** Ім'я файлу: латиниця й цифри (Foundry і браузери не люблять пробіли та кирилицю в шляхах) */
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ъ: '', ё: 'yo' }
export const slug = s => String(s ?? '').toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image'
const dir = () => `worlds/${game.world.id}/god-images`

/** Чи підходить файл: картинка (або відео для токена) і розмір */
export function checkFile(file, { video = false } = {}) {
  if (!file) return 'Це не файл'
  const okType = file.type?.startsWith('image/') || IMAGE_EXT.test(file.name) || (video && (file.type?.startsWith('video/') || VIDEO_EXT.test(file.name)))
  if (!okType) return `«${file.name}» — не картинка${video ? ' і не відео' : ''}`
  if (file.size > MAX_MB * 1024 * 1024) return `«${file.name}» завелике (${(file.size / 1048576).toFixed(1)} МБ, можна до ${MAX_MB})`
  return null
}

async function ensureDir(path) {
  try { await FP().createDirectory('data', path, {}) } catch { /* уже є */ }
}

/** Завантажити файл у теку світу. Повертає шлях */
export async function uploadImage(file, base) {
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.png').toLowerCase()
  const name = `${slug(base)}-${Date.now().toString(36)}${ext}`
  if (game.user.can?.('FILES_UPLOAD')) {
    await ensureDir(dir())
    const res = await FP().upload('data', dir(), new File([file], name, { type: file.type }), {}, { notify: false })
    if (res?.path || res?.status === 'success') return res.path ?? `${dir()}/${name}`
    throw new Error(res?.message ?? 'Foundry не прийняв файл')
  }
  return uploadViaGM(file, name)
}

// ── Через майстра: гравцям у Foundry за замовчуванням не можна завантажувати файли ──
const pending = new Map()
async function uploadViaGM(file, name) {
  if (!game.users.activeGM) throw new Error('немає майстра онлайн, а тобі не дозволено завантажувати файли (Налаштування → Права користувачів → «Завантажувати файли»)')
  if (file.size > VIA_GM_MAX_MB * 1024 * 1024) throw new Error(`через майстра — до ${VIA_GM_MAX_MB} МБ; зменш картинку або попроси право «Завантажувати файли»`)
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  const id = foundry.utils.randomID()
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('майстер не відповів — спробуй ще раз')) }, 30000)
    pending.set(id, { resolve: p => { clearTimeout(timer); resolve(p) }, reject: e => { clearTimeout(timer); reject(e) } })
  })
  game.socket.emit('system.god', { op: 'upload', id, name, type: file.type, data, from: game.user.id })
  return done
}

/** Сокет: майстер приймає файл від гравця, гравець отримує шлях */
export function registerImageSocket() {
  game.socket.on('system.god', async msg => {
    if (msg?.op === 'uploaded' && msg.to === game.user.id) {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      return msg.path ? p.resolve(msg.path) : p.reject(new Error(msg.error ?? 'не вдалося'))
    }
    if (msg?.op !== 'upload' || game.user !== game.users.activeGM) return
    const reply = extra => game.socket.emit('system.god', { op: 'uploaded', id: msg.id, to: msg.from, ...extra })
    try {
      const name = String(msg.name ?? '').replace(/[^a-z0-9.\-]/gi, '').slice(0, 80)
      if (!IMAGE_EXT.test(name) && !VIDEO_EXT.test(name)) throw new Error('лише картинки й відео')
      const bin = atob(msg.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      await ensureDir(dir())
      const res = await FP().upload('data', dir(), new File([bytes], name, { type: msg.type }), {}, { notify: false })
      reply({ path: res?.path ?? `${dir()}/${name}` })
    } catch (err) {
      reply({ error: err.message })
    }
  })
}

// ── Застосування ──────────────────────────────────────────────────────────────
export async function setPortraitFromFile(actor, file) {
  const err = checkFile(file)
  if (err) return ui.notifications.warn(err)
  const path = await uploadImage(file, `${actor.name}-portrait`)
  // токен іде за портретом сам (якщо окремого не задано) — так і задумано
  await actor.update({ img: path, 'flags.god.portrait': { ...DEFAULT_CROP } })
  ui.notifications.info(`${actor.name}: портрет оновлено${actor.tokenFollowsPortrait?.() ? ' (і токен)' : ''}`)
  return editPortrait(actor, { height: actor.type === 'npc' ? 220 : 260 })
}

export async function setTokenFromFile(actor, file) {
  const err = checkFile(file, { video: true })
  if (err) return ui.notifications.warn(err)
  const path = await uploadImage(file, `${actor.name}-token`)
  await actor.setTokenImage(path)
  return editTokenLook(actor)
}

/** Поточний вигляд токена (прототип або сам токен для неприв'язаного) */
function tokenDoc(actor) { return actor.isToken ? actor.token : actor.prototypeToken }
function readLook(actor) {
  const t = tokenDoc(actor), tex = t?.texture ?? {}
  const sx = Number(tex.scaleX ?? 1) || 1, sy = Number(tex.scaleY ?? 1) || 1
  return {
    src: tex.src || actor.img, scale: Math.abs(sx), mirror: sx < 0, flipY: sy < 0,
    fit: tex.fit ?? 'contain', ring: !!t?.ring?.enabled, hasRing: t?.ring !== undefined,
  }
}

/** Масштаб, віддзеркалення, вписування й кільце — для прототипу й усіх уже поставлених токенів актора */
export async function applyTokenLook(actor, look) {
  const data = {
    'texture.scaleX': look.scale * (look.mirror ? -1 : 1),
    'texture.scaleY': look.scale * (look.flipY ? -1 : 1),
    'texture.fit': look.fit,
  }
  if (look.hasRing) data['ring.enabled'] = !!look.ring
  if (actor.isToken) return actor.token.update(data)
  await actor.update(Object.fromEntries(Object.entries(data).map(([k, v]) => [`prototypeToken.${k}`, v])))
  if (!actor.prototypeToken.actorLink && !game.user.isGM) return
  const scenes = game.user.isGM ? game.scenes.contents : (canvas?.scene ? [canvas.scene] : [])
  for (const scene of scenes) {
    const ups = scene.tokens.filter(t => t.actorId === actor.id && t.isOwner).map(t => ({ _id: t.id, ...data }))
    if (ups.length) await scene.updateEmbeddedDocuments('Token', ups).catch(e => console.warn('G.O.D. | вигляд токена', e))
  }
}

const FITS = { contain: 'Вписати цілком', cover: 'Заповнити клітинку', fill: 'Розтягнути', width: 'За шириною', height: 'За висотою' }

/** Вікно «Вигляд токена»: прев'ю в клітинці сітки й кілька повзунків */
export async function editTokenLook(actor) {
  const look = readLook(actor)
  const isVideo = VIDEO_EXT.test(look.src)
  const media = isVideo ? `<video src="${esc(look.src)}" autoplay loop muted></video>` : `<img src="${esc(look.src)}" alt="" draggable="false">`
  const content = `
    <div class="god-tok-preview"><div class="god-tok-cell ${look.ring ? 'ring' : ''}">${media}</div></div>
    <label class="god-dlg-field"><span><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Масштаб <b data-out>${look.scale.toFixed(2)}×</b></span>
      <input type="range" name="scale" min="0.3" max="3" step="0.05" value="${look.scale}"></label>
    <label class="god-dlg-field"><span>Як вписати в клітинку</span><select name="fit">${Object.entries(FITS).map(([k, v]) => `<option value="${k}" ${k === look.fit ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="god-dlg-check"><input type="checkbox" name="mirror" ${look.mirror ? 'checked' : ''}><span>Віддзеркалити (дивиться в інший бік)</span></label>
    ${look.hasRing ? `<label class="god-dlg-check"><input type="checkbox" name="ring" ${look.ring ? 'checked' : ''}><span>Кільце токена Foundry (рамка й смуга здоров'я по колу)</span></label>` : ''}
    <p class="god-hint">Для картинок без фону зазвичай: «Вписати цілком», масштаб 1–1.3, без кільця. Розмір у клітинках — у ворога за розміром істоти.</p>`
  const bind = root => {
    const cell = root?.querySelector?.('.god-tok-cell'), m = cell?.firstElementChild
    if (!cell) return
    const f = n => root.querySelector(`[name="${n}"]`)
    const apply = () => {
      const s = Number(f('scale').value) || 1
      m.style.transform = `scale(${f('mirror').checked ? -s : s}, ${s})`
      m.style.objectFit = { contain: 'contain', cover: 'cover', fill: 'fill', width: 'contain', height: 'contain' }[f('fit').value]
      cell.classList.toggle('ring', !!f('ring')?.checked)
      root.querySelector('[data-out]').textContent = `${s.toFixed(2)}×`
    }
    for (const n of ['scale', 'fit', 'mirror', 'ring']) f(n)?.addEventListener('input', apply)
    apply()
  }
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: `Токен: ${actor.name}`, icon: 'fa-solid fa-chess-pawn' },
    classes: ['god-dialog', 'god-tok-dialog'], position: { width: 340 }, rejectClose: false, content,
    render: (event, dialog) => bind(dialog?.element ?? event?.target?.element ?? dialog),
    buttons: [{ action: 'save', label: 'Зберегти', icon: 'fa-solid fa-check', default: true,
      callback: (ev, btn) => {
        const el = btn.form.elements
        return { scale: Number(el.scale.value) || 1, fit: el.fit.value, mirror: el.mirror.checked, ring: !!el.ring?.checked }
      } }],
  })
  if (!res || typeof res !== 'object') return
  return applyTokenLook(actor, { ...look, ...res })
}

/**
 * Зони скидання на листі. Викликати один раз на корені листа (у _onFirstRender).
 * Поки файл тягнуть над листом — у корені клас god-file-drag, над портретом видно дві зони.
 */
export function bindImageDrop(sheet, root) {
  const hasFiles = ev => [...(ev.dataTransfer?.types ?? [])].includes('Files')
  let depth = 0
  const off = () => { depth = 0; root.classList.remove('god-file-drag'); root.querySelectorAll('.god-drop-zone.over').forEach(z => z.classList.remove('over')) }
  root.addEventListener('dragenter', ev => { if (!hasFiles(ev) || !sheet.isEditable) return; depth++; root.classList.add('god-file-drag') })
  root.addEventListener('dragleave', ev => { if (!hasFiles(ev)) return; if (--depth <= 0) off() })
  root.addEventListener('dragover', ev => {
    if (!hasFiles(ev) || !sheet.isEditable) return
    const zone = ev.target.closest?.('.god-drop-zone')
    root.querySelectorAll('.god-drop-zone').forEach(z => z.classList.toggle('over', z === zone))
    if (zone) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy' }
  })
  root.addEventListener('drop', async ev => {
    const zone = ev.target.closest?.('.god-drop-zone')
    if (!hasFiles(ev)) return
    off()
    if (!zone || !sheet.isEditable) return
    ev.preventDefault(); ev.stopPropagation()
    const file = ev.dataTransfer.files?.[0]
    try {
      if (zone.dataset.drop === 'token') await setTokenFromFile(sheet.document, file)
      else await setPortraitFromFile(sheet.document, file)
    } catch (err) {
      console.error('G.O.D. | картинка', err)
      ui.notifications.error(`Не вдалося завантажити картинку: ${err.message}`)
    }
  }, true)
  root.addEventListener('dragend', off)
  window.addEventListener('dragend', off)
}
