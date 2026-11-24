/**
 * Швидка панель — смужка внизу екрана для обраного токена (або свого персонажа):
 * портрет, ресурси з ±, ШУ, стійка і слоти швидкого доступу.
 * Слоти: перетягни будь-який предмет персонажа (зброю, заклинання, вміння, зілля) —
 * клік використовує, ПКМ прибирає, перетягування всередині панелі міняє порядок.
 * Поки слотів не налаштовано, панель сама показує зброю в руках і доступні заклинання.
 * Замінює нативний хотбар Foundry: макроси теж кладуться в слоти, клавіші 1–0 запускають слоти.
 * Без персонажа (майстер без токена) панель показує макроси з першої сторінки хотбара користувача.
 */
import { GOD, defaultIcon } from '../config.mjs'
import { bindResourceControls } from './res-controls.mjs'
import { weaponAttack, unarmedStrike, npcStrike } from '../dice/rolls.mjs'

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
const UNARMED = '@unarmed'
const NPC_STRIKE = '@npc'
const MIN_EDIT_SLOTS = 10

// ── Розкладка слотів (чисті функції — для тестів). Порожнє місце — null, щоб номери 1–0 не з'їжджали ──
const trim = ids => { const out = [...ids]; while (out.length && !out.at(-1)) out.pop(); return out }
/** Поставити key на місце index: з панелі — міняється місцями з тим, хто там стояв; новий — посуває решту */
export function placeSlot(ids, key, index) {
  const out = [...ids]
  const from = out.indexOf(key)
  while (out.length < index) out.push(null)
  if (from >= 0) {
    if (from === index) return trim(out)
    const there = out[index] ?? null
    out[index] = key; out[from] = there
    return trim(out)
  }
  if (!out[index]) out[index] = key
  else out.splice(index, 0, key)
  return trim(out)
}
/** Додати кілька: у перші порожні місця, потім у кінець; ті, що вже є, пропускаються */
export function addSlots(ids, keys) {
  const out = [...ids]
  for (const k of keys) {
    if (!k || out.includes(k)) continue
    const free = out.indexOf(null)
    free >= 0 ? (out[free] = k) : out.push(k)
  }
  return trim(out)
}
/** Прибрати: місце лишається порожнім (номери інших не змінюються) */
export const removeSlot = (ids, key) => trim(ids.map(k => (k === key ? null : k)))
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
      pick: GodQuickbar.#pick, editSlots: GodQuickbar.#editSlots, removeSlot: GodQuickbar.#removeSlot,
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
    if (Array.isArray(saved)) return { ids: trim(saved.map(k => (k && (isMacroKey(k) ? !!fromUuidSync(k.slice(2)) : actor.items.has(k))) ? k : null)), custom: true }
    const isChar = actor.type === 'character'
    const s = actor.system
    // У героя руки й пояс — окремі прив'язані групи панелі; тут лише решта
    const auto = [
      ...actor.items.filter(i => i.type === 'weapon' && !isChar),
      ...actor.items.filter(i => i.type === 'spell' && (s.schools?.[i.system.school] ?? 0) > 0),
      ...actor.items.filter(i => i.type === 'ability'),
      ...(isChar ? [] : actor.items.filter(i => i.type === 'gear' && i.system.location === 'belt')),
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
    // Прив'язане до листа (як «Огляд»): що в руках (або кулаки) і що на поясі — завжди на початку панелі, без номерів
    const linked = []
    if (isChar) {
      const hands = a.items.filter(i => i.type === 'weapon' && i.system.equipped)
      if (hands.length) for (const w of hands) linked.push({ id: w.id, zone: 'hands' })
      else linked.push({ id: UNARMED, zone: 'hands' })
      const sh = a.items.find(i => i.type === 'armor' && i.system.equipped && i.system.slot === 'Щит')
      if (sh) linked.push({ id: sh.id, zone: 'hands' })
      for (const i of a.items.filter(i => i.isPhysical && i.system.location === 'belt' && !i.system.equipped)) linked.push({ id: i.id, zone: 'belt' })
    } else if (a.type === 'npc') linked.push({ id: NPC_STRIKE, zone: 'hands' })   // атака ворога (PD/MD) — як кнопка «Атакувати» на картці
    const linkedIds = new Set(linked.map(l => l.id))
    const { custom } = GodQuickbar.slotIds(a)
    const raw = GodQuickbar.slotIds(a).ids
    const ids = custom ? trim(raw.map(k => (linkedIds.has(k) ? null : k))) : raw.filter(k => !linkedIds.has(k))
    let prev = null
    const mp = sys.resources.mp?.value ?? 0
    // У режимі розкладки видно всі місця (мінімум 10), щоб ставити речі на конкретний номер
    const edit = !!this._edit
    const positions = edit ? [...ids, ...Array(Math.max(MIN_EDIT_SLOTS, ids.length + 1) - ids.length).fill(null)] : ids
    const slots = positions.map((id, index) => {
      if (!id) { prev = null; return { key: '', index, empty: true, group: 'empty', kind: 'empty', tip: edit ? 'Порожнє місце: клік — обрати, що сюди поставити' : 'Порожнє місце' } }
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
      let badge = '', tip = i.name, dim = false, equip = null
      if (i.type === 'armor') {
        equip = !!s.equipped
        tip = `${i.name} · клік — ${s.equipped ? 'зняти' : 'одягнути'}`
        dim = !s.equipped
      } else if (i.type === 'spell') {
        badge = s.manaCost ? `${s.manaCost}` : ''
        tip = `${i.name} · ПППС ${s.threshold} · ${s.manaCost} OM`
        dim = s.manaCost > mp
      } else if (i.type === 'weapon') {
        equip = isChar ? !!s.equipped : null
        tip = isChar && !s.equipped ? `${i.name} · не в руках: клік — взяти в руку` : `Атака: ${i.name}${s.phys ? ` · ${s.phys} фіз` : ''}${s.mag ? ` · ${s.mag} маг` : ''}`
        dim = isChar && !s.equipped
      } else if (i.type === 'gear') {
        badge = s.quantity > 1 ? `×${s.quantity}` : ''
      } else if (i.type === 'ability' && s.manaCost) {
        badge = `${s.manaCost}`; dim = s.manaCost > mp
      }
      return { key: id, index, img: i.img, name: i.name, tip, badge, dim, gap, group, kind: 'item', equip }
    })
    const linkedSlots = linked.map((l, n) => {
      if (l.id === NPC_STRIKE) {
        const st = npcStrike(a), at = a.system.attack ?? {}
        return { key: NPC_STRIKE, img: st.look ? defaultIcon('weapon', { category: st.look }) : 'systems/god/assets/icons/weapons/fist.svg', name: st.name,
          tip: `${st.name}${at.phys ? ` · ${at.phys} фіз` : ''}${at.mag ? ` · ${at.mag} маг` : ''}`, group: 'atk', kind: 'item', zone: 'hands', first: n === 0 }
      }
      if (l.id === UNARMED) return { key: UNARMED, img: 'systems/god/assets/icons/weapons/fist.svg', name: 'Кулаки', tip: 'Порожні руки: удар кулаками', group: 'atk', kind: 'item', zone: 'hands', first: n === 0 }
      const i = a.items.get(l.id), s = i.system
      if (i.type === 'armor' && s.slot === 'Щит') {
        const up = !!a.system.shieldUp, r = a.system.resources
        return { key: i.id, img: i.img, name: i.name, group: 'atk', kind: 'item', zone: 'hands', equip: up, dim: !up, first: n === 0 || linked[n - 1].zone !== l.zone,
          tip: `${i.name}: ${up ? 'піднято' : 'опущено'} · PR щита ${r.spr?.value ?? 0} · MR ${r.smr?.value ?? 0} · клік — ${up ? 'опустити' : 'підняти'}` }
      }
      const badge = i.type === 'gear' && s.quantity > 1 ? `×${s.quantity}` : ''
      const tip = l.zone === 'hands' ? `Атака: ${i.name}${s.hand === 'off' ? ' · ліва рука' : ''}` : `${i.name} · на поясі${i.type === 'weapon' ? ': клік — взяти в руку' : ''}`
      return { key: i.id, img: i.img, name: i.name, tip, badge, group: l.zone === 'hands' ? 'atk' : 'gear', kind: 'item', zone: l.zone, equip: l.zone === 'hands' ? true : null,
        first: n === 0 || linked[n - 1].zone !== l.zone }
    })
    this._slots = [...linkedSlots, ...slots]
    this._numbered = slots
    const stance = a.effects.find(e => e.getFlag('god', 'stance'))?.getFlag('god', 'stance') ?? 'neutral'
    return {
      actor: a, isChar, collapsed, custom, edit,
      bars: (isChar ? ['hp', 'mp', 'ed', 'mt'] : ['hp', 'mp', 'ed']).map(bar),
      armor: ['pr', 'mr'].map(bar).filter(b => b.max > 0 || b.value > 0),
      dodge: sys.derived?.dodge ?? sys.dodge ?? 0,
      stances: [['neutral', 'Нейтральна'], ...Object.entries(GOD.STANCES).map(([id, s]) => [id, s.label])]
        .map(([id, label]) => ({ id, label, icon: `systems/god/assets/icons/stances/${id}.svg`, active: id === stance })),
      slots: numbered(slots), linked: linkedSlots,
    }
  }

  /** Клавіші 1–0: запустити слот за номером */
  activateSlot(n) {
    const s = (this._numbered ?? this._slots)?.[n]
    if (!s) return false
    this.#run(s.key)
    return true
  }

  async #run(key) {
    if (isMacroKey(key) || this._slots?.find(s => s.key === key)?.kind === 'macro') {
      const m = await fromUuid(isMacroKey(key) ? key.slice(2) : key)
      return m?.execute()
    }
    const a = this.actor
    if (key === UNARMED && a) return weaponAttack(a, unarmedStrike())
    if (key === NPC_STRIKE && a) return weaponAttack(a, npcStrike(a))
    const item = a?.items.get(key)
    if (!item) return
    // Одягнений щит — підняти/опустити (окрема дія)
    if (item.type === 'armor' && item.system.slot === 'Щит' && item.system.equipped) return (await import('../api.mjs')).toggleShield(a)
    // Обладунок — одягнути/зняти; зброя не в руках — спершу взяти в руку
    if (item.type === 'armor' || (item.type === 'weapon' && a.type === 'character' && !item.system.equipped)) {
      const was = !!item.system.equipped
      if (item.type === 'weapon') await a.equipToHand(item, item.system.hand === 'off' ? 'off' : 'main')   // з пояса — знімається з пояса
      else await a.toggleEquip(item)
      return ui.notifications.info(`${item.name}: ${was ? 'знято' : item.type === 'weapon' ? 'у руці' : 'одягнено'}`)
    }
    return item.use()
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

    // ПКМ по слоту — меню: використати, одягнути/зняти, відкрити, прибрати
    el.addEventListener('contextmenu', ev => {
      const slot = ev.target.closest('[data-slot]')
      if (!slot) return
      ev.preventDefault()
      if (slot.dataset.hotSlot) return game.user.assignHotbarMacro(null, Number(slot.dataset.hotSlot))
      if (slot.dataset.key) this.#slotMenu(slot)
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
    // На конкретне місце (зайняте — обмін, порожнє — туди), інакше — у перше вільне
    const at = targetSlot?.dataset.index !== undefined ? Number(targetSlot.dataset.index) : NaN
    const insert = key => this.#setSlots(ids => Number.isInteger(at) ? placeSlot(ids, key, at) : addSlots(ids, [key]))
    // Перестановка всередині панелі
    if (data.godQuickFrom) return insert(data.godQuickFrom)
    if (data.type === 'Macro') {
      const macro = await importMacro(data.uuid)
      return macro ? insert(`m:${macro.uuid}`) : undefined
    }
    const item = await fromUuid(data.uuid)
    if (!item) return
    if (item.parent !== a) return ui.notifications.warn(`Спершу додай «${item.name}» у спорядження ${a.name}`)
    return insert(item.id)
  }

  static #use(ev, t) {
    if (!t.dataset.key) return GodQuickbar.#pick.call(this, ev, t)   // порожнє місце — вибрати, що поставити
    if (this._edit) return
    this.#run(t.dataset.key)
  }
  /** Режим розкладки: видно всі місця з номерами, порожні клікабельні, у кожного — хрестик */
  static #editSlots() { this._edit = !this._edit; this.render() }
  static #removeSlot(ev, t) {
    ev.stopPropagation()
    const key = t.closest('[data-slot]')?.dataset.key
    if (key) this.#setSlots(ids => removeSlot(ids, key))
  }
  /** «+»: вибрати речі персонажа для панелі (на конкретне місце, якщо клік по порожньому) */
  static async #pick(ev, t) {
    const a = this.actor
    if (!a?.isOwner) return
    const idx = t?.closest?.('[data-slot]')?.dataset.index
    const at = idx !== undefined ? Number(idx) : NaN
    const keys = await pickItems(a, GodQuickbar.slotIds(a).ids, { single: Number.isInteger(at) })
    if (!keys?.length) return
    await this.#setSlots(ids => Number.isInteger(at) ? placeSlot(ids, keys[0], at) : addSlots(ids, keys))
  }

  /** Меню прив'язаних слотів (руки, пояс): те саме, що кнопки на «Огляді» */
  #linkedMenu(slot, item, zone) {
    const a = this.actor
    const opts = zone === 'hands'
      ? (item ? [['use', 'fa-dice-d20', 'Атака'], ['belt', 'fa-grip-lines', 'На пояс'], ['off', 'fa-xmark', 'Зняти з руки'], ['sheet', 'fa-pen-to-square', 'Відкрити предмет']]
        : [['use', 'fa-hand-fist', slot.dataset.key === NPC_STRIKE ? 'Атакувати' : 'Удар кулаками']])
      : [['use', 'fa-play', item?.type === 'weapon' ? 'Взяти в праву руку' : 'Використати'], ...(item?.type === 'weapon' ? [['off-hand', 'fa-hand', 'Взяти в ліву руку']] : []),
        ['pack', 'fa-box-open', 'У рюкзак'], ['sheet', 'fa-pen-to-square', 'Відкрити предмет']]
    this.#popup(slot, opts, async m => {
      if (m === 'use') return zone === 'belt' && item?.type === 'weapon' ? a.equipToHand(item, 'main') : this.#run(slot.dataset.key)
      if (m === 'off-hand') return a.equipToHand(item, 'off')
      if (m === 'belt') return a.toBelt(item)
      if (m === 'off') return a.toggleEquip(item)
      if (m === 'pack') return a.toPack(item)
      if (m === 'sheet') return item?.sheet.render(true)
    })
  }
  /** Спливне меню над слотом */
  #popup(slot, opts, onPick) {
    this.element.querySelector('.god-qb-menu')?.remove()
    const menu = document.createElement('div')
    menu.className = 'god-qb-menu'
    menu.innerHTML = opts.map(([id, icon, label]) => `<a data-m="${id}"><i class="fa-solid ${icon}"></i> ${label}</a>`).join('')
    this.element.append(menu)
    const r = slot.getBoundingClientRect(), host = this.element.getBoundingClientRect()
    menu.style.left = `${Math.max(0, r.left - host.left)}px`
    menu.style.bottom = `${host.bottom - r.top + 6}px`
    const outside = e => { if (!menu.contains(e.target)) close() }
    const close = () => { menu.remove(); document.removeEventListener('pointerdown', outside, true) }
    setTimeout(() => document.addEventListener('pointerdown', outside, true))
    menu.addEventListener('click', e => { const m = e.target.closest('[data-m]')?.dataset.m; close(); if (m) onPick(m) })
  }

  /** Маленьке меню слота (ПКМ) */
  #slotMenu(slot) {
    this.element.querySelector('.god-qb-menu')?.remove()
    const a = this.actor, key = slot.dataset.key, zone = slot.dataset.zone
    const item = isMacroKey(key) ? null : a?.items.get(key)
    const isChar = a?.type === 'character'
    if (zone) return this.#linkedMenu(slot, item, zone)
    const useLabel = item?.type === 'armor' ? (item.system.equipped ? 'Зняти' : 'Одягнути')
      : item?.type === 'weapon' && isChar && !item.system.equipped ? 'Взяти в руку' : 'Використати'
    const opts = [
      ['use', 'fa-play', useLabel],
      ...(item?.type === 'weapon' && isChar && item.system.equipped ? [['unequip', 'fa-hand', 'Прибрати з руки']] : []),
      ...(item ? [['sheet', 'fa-pen-to-square', 'Відкрити предмет']] : []),
      ['remove', 'fa-xmark', 'Прибрати з панелі'],
    ]
    const menu = document.createElement('div')
    menu.className = 'god-qb-menu'
    menu.innerHTML = opts.map(([id, icon, label]) => `<a data-m="${id}"><i class="fa-solid ${icon}"></i> ${label}</a>`).join('')
    this.element.append(menu)
    const r = slot.getBoundingClientRect(), host = this.element.getBoundingClientRect()
    menu.style.left = `${Math.max(0, r.left - host.left)}px`
    menu.style.bottom = `${host.bottom - r.top + 6}px`
    const outside = e => { if (!menu.contains(e.target)) close() }
    const close = () => { menu.remove(); document.removeEventListener('pointerdown', outside, true) }
    setTimeout(() => document.addEventListener('pointerdown', outside, true))
    menu.addEventListener('click', async e => {
      const m = e.target.closest('[data-m]')?.dataset.m
      close()
      if (m === 'use') return this.#run(key)
      if (m === 'unequip') return a.toggleEquip(item)
      if (m === 'sheet') return item?.sheet.render(true)
      if (m === 'remove') return this.#setSlots(ids => removeSlot(ids, key))
    })
  }
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
    this._edit = false
    await a.unsetFlag('god', 'quickbar')
  }
}

/** Вибір речей для панелі: списком з пошуком, групи за типом */
export async function pickItems(actor, have = [], { single = false } = {}) {
  const esc = foundry.utils.escapeHTML
  const GROUPS = [['weapon', 'Зброя'], ['armor', 'Обладунки'], ['spell', 'Заклинання'], ['ability', 'Здібності'], ['gear', 'Речі'], ['trait', 'Риси']]
  const list = GROUPS.map(([type, label]) => ({ label, items: actor.items.filter(i => i.type === type).sort((x, y) => x.name.localeCompare(y.name, 'uk')) }))
    .filter(g => g.items.length)
  if (!list.length) { ui.notifications.warn('У персонажа немає предметів'); return null }
  const row = i => {
    const on = have.includes(i.id)
    return `<label class="god-qb-pick-row" data-search="${esc(i.name.toLowerCase())}">
      <input type="${single ? 'radio' : 'checkbox'}" name="pick" value="${i.id}" ${on && !single ? 'checked disabled' : ''}>
      <img src="${esc(i.img)}" alt="" width="26" height="26" style="width:26px;height:26px;flex:none"><span>${esc(i.name)}${i.system.equipped ? ' <small>в руках / одягнено</small>' : ''}${on ? ' <small>вже на панелі</small>' : ''}</span></label>`
  }
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: single ? 'Що поставити на це місце' : 'Додати на швидку панель', icon: 'fa-solid fa-plus' },
    classes: ['god-dialog', 'god-qb-pick-dlg'], position: { width: 380 }, rejectClose: false,
    content: `<input type="search" class="god-qb-pick-search" placeholder="Знайти…" autofocus>
      <div class="god-qb-pick">${list.map(g => `<h4>${g.label}</h4>${g.items.map(row).join('')}`).join('')}</div>`,
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target?.element
      root?.querySelector('.god-qb-pick-search')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase()
        for (const r of root.querySelectorAll('.god-qb-pick-row')) r.hidden = !!q && !r.dataset.search.includes(q)
      })
    },
    buttons: [{ action: 'ok', label: single ? 'Поставити' : 'Додати', icon: 'fa-solid fa-check', default: true,
      callback: (e, b) => [...b.form.querySelectorAll('input[name="pick"]:checked:not(:disabled)')].map(x => x.value) }],
  })
  return Array.isArray(res) ? res : null
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
