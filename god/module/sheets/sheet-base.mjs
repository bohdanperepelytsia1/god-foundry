/**
 * Спільна основа листів актора G.O.D. (герой і ворог): режим редагування, вкладки, інвентар,
 * ефекти, портрет і токен, перетягування, гаманець. Окремі листи — character-sheet.mjs, npc-sheet.mjs.
 */
import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'
import * as M from '../roll-mods.mjs'
import { editPortrait, pickTokenImage, portraitCrop, cropStyle } from '../apps/portrait-editor.mjs'
import { bindImageDrop, editTokenLook } from '../apps/image-drop.mjs'
import { quickSpell } from '../apps/spell-creator.mjs'
import { giveItemDialog, walletDialog, moveItem } from '../apps/transfer.mjs'
import { editEffect, changeChips, changeLabel as effectChangeLabel } from '../apps/effect-builder.mjs'
import { chooseNewItem } from '../apps/item-creator.mjs'
import { effectRounds, effectRoundsLeft } from '../compat.mjs'
import { GodDiceTray } from '../apps/dice-tray.mjs'
import { GodHud } from '../apps/hud.mjs'
import { bindResourceControls } from '../apps/res-controls.mjs'
import { buildInventory, inspectItem, newInventoryState } from './inventory.mjs'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets
export const TPL = 'systems/god/templates/actor'
/** Обмежити розмір вікна екраном (з урахуванням панелей Foundry) */
export function fitToScreen(pos) {
  if (!pos || typeof window === 'undefined') return pos
  const W = window.innerWidth, H = window.innerHeight
  if (typeof pos.width === 'number') pos.width = Math.max(360, Math.min(pos.width, W - 340))
  if (typeof pos.height === 'number') pos.height = Math.max(420, Math.min(pos.height, H - 70))
  return pos
}
export const enrich = (html, doc) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? '', { relativeTo: doc })


export class GodActorSheetBase extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['god', 'sheet', 'actor'],
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      toggleEdit: GodActorSheetBase.#toggleEdit,
      openGuide: () => game.god?.guide?.(),
      editImage: GodActorSheetBase.#editImage,
      showPortrait: GodActorSheetBase.#showPortrait,
      tokenImage: GodActorSheetBase.#tokenImage,
      tokenLook: GodActorSheetBase.#tokenLook,
      rest: GodActorSheetBase.#rest,
      deathSave: GodActorSheetBase.#deathSave,
      itemUse: GodActorSheetBase.#itemUse,
      itemEdit: GodActorSheetBase.#itemEdit,
      itemDelete: GodActorSheetBase.#itemDelete,
      itemEquip: GodActorSheetBase.#itemEquip,
      itemCreate: GodActorSheetBase.#itemCreate,
      itemExpand: GodActorSheetBase.#itemExpand,
      effectToggle: GodActorSheetBase.#effectToggle,
      effectEdit: GodActorSheetBase.#effectEdit,
      effectDelete: GodActorSheetBase.#effectDelete,
      effectCreate: GodActorSheetBase.#effectCreate,
      stance: GodActorSheetBase.#stance,
      openTray: GodActorSheetBase.#openTray,
      openHud: GodActorSheetBase.#openHud,
      tabSwitch: GodActorSheetBase.#tabSwitch,
      invSelect: GodActorSheetBase.#invSelect,
      invType: GodActorSheetBase.#invType, invClose: GodActorSheetBase.#invClose,
      invCollapse: GodActorSheetBase.#invCollapse,
      invQty: GodActorSheetBase.#invQty,
      invSplit: GodActorSheetBase.#invSplit,
      invChat: GodActorSheetBase.#invChat,
      invGive: GodActorSheetBase.#invGive,
      wallet: GodActorSheetBase.#wallet,
    },
  }

  _editMode = false
  _expanded = new Set()

  /** Вікно не більше за екран: на ноутбуці 1366×768 лист влазить повністю */
  _initializeApplicationOptions(options) {
    const o = super._initializeApplicationOptions(options)
    fitToScreen(o.position)
    return o
  }

  _item(target) { return this.document.items.get(target.closest('[data-item-id]')?.dataset.itemId) }
  /** Ефект актора або ефект предмета — за UUID */
  _effect(target) {
    const uuid = target.closest('[data-effect-uuid]')?.dataset.effectUuid
    return uuid ? fromUuidSync(uuid) : null
  }

  // ── Слухачі: один раз на корінь вікна ─────────────────────────────────────
  _onFirstRender(context, options) {
    super._onFirstRender(context, options)
    const root = this.element

    // Файли з комп'ютера: перетягни на портрет → «Портрет» або «Токен»
    bindImageDrop(this, root)

    // ПКМ по мініатюрі токена — прибрати окрему картинку: токен знову як портрет
    root.addEventListener('contextmenu', ev => {
      if (!ev.target.closest?.('.god-token-pick') || !this.isEditable) return
      ev.preventDefault(); ev.stopPropagation()
      this.document.resetTokenImage?.()
    })

    root.addEventListener('focusin', ev => {
      // поля з дельтою веде глобальний обробник у god.mjs (курсор у кінець, щоб дописати «-100»)
      if (ev.target.matches('.god-select-on-focus')) ev.target.select?.()
    })

    root.addEventListener('change', ev => {
      const el = ev.target
      // Дельта-поля актора: "-25" / "+10" / "=30"
      if (el.dataset.delta) {
        ev.stopPropagation()
        const path = el.dataset.delta
        const cur = foundry.utils.getProperty(this.document._source, path) ?? foundry.utils.getProperty(this.document, path)
        const next = R.parseDelta(el.value, cur)
        if (next === null) { el.value = cur; return }
        let v = el.dataset.min !== undefined ? Math.max(Number(el.dataset.min), next) : next
        if (el.dataset.max !== undefined) v = Math.min(Number(el.dataset.max), v)
        this.document.update({ [path]: v })
        return
      }
      // Особливі вміння (майстер): назва, гілка, вартість, максимум
      if (el.dataset.customField) {
        ev.stopPropagation()
        this.document.updateCustomSkill(el.closest('[data-custom-id]').dataset.customId, el.dataset.customField, el.value)
        return
      }
      // Мови, рецепти, технології
      if (el.dataset.knowField) {
        ev.stopPropagation()
        const row = el.closest('[data-know-list]')
        this.document.updateKnowledge(row.dataset.knowList, Number(row.dataset.knowIndex), el.dataset.knowField, el.value)
        return
      }
      // Поля предмета в рядку (кількість, розташування)
      if (el.dataset.itemField) {
        ev.stopPropagation()
        const item = this._item(el)
        const v = el.type === 'number' ? (Number(el.value) || 0) : el.value
        item?.update({ [el.dataset.itemField]: v })
      }
    }, true)   // capture: обробляємо раніше за submitOnChange форми

    root.addEventListener('input', ev => {
      if (ev.target.matches('[data-filter]')) this._applyFilter(ev.target.dataset.filter, ev.target.value)
    })

    bindResourceControls(root, () => this.document)
    this._bindInventory(root)
    // Випадне меню «+ Предмет» закривається кліком повз нього
    root.addEventListener('pointerdown', ev => {
      for (const d of root.querySelectorAll('details.god-create-menu[open]')) if (!d.contains(ev.target)) d.removeAttribute('open')
    })
    // Страховка: рядок предмета завжди несе дані для перетягування (на хотбар, швидку панель, іншому актору)
    root.addEventListener('dragstart', ev => {
      const row = ev.target.closest?.('.god-row[data-item-id]')
      if (!row || ev.dataTransfer.types.includes('text/plain')) return
      const item = this.document.items.get(row.dataset.itemId)
      if (item) ev.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()))
    })
    this._createContextMenu()
  }

  /**
   * Предмет з іншого листа: переносимо (у джерела зникає), а не копіюємо.
   * Alt — копія (для майстра). Предмети зі світу й компендіумів — як звичайно, копією.
   */
  async _onDropItem(event, item) {
    const src = item?.parent
    const to = this.document
    if (!(src instanceof Actor) || src.uuid === to.uuid || event?.altKey) return super._onDropItem(event, item)
    if (!to.isOwner) return null
    if (!src.isOwner) {
      ui.notifications.warn(`«${item.name}» — не твоя річ: попроси власника передати її`)
      return null
    }
    await moveItem(item, to)
    return item
  }

  _createContextMenu() {
    const CM = foundry.applications.ux?.ContextMenu?.implementation ?? foundry.applications.ux?.ContextMenu
    if (!CM) return
    const it = li => this.document.items.get(li.dataset.itemId)
    try {
      new CM(this.element, '.god-row[data-item-id], .god-inv-row[data-item-id]', [
        { name: 'Використати', icon: '<i class="fa-solid fa-dice-d20"></i>', condition: li => ['weapon', 'spell', 'ability'].includes(it(li)?.type) || it(li)?.system.consumable, callback: li => it(li)?.use() },
        { name: 'Редагувати', icon: '<i class="fa-solid fa-pen"></i>', callback: li => it(li)?.sheet.render(true) },
        { name: 'Одягнути / зняти', icon: '<i class="fa-solid fa-shirt"></i>', condition: li => ['weapon', 'armor'].includes(it(li)?.type), callback: li => this.document.toggleEquip(it(li)) },
        { name: 'Показати в чаті', icon: '<i class="fa-solid fa-comment"></i>', callback: li => import('../dice/rolls.mjs').then(m => m.postItem(this.document, it(li))) },
        { name: 'Дублювати', icon: '<i class="fa-solid fa-copy"></i>', condition: () => this.isEditable, callback: li => it(li)?.clone({ name: `${it(li).name} (копія)` }, { save: true }) },
        { name: 'Видалити', icon: '<i class="fa-solid fa-trash"></i>', condition: () => this.isEditable, callback: li => GodActorSheetBase.#confirmDelete(it(li)) },
      ], { jQuery: false, fixed: true })
    } catch (e) { console.warn('G.O.D. | контекстне меню недоступне:', e) }
  }

  /** Фільтр рядків без перерендеру */
  _applyFilter(scope, text) {
    const q = String(text ?? '').trim().toLowerCase()
    this[`_filter_${scope}`] = q
    const box = this.element.querySelector(`[data-filter-scope="${scope}"]`)
    if (!box) return
    for (const row of box.querySelectorAll('[data-search]')) {
      row.classList.toggle('god-hidden', !!q && !row.dataset.search.includes(q))
    }
    // Під час пошуку згорнуті розділи розкриваються, а розділи без збігів ховаються
    box.classList.toggle('searching', !!q)
    for (const g of box.querySelectorAll('[data-filter-group]')) {
      g.classList.toggle('god-hidden', !!q && !g.querySelector('[data-search]:not(.god-hidden)'))
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this._focusInventory()
    for (const scope of ['skills', 'inventory']) {
      const q = this[`_filter_${scope}`]
      if (q) this._applyFilter(scope, q)
    }
  }

  _tab = null
  _inv = newInventoryState()

  // ── Інвентар ──────────────────────────────────────────────────────────────
  _renderInv(focus = false) { this._invFocus = focus; return this.render({ parts: ['gear'] }) }
  static #invSelect(ev, target) {
    if (ev.target.closest('input, select, textarea')) return
    const id = target.closest('[data-item-id]')?.dataset.itemId
    if (!id || id === this._inv.selected) return
    this._inv.selected = id
    this._renderInv(true)
  }
  static #invClose() { this._inv.selected = null; this._renderInv(true) }
  static #invType(ev, target) { this._inv.type = target.dataset.type; this._renderInv() }
  static #invCollapse(ev, target) {
    if (ev.target.closest('[data-action="itemCreate"]')) return
    const k = target.dataset.loc
    this._inv.collapsed.has(k) ? this._inv.collapsed.delete(k) : this._inv.collapsed.add(k)
    target.closest('[data-collapsible]')?.classList.toggle('collapsed', this._inv.collapsed.has(k))
  }
  static #invQty(ev, target) {
    const item = this._item(target)
    if (!item) return
    const step = Number(target.dataset.step) * (ev.shiftKey ? 10 : 1)
    item.update({ 'system.quantity': Math.max(0, (item.system.quantity ?? 0) + step) })
  }
  static async #invSplit(ev, target) {
    const item = this._item(target)
    const qty = item?.system.quantity ?? 0
    if (qty < 2) return
    const n = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Розділити: ${item.name}` }, classes: ['god-dialog'], rejectClose: false,
      content: `<label class="god-dlg-field"><span>Відокремити штук (з ${qty})</span><input type="number" name="n" value="${Math.floor(qty / 2)}" min="1" max="${qty - 1}" autofocus></label>`,
      ok: { label: 'Розділити', callback: (e, btn) => Number(btn.form.elements.n.value) || 0 },
    })
    if (!n || n < 1 || n >= qty) return
    await item.update({ 'system.quantity': qty - n })
    const data = item.toObject()
    delete data._id
    data.system.quantity = n
    data.system.equipped = false
    const [copy] = await this.document.createEmbeddedDocuments('Item', [data], { godNoStack: true })
    if (copy) { this._inv.selected = copy.id; this._renderInv() }
  }
  static #invGive(ev, target) { const it = this._item(target); if (it && this.isEditable) giveItemDialog(it) }
  static #wallet(ev, target) { if (this.isEditable) walletDialog(this.document, target.dataset.mode) }
  static #invChat(ev, target) {
    const item = this._item(target)
    if (item) import('../dice/rolls.mjs').then(m => m.postItem(this.document, item))
  }

  /** Клавіатура в списку: ↑/↓ — вибір, Enter — використати, Delete — видалити */
  _onInventoryKey(ev) {
    if (!ev.target.closest?.('.god-inv-list') || ev.target.matches('input, select, textarea')) return
    const rows = [...this.element.querySelectorAll('.god-inv-list .god-inv-row')].filter(r => r.offsetParent !== null)
    const i = rows.findIndex(r => r.dataset.itemId === this._inv.selected)
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      const next = rows[Math.max(0, Math.min(rows.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))]
      if (next && next.dataset.itemId !== this._inv.selected) { this._inv.selected = next.dataset.itemId; this._renderInv(true) }
    } else if (ev.key === 'Enter') {
      ev.preventDefault(); this.document.items.get(this._inv.selected)?.use()
    } else if (ev.key === 'Delete' && this.isEditable) {
      ev.preventDefault()
      GodActorSheetBase.#confirmDelete(this.document.items.get(this._inv.selected))
    }
  }

  _bindInventory(root) {
    root.addEventListener('keydown', ev => this._onInventoryKey(ev))
    root.addEventListener('dblclick', ev => {
      const row = ev.target.closest('.god-inv-row[data-item-id]')
      if (row && !ev.target.closest('a, input, select')) this.document.items.get(row.dataset.itemId)?.sheet.render(true)
    })
    root.addEventListener('change', ev => {
      if (!ev.target.matches('[data-inv-sort]')) return
      ev.stopPropagation()
      this._inv.sort = ev.target.value
      this._renderInv()
    }, true)
    // Перетягни рядок на інший розділ — предмет перекладеться туди
    root.addEventListener('dragover', ev => {
      const sec = ev.target.closest?.('[data-drop-location]')
      for (const s of root.querySelectorAll('.god-inv-sec.drop-hover')) if (s !== sec) s.classList.remove('drop-hover')
      sec?.classList.add('drop-hover')
    })
    root.addEventListener('drop', ev => {
      for (const s of root.querySelectorAll('.god-inv-sec.drop-hover')) s.classList.remove('drop-hover')
      const sec = ev.target.closest?.('[data-drop-location]')
      if (!sec) return
      let data
      try { data = JSON.parse(ev.dataTransfer.getData('text/plain')) } catch { return }
      if (data?.type !== 'Item' || !data.uuid) return
      const item = fromUuidSync(data.uuid)
      if (item?.parent !== this.document) return     // чуже — хай обробить стандартний drop (створення)
      ev.preventDefault(); ev.stopPropagation()
      if (item.system.location !== sec.dataset.dropLocation) item.update({ 'system.location': sec.dataset.dropLocation })
    }, true)
  }

  _focusInventory() {
    if (this._invFocus) {
      this._invFocus = false
      const list = this.element.querySelector('.god-inv-list')
      list?.focus({ preventScroll: true })
      list?.querySelector('.god-inv-row.selected')?.scrollIntoView({ block: 'nearest' })
    }
  }


  static #tabSwitch(ev, target) {
    this._tab = target.dataset.tab
    for (const el of this.element.querySelectorAll('[data-tab-panel]')) el.classList.toggle('active', el.dataset.tabPanel === this._tab)
    for (const el of this.element.querySelectorAll('[data-action="tabSwitch"]')) el.classList.toggle('active', el.dataset.tab === this._tab)
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options)
    context.tabActive = partId === this._tab
    return context
  }


  // ── Спільні частини контексту (персонаж і НІП) ────────────────────────────
  /** Картка зброї в руках: 100% урону, сітка, підказки */
  _weaponRow(i) {
    const sys = this.document.system, st = sys.stats
    const isChar = this.document.type === 'character'
    const ws = GOD.WEAPON_SKILLS[i.system.category] ?? {}
    const base = R.actorWeaponDamage(this.document, i)
    const prof = sys.skill(ws.prof), acc = sys.skill(ws.acc)
    // Ті самі числа, що підставить вікно атаки (прицільність 0 → −5, ефекти, «усі дії», стеля +12)
    const cap = n => isChar ? R.capMod(n) : n
    const hm = M.hitMods(this.document, isChar ? R.accuracyMod(acc) : acc, isChar ? `прицільність ${acc}` : 'влучність')
    const dm = M.damageMods(this.document, isChar ? R.proficiencyDamageMod(prof) : (sys.attack?.damageMod ?? 0), isChar ? `володіння ${prof}` : 'мод урону')
    const sg = n => `${n >= 0 ? '+' : ''}${n}`
    return GodActorSheetBase.itemRow(i, {
      base, prof, acc, category: GOD.WEAPON_CATEGORIES[i.system.category],
      table: R.damageTable(base),
      dmgTip: `100% урону. Фіз: ${i.system.hand === 'off' ? '' : `СИЛ ${st.str.value}×5 + `}${i.system.phys}` +
        (base.mag ? ` · Маг: ІНТ ${st.int.value}×5 + ${i.system.mag}` : '') + (base.notes?.length ? ` · ${base.notes.join(', ')}` : ''),
      rollTip: `Попадання d20${sg(cap(hm.total))} (${hm.text}). Урон d20${sg(cap(dm.total))} (${dm.text})`,
    })
  }

  async _gearContext(context, items) {
    const d = this.document.system.derived
    context.gearCats = Object.entries(GOD.GEAR_CATEGORIES).map(([id, g]) => ({ id, label: g.label, icon: `systems/god/assets/icons/gear/${g.icon}.svg` }))
    context.gearGroups = Object.entries(GOD.GEAR_GROUPS).map(([gid, label]) => ({
      label, cats: Object.entries(GOD.GEAR_CATEGORIES).filter(([, g]) => g.group === gid).map(([id, g]) => ({ id, label: g.label, icon: `systems/god/assets/icons/gear/${g.icon}.svg` })),
    })).filter(g => g.cats.length)
    const armor = items.filter(i => i.type === 'armor')
    context.slots = Object.entries(GOD.ARMOR_SLOTS).map(([slot, label]) => {
      const it = armor.find(a => a.system.equipped && a.system.slot === slot)
      return { slot, label, item: it ? GodActorSheetBase.itemRow(it) : null }
    })
    Object.assign(context, buildInventory(this.document, this._inv))
    context.equipOpen = !this._inv.collapsed.has('@equip')
    context.equippedCount = context.slots.filter(s => s.item).length
    context.inspect = await inspectItem(this.document, this.document.items.get(this._inv.selected), { enrich, changeLabel: GodActorSheetBase.changeLabel })
    context.locationOptions = GOD.INVENTORY_LOCATIONS
    context.weightPct = Math.min(100, d.totalWeight / (d.maxWeight || 1) * 100)
    context.beltOver = d.belt.used > d.belt.slots

  }

  _magicContext(context, items) {
    const sys = this.document.system, st = sys.stats, d = sys.derived
    context.castDice = R.castDiceCount(st.int.value)
    context.schools = Object.entries(GOD.SPELL_SCHOOLS).map(([key, label]) => ({
      key, label, lvl: sys.schools[key], die: R.schoolDie(sys.schools[key]),
    }))
    context.learnedSchools = context.schools.filter(s => s.lvl > 0)
    context.spells = items.filter(i => i.type === 'spell').map(i => {
      const lvl = R.spellMastery({ type: this.document.type, schools: sys.schools, school: i.system.school, level: i.system.level })
      return GodActorSheetBase.itemRow(i, {
        school: GOD.SPELL_SCHOOLS[i.system.school], schoolLvl: lvl, castable: lvl > 0,
        castDice: lvl ? `${context.castDice}d${R.schoolDie(lvl)}` : '—',
        attack: GOD.ATTACK_TYPES[i.system.attackType],
        expectDmg: i.system.baseDamage && lvl ? R.spellDamage({ base: i.system.baseDamage, schoolLvl: lvl, int: st.int.value, wis: st.wis.value, statMult: d.spellStatMult }) : 0,
      })
    })
    context.abilities = items.filter(i => i.type === 'ability').map(i => GodActorSheetBase.itemRow(i))

  }

  // ── Дії ───────────────────────────────────────────────────────────────────
  static #openTray() { GodDiceTray.open(this.document) }
  static #openHud() { GodHud.open(this.document) }
  static #toggleEdit() { this._editMode = !this._editMode; this.render() }
  /** Портрет листа: вибрати картинку й шматок (зсув, масштаб) */
  static #editImage() {
    if (!this.isEditable) return
    editPortrait(this.document, { height: this.document.type === 'npc' ? 220 : 260 })
  }
  /** Клік по портрету поза редагуванням — показати його на весь екран (і, за бажання, гравцям) */
  static #showPortrait() {
    const a = this.document
    const IP = foundry.applications.apps?.ImagePopout
    if (IP) return new IP({ src: a.img, uuid: a.uuid, window: { title: a.name } }).render({ force: true })
    if (globalThis.ImagePopout) return new globalThis.ImagePopout(a.img, { title: a.name, uuid: a.uuid }).render(true)
  }
  static #tokenImage() { if (this.isEditable) pickTokenImage(this.document) }
  static #tokenLook() { if (this.isEditable) editTokenLook(this.document) }
  static #rest() { if (this.isEditable) this.document.restDialog() }
  static #deathSave() { if (this.isEditable) import('../dice/rolls.mjs').then(m => m.deathSave(this.document)) }
  static #itemUse(ev, target) { this._item(target)?.use() }
  static #itemEdit(ev, target) { this._item(target)?.sheet.render(true) }
  static #itemDelete(ev, target) { GodActorSheetBase.#confirmDelete(this._item(target)) }
  static async #confirmDelete(item) {
    if (!item) return ui.notifications.warn('Предмет не знайдено — онови лист')
    if (!item.isOwner) return ui.notifications.warn('Немає прав видаляти цей предмет')
    const name = foundry.utils.escapeHTML?.(item.name) ?? item.name
    const qty = item.system?.quantity > 1 ? ` (усі ${item.system.quantity} шт.)` : ''
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Видалити предмет', icon: 'fa-solid fa-trash' }, classes: ['god-dialog'],
      content: `<p>Видалити «<b>${name}</b>»${qty}? Це не можна скасувати.</p>`, rejectClose: false, modal: true,
    })
    if (!ok) return
    try { await item.delete() } catch (err) {
      console.error('G.O.D. | не вдалося видалити предмет', err)
      ui.notifications.error(`Не вдалося видалити «${item.name}»: ${err.message}`)
    }
  }
  static #itemEquip(ev, target) { const it = this._item(target); if (it) this.document.toggleEquip(it) }
  static async #itemCreate(ev, target) {
    const type = target.dataset.type
    // Речі інвентаря — одне вікно вибору; створене одразу видно в інспекторі, без окремого листа
    if (['gear', 'weapon', 'armor'].includes(type) && !target.dataset.kind) {
      const preset = target.dataset.category ? `gear:${target.dataset.category}` : type !== 'gear' ? `${type}:${type === 'weapon' ? 'onehand' : 'Кираса'}` : null
      const data = await chooseNewItem({ preset, location: target.dataset.location ?? null })
      if (!data) return
      const [item] = await this.document.createEmbeddedDocuments('Item', [data], { godNoStack: true })
      if (!item) return
      this._inv.selected = item.id
      if (this._tab !== 'gear' && this.constructor.PARTS?.gear) this._tab = 'gear'
      this.render()
      return ui.notifications.info(`«${item.name}» додано — деталі праворуч, повний лист — «Редагувати»`)
    }
    // Заклинання й здібності — коротке вікно з головними полями, без порожнього листа
    if (type === 'spell' || type === 'ability') {
      const res = await quickSpell(type, { isNpc: this.document.type === 'npc' })
      if (!res) return
      const [item] = await this.document.createEmbeddedDocuments('Item', [res.data], { godNoStack: true })
      if (!item) return
      if (res.open) item.sheet.render(true)
      return ui.notifications.info(`«${item.name}» додано`)
    }
    const system = {}
    if (target.dataset.location) system.location = target.dataset.location
    if (target.dataset.kind) system.kind = target.dataset.kind
    if (type === 'gear') system.category = target.dataset.category ?? GOD.LOCATION_CATEGORY[system.location] ?? 'item'
    target.closest('details')?.removeAttribute('open')
    const gearName = type === 'gear' && system.category !== 'item' ? GOD.GEAR_CATEGORIES[system.category]?.label : null
    const name = target.dataset.kind === 'quirk' ? 'Нова особливість' : target.dataset.kind === 'trait' ? 'Нова риса' : target.dataset.kind === 'debuff' ? 'Новий дебаф'
      : gearName ?? ({ gear: 'Новий предмет', weapon: 'Нова зброя', armor: 'Новий обладунок', spell: 'Нове заклинання', ability: 'Нова здібність' })[type] ?? game.i18n.localize(`TYPES.Item.${type}`)
    const [item] = await this.document.createEmbeddedDocuments('Item', [{ name, type, system }], { godNoStack: true })
    item?.sheet.render(true)
  }
  static async #itemExpand(ev, target) {
    const row = target.closest('[data-item-id]')
    const id = row.dataset.itemId
    const open = !this._expanded.has(id)
    open ? this._expanded.add(id) : this._expanded.delete(id)
    row.classList.toggle('expanded', open)
    const box = row.querySelector('.god-row-summary')
    if (open && box && !box.dataset.loaded) {
      const item = this.document.items.get(id)
      box.innerHTML = (await enrich(item?.system.description, item)) || '<p class="god-empty">Без опису</p>'
      box.dataset.loaded = '1'
    }
  }
  static #effectToggle(ev, target) { const e = this._effect(target); e?.update({ disabled: !e.disabled }) }
  static #effectEdit(ev, target) { const e = this._effect(target); if (e && this.isEditable) editEffect(this.document, e); else e?.sheet.render(true) }
  static #effectDelete(ev, target) { ev.stopPropagation(); this._effect(target)?.delete() }
  static #effectCreate() { if (this.isEditable) editEffect(this.document) }
  /** Стійка v4.5.0 — активний ефект; одночасно лише одна */
  static #stance(ev, target) { this.document.setStance(target.dataset.stance) }

  // ── Контекст ──────────────────────────────────────────────────────────────
  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const actor = this.document
    const editable = this.isEditable
    Object.assign(context, {
      actor, system: actor.system, config: GOD, isGM: game.user.isGM,
      editable, editMode: editable && this._editMode,
      isNpc: actor.type === 'npc',
      down: (actor.system.resources?.hp?.value ?? 1) <= 0 ? {
        dead: actor.type === 'npc' || actor.statuses?.has('dead'),
        ok: actor.getFlag('god', 'deathSaves')?.ok ?? 0, fail: actor.getFlag('god', 'deathSaves')?.fail ?? 0,
      } : null,
      portraitIcon: !actor.img || actor.img.startsWith("systems/god/assets/icons") || actor.img.startsWith("icons/svg"),
      portraitStyle: cropStyle(portraitCrop(actor)),
      tokenImg: (actor.isToken ? actor.token?.texture?.src : actor.prototypeToken?.texture?.src) || actor.img,
      tokenFollows: actor.tokenFollowsPortrait?.() ?? true,
    })

    // Усі ефекти, що можуть діяти на актора: власні + з предметів
    const effects = []
    for (const e of actor.allApplicableEffects()) {
      const chips = changeChips(e)
      const rounds = effectRounds(e), left = effectRoundsLeft(e)
      effects.push({
        uuid: e.uuid, name: e.name, img: e.img, disabled: e.disabled, suppressed: e.isSuppressed,
        isStance: !!e.getFlag('god', 'stance'), source: e.parent instanceof Item ? e.parent.name : null,
        chips, desc: (e.description ?? '').replace(/<[^>]+>/g, ''),
        duration: rounds ? `${left ?? rounds} р.` : '',
        get meta() { return [this.duration, this.isStance ? 'стійка' : '', this.source ? `з «${this.source}»` : '', this.suppressed ? 'діє, коли предмет одягнено' : ''].filter(Boolean).join(' · ') },
        changes: [chips.map(c => `${c.label} ${c.value}`).join(' · '), (e.description ?? '').replace(/<[^>]+>/g, '')].filter(Boolean).join(' — '),
      })
    }
    context.effectsActive = effects.filter(e => !e.disabled && !e.suppressed)
    context.effectsOff = effects.filter(e => e.disabled || e.suppressed)

    const activeStance = actor.effects.find(e => e.getFlag('god', 'stance'))?.getFlag('god', 'stance') ?? 'neutral'
    context.stances = [
      { id: 'neutral', label: 'Нейтр.', title: 'Нейтральна стійка — без модифікаторів' },
      { id: 'attack', label: 'Атака', title: 'Атакуюча: урон +2, ШУ −4' },
      { id: 'defense', label: 'Захист', title: 'Захисна: ШУ +2, урон −4' },
      { id: 'nonlethal', label: 'Несмерт.', title: 'Несмертельна: урон −3, попадання +1' },
    ].map(s => ({ ...s, active: s.id === activeStance, locked: s.id !== 'neutral' && !!actor.stanceLock, title: s.id !== 'neutral' && actor.stanceLock ? actor.stanceLock : s.title }))

    context.expandedDesc = {}
    for (const id of this._expanded) {
      const item = actor.items.get(id)
      if (item) context.expandedDesc[id] = await enrich(item.system.description, item)
    }
    return context
  }

  static changeLabel(key) { return effectChangeLabel(key) }

  /** Рядок предмета для шаблону */
  static itemRow(item, extra = {}) {
    const s = item.system
    const tags = []
    if (s.isMagic) tags.push({ icon: 'fa-sparkles', cls: 'magic', tip: 'Магічний' })
    if (s.isBlessed) tags.push({ icon: 'fa-sun', cls: 'blessed', tip: 'Благословенний' })
    if (s.isCursed) tags.push({ icon: 'fa-skull', cls: 'cursed', tip: 'Проклятий' })
    return {
      id: item.id, name: item.name, img: item.img, type: item.type, system: s,
      equippable: ['weapon', 'armor'].includes(item.type),
      weight: item.totalWeight, tags,
      search: item.name.toLowerCase(),
      ...extra,
    }
  }
}
