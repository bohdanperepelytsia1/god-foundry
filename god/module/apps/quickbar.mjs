/**
 * Швидка панель — смужка внизу екрана для обраного токена (або свого персонажа):
 * портрет, ресурси з ±, ШУ, стійка і слоти швидкого доступу.
 * Слоти: перетягни будь-який предмет персонажа (зброю, заклинання, вміння, зілля) —
 * клік використовує, ПКМ прибирає, перетягування всередині панелі міняє порядок.
 * Поки слотів не налаштовано, панель сама показує зброю в руках і доступні заклинання.
 * Замінює нативний хотбар Foundry: макроси теж кладуться в слоти, клавіші 1–0 запускають слоти.
 * Без персонажа (майстер без токена) панель показує макроси з першої сторінки хотбара користувача.
 */
import { GOD } from '../config.mjs'
import { bindResourceControls } from './res-controls.mjs'

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api
const S = { enabled: 'quickbar', replace: 'replaceHotbar', collapsed: 'quickbarCollapsed', pos: 'quickbarPos' }
const isMacroKey = k => typeof k === 'string' && k.startsWith('m:')

/** Нативний хотбар ховається, коли наша панель його замінює */
export function syncNativeHotbar() {
  const hide = game.settings.get('god', S.enabled) && game.settings.get('god', S.replace)
  document.body.classList.toggle('god-no-hotbar', !!hide)
  return hide
}
export const replacesHotbar = () => document.body.classList.contains('god-no-hotbar')
const AUTO_LIMIT = 10
const GROUP = { weapon: 'atk', spell: 'mag', ability: 'abl', gear: 'gear', armor: 'gear', trait: 'abl' }

export function registerQuickbarSettings() {
  game.settings.register('god', S.enabled, {
    name: 'Швидка панель', hint: 'Смужка внизу екрана з ресурсами й слотами швидкого доступу обраного персонажа.',
    scope: 'client', config: true, type: Boolean, default: true,
    onChange: v => { syncNativeHotbar(); v ? GodQuickbar.instance.render({ force: true }) : GodQuickbar.instance.close() },
  })
  game.settings.register('god', S.replace, {
    name: 'Замість хотбара Foundry', hint: 'Швидка панель займає місце стандартного хотбара: макроси перетягуються в її слоти, клавіші 1–0 запускають слоти.',
    scope: 'client', config: true, type: Boolean, default: true,
    onChange: () => { syncNativeHotbar(); GodQuickbar.refresh() },
  })
  game.settings.register('god', S.collapsed, { scope: 'client', config: false, type: Boolean, default: false })
  game.settings.register('god', S.pos, { scope: 'client', config: false, type: Object, default: {} })
}

export class GodQuickbar extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'god-quickbar',
    tag: 'aside',
    classes: ['god', 'god-quickbar'],
    window: { frame: false, positioned: false },
    actions: {
      use: GodQuickbar.#use, sheet: GodQuickbar.#sheet, stance: GodQuickbar.#stance,
      collapse: GodQuickbar.#collapse, tray: GodQuickbar.#tray, resetSlots: GodQuickbar.#resetSlots,
    },
  }
  static PARTS = { body: { template: 'systems/god/templates/apps/quickbar.hbs' } }

  static #inst
  static get instance() { return (GodQuickbar.#inst ??= new GodQuickbar()) }
  static refresh() {
    if (!game.settings.get('god', S.enabled)) return
    const qb = GodQuickbar.instance
    qb.render({ force: true })
  }

  /** Чий це бар: обраний токен, яким можна керувати → свій персонаж */
  get actor() {
    const t = canvas?.tokens?.controlled?.find(t => t.actor?.isOwner)
    return t?.actor ?? game.user.character ?? null
  }

  /** Слоти з прапорця актора або автоматичний набір */
  static slotIds(actor) {
    const saved = actor.getFlag('god', 'quickbar')
    if (Array.isArray(saved)) return { ids: saved.filter(k => isMacroKey(k) ? !!fromUuidSync(k.slice(2)) : actor.items.has(k)), custom: true }
    const isChar = actor.type === 'character'
    const s = actor.system
    const auto = [
      ...actor.items.filter(i => i.type === 'weapon' && (i.system.equipped || !isChar)),
      ...actor.items.filter(i => i.type === 'spell' && (s.schools?.[i.system.school] ?? 0) > 0),
      ...actor.items.filter(i => i.type === 'ability'),
      ...actor.items.filter(i => i.type === 'gear' && i.system.location === 'belt'),
    ]
    return { ids: auto.slice(0, AUTO_LIMIT).map(i => i.id), custom: false }
  }

  async _prepareContext() {
    const a = this.actor
    const collapsed = game.settings.get('god', S.collapsed)
    if (!a) {
      // Без персонажа: макроси хотбара користувача (сторінка 1), якщо панель замінює хотбар
      const slots = replacesHotbar() ? game.user.getHotbarMacros(1).filter(s => s.macro).map(({ slot, macro }) => ({
        key: macro.uuid, hotSlot: slot, img: macro.img, tip: macro.name, group: 'macro', kind: 'macro',
      })) : []
      this._slots = slots
      return { missing: true, userMode: replacesHotbar(), collapsed, slots: numbered(slots) }
    }
    const sys = a.system
    const isChar = a.type === 'character'
    const bar = k => {
      const r = sys.resources[k]
      return {
        key: k, abbr: GOD.RESOURCES[k]?.abbr ?? k.toUpperCase(),
        label: GOD.RESOURCES[k]?.label, value: r.value, max: r.max,
        pct: r.max > 0 ? Math.max(0, Math.min(100, r.value / r.max * 100)) : 0, damage: k === 'hp',
      }
    }
    const { ids, custom } = GodQuickbar.slotIds(a)
    let prev = null
    const mp = sys.resources.mp?.value ?? 0
    const slots = ids.map((id, index) => {
      if (isMacroKey(id)) {
        const m = fromUuidSync(id.slice(2))
        const gap = prev !== null && prev !== 'macro'
        prev = 'macro'
        return { key: id, index, img: m.img, name: m.name, tip: `Макрос: ${m.name}`, gap, group: 'macro', kind: 'macro' }
      }
      const i = a.items.get(id), s = i.system
      const group = GROUP[i.type] ?? 'gear'
      const gap = prev !== null && prev !== group
      prev = group
      let badge = '', tip = i.name, dim = false
      if (i.type === 'spell') {
        badge = s.manaCost ? `${s.manaCost}` : ''
        tip = `${i.name} · ПППС ${s.threshold} · ${s.manaCost} OM`
        dim = s.manaCost > mp
      } else if (i.type === 'weapon') {
        tip = `Атака: ${i.name}${s.phys ? ` · ${s.phys} фіз` : ''}${s.mag ? ` · ${s.mag} маг` : ''}`
        dim = isChar && !s.equipped
      } else if (i.type === 'gear') {
        badge = s.quantity > 1 ? `×${s.quantity}` : ''
      } else if (i.type === 'ability' && s.manaCost) {
        badge = `${s.manaCost}`; dim = s.manaCost > mp
      }
      return { key: id, index, img: i.img, name: i.name, tip, badge, dim, gap, group, kind: 'item' }
    })
    this._slots = slots
    const stance = a.effects.find(e => e.getFlag('god', 'stance'))?.getFlag('god', 'stance') ?? 'neutral'
    return {
      actor: a, isChar, collapsed, custom,
      bars: (isChar ? ['hp', 'mp', 'ed', 'mt'] : ['hp', 'mp', 'ed']).map(bar),
      armor: ['pr', 'mr'].map(bar).filter(b => b.max > 0 || b.value > 0),
      dodge: sys.derived?.dodge ?? sys.dodge ?? 0,
      stances: [['neutral', 'Нейтральна'], ...Object.entries(GOD.STANCES).map(([id, s]) => [id, s.label])]
        .map(([id, label]) => ({ id, label, icon: `systems/god/assets/icons/stances/${id}.svg`, active: id === stance })),
      slots: numbered(slots),
    }
  }

  /** Клавіші 1–0: запустити слот за номером */
  activateSlot(n) {
    const s = this._slots?.[n]
    if (!s) return false
    this.#run(s.key)
    return true
  }

  async #run(key) {
    if (isMacroKey(key) || this._slots?.find(s => s.key === key)?.kind === 'macro') {
      const m = await fromUuid(isMacroKey(key) ? key.slice(2) : key)
      return m?.execute()
    }
    return this.actor?.items.get(key)?.use()
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this.element.classList.toggle('collapsed', !!context.collapsed)
    this.element.classList.toggle('empty', !!context.missing)
    // Майстру без обраного токена порожня панель лише заважає
    this.element.hidden = !!context.missing && game.user.isGM && !context.userMode
    this.#applyPosition()
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options)
    const el = this.element
    bindResourceControls(el, () => this.actor, { delta: true })

    // ПКМ по слоту — прибрати
    el.addEventListener('contextmenu', ev => {
      const slot = ev.target.closest('[data-slot]')
      if (!slot) return
      ev.preventDefault()
      if (slot.dataset.hotSlot) return game.user.assignHotbarMacro(null, Number(slot.dataset.hotSlot))
      this.#setSlots(ids => ids.filter(id => id !== slot.dataset.key))
    })

    // Перетягування: предмет із листа → новий слот; слот усередині панелі → новий порядок
    el.addEventListener('dragstart', ev => {
      const slot = ev.target.closest('[data-slot]')
      if (!slot) return
      const k = slot.dataset.key
      const data = slot.dataset.hotSlot ? { type: 'Macro', uuid: k, godHotFrom: Number(slot.dataset.hotSlot) }
        : isMacroKey(k) ? { type: 'Macro', uuid: k.slice(2), godQuickFrom: k }
        : { type: 'Item', uuid: this.actor?.items.get(k)?.uuid, godQuickFrom: k }
      ev.dataTransfer.setData('text/plain', JSON.stringify(data))
    })
    el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('drop-hover') })
    el.addEventListener('dragleave', ev => { if (!el.contains(ev.relatedTarget)) el.classList.remove('drop-hover') })
    el.addEventListener('drop', ev => this.#onDrop(ev))

    // Перетягування самої панелі за ручку; подвійний клік — на місце
    const grip = () => el.querySelector('.god-qb-grip')
    el.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.god-qb-grip') !== grip() || ev.button !== 0) return
      ev.preventDefault()
      const r = el.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top
      const move = e => {
        const x = Math.max(0, Math.min(window.innerWidth - r.width, e.clientX - dx))
        const y = Math.max(0, Math.min(window.innerHeight - r.height, e.clientY - dy))
        Object.assign(el.style, { left: `${x}px`, top: `${y}px`, bottom: 'auto', transform: 'none' })
      }
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
        const b = el.getBoundingClientRect()
        game.settings.set('god', S.pos, { left: Math.round(b.left), top: Math.round(b.top) })
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    })
    el.addEventListener('dblclick', ev => {
      if (!ev.target.closest('.god-qb-grip')) return
      game.settings.set('god', S.pos, {}).then(() => this.#applyPosition())
    })
  }

  #applyPosition() {
    const p = game.settings.get('god', S.pos) ?? {}
    const el = this.element
    if (Number.isFinite(p.left) && Number.isFinite(p.top)) {
      const x = Math.min(p.left, Math.max(0, window.innerWidth - 120)), y = Math.min(p.top, Math.max(0, window.innerHeight - 40))
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, bottom: 'auto', transform: 'none' })
    } else {
      Object.assign(el.style, { left: '', top: '', bottom: '', transform: '' })
    }
  }

  async #setSlots(fn) {
    const a = this.actor
    if (!a?.isOwner) return
    const { ids } = GodQuickbar.slotIds(a)
    await a.setFlag('god', 'quickbar', fn([...ids]))
  }

  async #onDrop(ev) {
    ev.preventDefault()
    this.element.classList.remove('drop-hover')
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor
    const data = TE.getDragEventData(ev)
    if (!data?.uuid || !['Item', 'Macro'].includes(data.type)) return
    const targetSlot = ev.target.closest('[data-slot]')
    const a = this.actor

    // Режим без персонажа: це просто хотбар користувача
    if (!a) {
      if (data.type !== 'Macro' || !replacesHotbar()) return
      const macro = await importMacro(data.uuid)
      if (!macro) return
      const to = Number(targetSlot?.dataset.hotSlot) || firstFreeHotSlot()
      if (!to) return ui.notifications.warn('Перша сторінка хотбара заповнена')
      return game.user.assignHotbarMacro(macro, to, data.godHotFrom ? { fromSlot: data.godHotFrom } : {})
    }
    if (!a.isOwner) return
    const before = targetSlot?.dataset.key
    const insert = key => this.#setSlots(ids => {
      const out = ids.filter(id => id !== key)
      const at = before ? out.indexOf(before) : -1
      out.splice(at < 0 ? out.length : at, 0, key)
      return out
    })
    // Перестановка всередині панелі
    if (data.godQuickFrom) return data.godQuickFrom === before ? undefined : insert(data.godQuickFrom)
    if (data.type === 'Macro') {
      const macro = await importMacro(data.uuid)
      return macro ? insert(`m:${macro.uuid}`) : undefined
    }
    const item = await fromUuid(data.uuid)
    if (!item) return
    if (item.parent !== a) return ui.notifications.warn(`Спершу додай «${item.name}» у спорядження ${a.name}`)
    return insert(item.id)
  }

  static #use(ev, t) { this.#run(t.dataset.key) }
  static #sheet() { this.actor?.sheet.render(true) }
  static #stance(ev, t) { this.actor?.setStance(t.dataset.stance) }
  static #tray() { game.god.diceTray(this.actor) }
  static async #collapse() {
    await game.settings.set('god', S.collapsed, !game.settings.get('god', S.collapsed))
    this.render()
  }
  static async #resetSlots() {
    const a = this.actor
    if (!a?.isOwner) return
    await a.unsetFlag('god', 'quickbar')
  }
}

/** Номери 1–0 для перших десяти слотів */
function numbered(slots) {
  return slots.map((s, i) => ({ ...s, num: i < 10 ? String((i + 1) % 10) : '' }))
}
function firstFreeHotSlot() {
  const used = new Set(game.user.getHotbarMacros(1).filter(s => s.macro).map(s => s.slot))
  for (let i = 1; i <= 10; i++) if (!used.has(i)) return i
  return 0
}
/** Макрос із компендіума спершу імпортується у світ — інакше його не запустити */
async function importMacro(uuid) {
  let m = await fromUuid(uuid)
  if (!m) return null
  if (m.pack) {
    m = game.macros.find(x => x._stats?.compendiumSource === uuid)
      ?? await Macro.implementation.create({ ...m.toObject(), _id: undefined, folder: null, _stats: { compendiumSource: uuid } })
  }
  return m
}
