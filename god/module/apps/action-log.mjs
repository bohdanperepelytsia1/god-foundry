/**
 * Журнал дій гравців — для майстра, окремо від чату (кидки лишаються в чаті, сюди не йдуть).
 * Пише лише активний майстер: хуки змін документів приходять йому від усіх клієнтів разом з id користувача.
 * Старі значення беремо зі знімка, який майстер тримає в пам'яті (після оновлення Foundry їх уже не віддає).
 * Зберігається в налаштуванні світу, останні MAX записів.
 */
import { GOD } from '../config.mjs'

const MAX = 2000
const MERGE_MS = 20000   // кілька кліків «−» по HP за 20 с — один запис
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ── Підписи полів ──
const SKILL_NAMES = Object.fromEntries(Object.values(GOD.SKILL_CATEGORIES).flatMap(c => c.skills.map(s => [s.key, s.name])))
const RES_ABBR = { ...Object.fromEntries(Object.entries(GOD.RESOURCES).map(([k, r]) => [k, r.abbr])), pr: 'PR', mr: 'MR', spr: 'PR щита', smr: 'MR щита' }
const FIXED = {
  'system.progress.xp': 'XP', 'system.progress.skillPoints': 'очки вмінь', 'system.progress.statPoints': 'очки характеристик',
  'system.shieldUp': 'щит піднято', 'system.stance': 'стійка', 'system.combat.dodgeBonus': 'правка ШУ',
  'system.details.race': 'раса', 'system.details.origin': 'походження', 'system.details.age': 'вік', 'system.biography': 'біографія',
  'system.encumbrance.override': 'навантаження вручну', name: 'ім\'я', img: 'портрет',
}
const ITEM_FIXED = {
  'system.quantity': 'кількість', 'system.location': 'де лежить', 'system.equipped': 'одягнено', 'system.hand': 'рука',
  'system.category': 'категорія', 'system.description': 'опис', 'system.weight': 'вага', name: 'назва', img: 'іконка',
  'system.phys': 'фіз', 'system.mag': 'маг', 'system.level': 'рівень', 'system.quiverCap': 'місткість сагайдака',
}
// Шум: службові поля, порядок, прапорці (налаштування панелі тощо)
const SKIP = /^(_id|_stats|sort|flags|ownership|folder|prototypeToken|system\.floors|system\.rollMods|system\.rollDis|system\.combat\.(hitMod|damageMod|allMod|noBonus))(\.|$)/

export function actorLabel(path) {
  if (FIXED[path]) return FIXED[path]
  let m = path.match(/^system\.resources\.(\w+)\.(value|bonus)$/)
  if (m) return `${RES_ABBR[m[1]] ?? m[1].toUpperCase()}${m[2] === 'bonus' ? ' (бонус макс.)' : ''}`
  if ((m = path.match(/^system\.stats\.(\w+)\.value$/))) return GOD.STATS[m[1]]?.label ?? m[1]
  if ((m = path.match(/^system\.skills\.\w+\.(.+)$/))) return `вміння «${SKILL_NAMES[m[1]] ?? m[1]}»`
  if ((m = path.match(/^system\.schools\.(\w+)$/))) return `школа «${GOD.SPELL_SCHOOLS[m[1]]?.label ?? GOD.SPELL_SCHOOLS[m[1]] ?? m[1]}»`
  if ((m = path.match(/^system\.money\.(\w+)$/))) return GOD.MONEY[m[1]]?.label ?? m[1]
  if ((m = path.match(/^system\.reputation\.(\w+)$/))) return GOD.REPUTATION[m[1]]?.label ?? m[1]
  return path.replace(/^system\./, '')
}

const short = v => {
  if (v === undefined || v === null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'так' : 'ні'
  if (typeof v === 'object') return Array.isArray(v) ? `список (${v.length})` : '…'
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length > 40 ? s.slice(0, 38) + '…' : s
}
const isNum = v => typeof v === 'number' && Number.isFinite(v)

/** Зміни героя/ворога → частини запису. before/after — плоскі об'єкти (flattenObject) */
export function actorParts(before, changes) {
  const parts = []
  for (const [k, to] of Object.entries(changes)) {
    if (SKIP.test(k)) continue
    const from = before?.[k]
    if (from === to || (typeof to === 'object' && to !== null && !Array.isArray(to))) continue
    if (k.startsWith('system.knowledge') || k.startsWith('system.customSkills')) { parts.push({ k: k.split('.').slice(0, 2).join('.'), text: k.includes('customSkills') ? 'особливі вміння' : 'знання', edit: true }); continue }
    if (k === 'system.biography' || k === 'img') { parts.push({ k, text: actorLabel(k), edit: true }); continue }
    parts.push({ k, label: actorLabel(k), from: isNum(from) || typeof from === 'boolean' ? from : short(from), to: isNum(to) || typeof to === 'boolean' ? to : short(to) })
  }
  // однакові «змінив знання» — один раз
  return parts.filter((p, i) => !p.edit || parts.findIndex(q => q.k === p.k) === i)
}

/** Зміни предмета → частини запису */
export function itemParts(name, before, changes) {
  const parts = []
  const n = `«${name}»`
  for (const [k, to] of Object.entries(changes)) {
    if (SKIP.test(k)) continue
    const from = before?.[k]
    if (from === to || (typeof to === 'object' && to !== null && !Array.isArray(to))) continue
    if (k === 'system.equipped') { parts.push({ k, text: `${to ? 'одягнув / взяв' : 'зняв'} ${n}` }); continue }
    if (k === 'system.location') { parts.push({ k, text: `переклав ${n}: ${GOD.INVENTORY_LOCATIONS[from] ?? from ?? '—'} → ${GOD.INVENTORY_LOCATIONS[to] ?? to}` }); continue }
    if (k === 'system.quantity') { parts.push({ k, label: `${n} ×`, from, to }); continue }
    if (k === 'system.hand') { parts.push({ k, text: `${n}: ${to === 'off' ? 'у ліву руку' : 'у праву руку'}` }); continue }
    if (k === 'system.description' || k === 'img') { parts.push({ k, text: `змінив ${ITEM_FIXED[k]} ${n}`, edit: true }); continue }
    parts.push({ k, label: `${n}: ${ITEM_FIXED[k] ?? k.replace(/^system\./, '')}`, from: isNum(from) || typeof from === 'boolean' ? from : short(from), to: isNum(to) || typeof to === 'boolean' ? to : short(to) })
  }
  return parts
}

/** Текст частини: «HP 120 → 95 (−25)» */
export function partText(p) {
  if (p.text) return p.text
  const d = isNum(p.from) && isNum(p.to) ? p.to - p.from : null
  const delta = d ? ` (${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 100) / 100)})` : ''
  return `${p.label} ${short(p.from)} → ${short(p.to)}${delta}`
}

/** Додати запис до журналу (чиста логіка — для тестів): той самий гравець, той самий герой, ті самі числові поля за MERGE_MS — зливаємо */
export function pushEntry(log, e) {
  const last = log[log.length - 1]
  const sig = x => x.parts.map(p => p.text ? `t:${p.text}` : `v:${p.k}`).join('|')
  if (last && last.u === e.u && last.a === e.a && last.i === e.i && e.t - last.t < MERGE_MS && e.parts.every(p => !p.text) && sig(last) === sig(e)) {
    last.parts = last.parts.map((p, n) => ({ ...p, to: e.parts[n].to }))
    last.t = e.t
    // повернулось до початкового значення — запис зайвий
    if (last.parts.every(p => p.from === p.to)) log.pop()
    return log
  }
  log.push(e)
  if (log.length > MAX) log.splice(0, log.length - MAX)
  return log
}

// ── Запис (лише активний майстер) ──
const snap = new Map()   // uuid → плоский _source (актор або предмет)
const flat = doc => foundry.utils.flattenObject(doc._source ?? doc.toObject?.() ?? {})
let log = null, saveTimer = null
let actingFor = null     // майстер виконує дію гравця (урон із сокета) — запис на гравця

const isWriter = () => game.user === game.users.activeGM
function getLog() { return (log ??= foundry.utils.deepClone(game.settings.get('god', 'actionLog') ?? [])) }
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => game.settings.set('god', 'actionLog', getLog()).catch(err => console.warn('G.O.D. | журнал', err)), 1500)
  GodActionLog.instance?.render()
}

function add(userId, actor, parts, item = null) {
  if (!parts.length || !actor) return
  const uid = actingFor ?? userId
  const user = game.users.get(uid)
  if (!user) return
  pushEntry(getLog(), { t: Date.now(), u: uid, un: user.name, gm: user.isGM, a: actor.uuid ?? actor.id, an: actor.name, i: item?.id ?? null, parts })
  save()
}

/** Майстер робить щось від імені гравця (наприклад, застосовує урон з картки) — записати на гравця */
export async function actAs(userId, fn) {
  const prev = actingFor
  actingFor = userId && game.users.get(userId) ? userId : prev
  try { return await fn() } finally { actingFor = prev }
}

const ownerActor = doc => doc?.parent instanceof Actor ? doc.parent : (doc?.actor ?? null)

export function registerActionLog() {
  game.settings.register('god', 'actionLog', { scope: 'world', config: false, type: Array, default: [], onChange: () => { if (!isWriter()) log = null; GodActionLog.instance?.render() } })
  game.settings.register('god', 'actionLogOn', {
    name: 'Журнал дій гравців', hint: 'Майстер бачить, що гравці міняли в героях і предметах (окремо від чату). Відкрити — кнопка «Журнал дій» у вкладці акторів або на панелі токенів.',
    scope: 'world', config: true, type: Boolean, default: true,
  })
  const on = () => isWriter() && game.settings.get('god', 'actionLogOn')

  Hooks.once('ready', () => {
    if (!isWriter()) return
    for (const a of game.actors) { snap.set(a.uuid, flat(a)); for (const i of a.items) snap.set(i.uuid, flat(i)) }
  })
  const remember = doc => { if (isWriter()) snap.set(doc.uuid, flat(doc)) }

  Hooks.on('updateActor', (actor, changes, options, userId) => {
    const before = snap.get(actor.uuid)
    remember(actor)
    if (!on() || options.godMigration || options.godNoLog) return
    add(userId, actor, actorParts(before, foundry.utils.flattenObject(changes)))
  })
  Hooks.on('createActor', (actor, options, userId) => { remember(actor); if (on() && !game.users.get(userId)?.isGM) add(userId, actor, [{ text: `створив актора «${actor.name}»` }]) })
  Hooks.on('deleteActor', (actor, options, userId) => { snap.delete(actor.uuid); if (on() && !game.users.get(userId)?.isGM) add(userId, actor, [{ text: `видалив актора «${actor.name}»` }]) })

  Hooks.on('createItem', (item, options, userId) => {
    remember(item)
    const actor = ownerActor(item)
    if (!on() || !actor || options.godMigration) return
    const q = item.system.quantity ?? 1
    add(userId, actor, [{ text: `отримав «${item.name}»${q > 1 ? ` ×${q}` : ''}${item.system.location === 'quiver' ? ' (у сагайдак)' : ''}` }], item)
  })
  Hooks.on('deleteItem', (item, options, userId) => {
    snap.delete(item.uuid)
    const actor = ownerActor(item)
    if (!on() || !actor || options.godMigration) return
    const q = item.system.quantity ?? 1
    add(userId, actor, [{ text: `позбувся «${item.name}»${q > 1 ? ` ×${q}` : ''}` }], item)
  })
  Hooks.on('updateItem', (item, changes, options, userId) => {
    const before = snap.get(item.uuid)
    remember(item)
    const actor = ownerActor(item)
    if (!on() || !actor || options.godMigration || options.godNoLog) return
    add(userId, actor, itemParts(before?.name ?? item.name, before, foundry.utils.flattenObject(changes)), item)
  })
  // Стани й ефекти
  for (const [hook, verb] of [['createActiveEffect', 'отримав ефект'], ['deleteActiveEffect', 'втратив ефект']]) {
    Hooks.on(hook, (eff, options, userId) => {
      const actor = ownerActor(eff)
      if (on() && actor && !options.godMigration) add(userId, actor, [{ text: `${verb} «${eff.name}»` }])
    })
  }
  Hooks.on('updateActiveEffect', (eff, changes, options, userId) => {
    const actor = ownerActor(eff)
    if (on() && actor && 'disabled' in changes) add(userId, actor, [{ text: `${changes.disabled ? 'вимкнув' : 'увімкнув'} ефект «${eff.name}»` }])
  })

  // Кнопки: вкладка акторів і панель токенів
  Hooks.on('renderActorDirectory', (app, html) => {
    if (!game.user.isGM) return
    const root = html instanceof HTMLElement ? html : html?.[0]
    const footer = root?.querySelector('.directory-footer') ?? root?.querySelector('footer')
    if (!footer || footer.querySelector('.god-log-btn')) return
    const btn = document.createElement('button')
    btn.type = 'button'; btn.className = 'god-log-btn'
    btn.innerHTML = '<i class="fa-solid fa-scroll"></i> Журнал дій'
    btn.addEventListener('click', () => GodActionLog.open())
    footer.append(btn)
  })
  Hooks.on('getSceneControlButtons', controls => {
    if (!game.user.isGM) return
    const tool = { name: 'godLog', title: 'Журнал дій гравців', icon: 'fa-solid fa-scroll', order: 100, button: true, visible: true,
      onChange: () => GodActionLog.open(), onClick: () => GodActionLog.open() }
    const tokens = controls?.tokens ?? (Array.isArray(controls) ? controls.find(c => c.name === 'token') : null)
    if (!tokens) return
    if (Array.isArray(tokens.tools)) tokens.tools.push(tool)
    else if (tokens.tools) tokens.tools.godLog = tool
  })
}

// ── Вікно журналу ──
const fmtTime = t => new Date(t).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtDay = t => new Date(t).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })

export class GodActionLog extends foundry.applications.api.ApplicationV2 {
  static instance = null
  static DEFAULT_OPTIONS = {
    id: 'god-action-log', classes: ['god', 'god-log-app'],
    window: { title: 'Журнал дій гравців', icon: 'fa-solid fa-scroll', resizable: true },
    position: { width: 560, height: 640 },
  }
  filter = { user: '', actor: '', q: '', gm: false }

  static open() {
    if (!game.user.isGM) return ui.notifications.warn('Журнал дій бачить лише майстер')
    ;(GodActionLog.instance ??= new GodActionLog()).render({ force: true })
  }
  _onClose(o) { super._onClose?.(o); GodActionLog.instance = null }

  async _renderHTML() {
    const all = isWriter() ? getLog() : (game.settings.get('god', 'actionLog') ?? [])
    const f = this.filter, q = f.q.trim().toLowerCase()
    const rows = all.filter(e => (f.gm || !e.gm) && (!f.user || e.u === f.user) && (!f.actor || e.a === f.actor))
      .map(e => ({ e, text: e.parts.map(partText).join(' · ') }))
      .filter(r => !q || `${r.e.un} ${r.e.an} ${r.text}`.toLowerCase().includes(q))
      .reverse()
    const users = [...new Map(all.filter(e => f.gm || !e.gm).map(e => [e.u, e.un])).entries()]
    const actors = [...new Map(all.filter(e => f.gm || !e.gm).map(e => [e.a, e.an])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'uk'))
    const color = id => game.users.get(id)?.color?.css ?? game.users.get(id)?.color ?? '#888'
    let day = '', list = ''
    for (const { e, text } of rows.slice(0, 600)) {
      const d = fmtDay(e.t)
      if (d !== day) { day = d; list += `<li class="god-log-day">${esc(d)}</li>` }
      list += `<li class="god-log-row"><time>${fmtTime(e.t)}</time><span class="god-log-who"><i style="background:${esc(color(e.u))}"></i>${esc(e.un)}</span>` +
        `<span class="god-log-what"><b>${esc(e.an)}</b> ${esc(text)}</span></li>`
    }
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`
    const off = !game.settings.get('god', 'actionLogOn')
    return `<div class="god-log">
      ${off ? '<p class="god-log-off"><i class="fa-solid fa-circle-pause"></i> Запис вимкнено в налаштуваннях системи.</p>' : ''}
      <div class="god-log-bar">
        <input type="search" name="q" value="${esc(f.q)}" placeholder="Пошук: ім'я, предмет, HP…">
        <select name="user">${opt('', 'Усі гравці', f.user)}${users.map(([id, n]) => opt(id, n, f.user)).join('')}</select>
        <select name="actor">${opt('', 'Усі персонажі', f.actor)}${actors.map(([id, n]) => opt(id, n, f.actor)).join('')}</select>
      </div>
      <div class="god-log-bar god-log-bar2">
        <label><input type="checkbox" name="gm" ${f.gm ? 'checked' : ''}> Дії майстра</label>
        <span class="god-log-count">${rows.length} з ${all.length}</span>
        <a data-act="export" data-tooltip="Зберегти як .txt"><i class="fa-solid fa-download"></i></a>
        <a data-act="clear" data-tooltip="Очистити журнал"><i class="fa-solid fa-trash"></i></a>
      </div>
      <ol class="god-log-list">${list || '<li class="god-empty">Поки порожньо. Сюди потрапляють зміни героїв, предметів і ефектів, які роблять гравці. Кидки — лише в чаті.</li>'}</ol>
    </div>`
  }

  _replaceHTML(html, content) {
    const keep = content.querySelector('.god-log-list')?.scrollTop ?? 0
    const focus = document.activeElement?.name === 'q' && content.contains(document.activeElement)
    content.innerHTML = html
    const list = content.querySelector('.god-log-list')
    if (list) list.scrollTop = keep
    const q = content.querySelector('input[name=q]')
    if (focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length) }
    let t = null
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { this.filter.q = q.value; this.render() }, 200) })
    for (const k of ['user', 'actor']) content.querySelector(`select[name=${k}]`).addEventListener('change', ev => { this.filter[k] = ev.target.value; this.render() })
    content.querySelector('input[name=gm]').addEventListener('change', ev => { this.filter.gm = ev.target.checked; this.render() })
    content.querySelector('[data-act=export]').addEventListener('click', () => {
      const all = isWriter() ? getLog() : game.settings.get('god', 'actionLog')
      const txt = all.map(e => `${new Date(e.t).toLocaleString('uk-UA')}\t${e.un}\t${e.an}\t${e.parts.map(partText).join(' · ')}`).join('\n')
      foundry.utils.saveDataToFile(txt, 'text/plain', `god-journal-${new Date().toISOString().slice(0, 10)}.txt`)
    })
    content.querySelector('[data-act=clear]').addEventListener('click', async () => {
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: 'Очистити журнал?' }, content: '<p>Усі записи буде видалено. Скасувати не можна.</p>', rejectClose: false })
      if (!ok) return
      log = []
      await game.settings.set('god', 'actionLog', [])
      this.render()
    })
  }
}
