/**
 * Листи акторів G.O.D.
 *
 * UX-рішення:
 *  - режим гри / режим редагування (замок у бічній панелі): у грі лист показує
 *    значення й кнопки кидків, поля для правки — лише в режимі редагування;
 *  - бічна панель (портрет, ресурси, ШУ, стійка, гроші) видна на всіх вкладках;
 *  - ресурси й гроші приймають дельту: "-25", "+10", "=30";
 *  - ПКМ по предмету — контекстне меню; шеврон — опис прямо в рядку;
 *  - усі слухачі вішаються ОДИН раз на корінь вікна (делегування), тож
 *    часткові перерендери не дублюють обробників.
 */
import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'
import * as M from '../roll-mods.mjs'
import { skillInfo } from '../skill-info.mjs'
import { weaponAttack } from '../dice/rolls.mjs'
import { editPortrait, pickTokenImage, portraitCrop, cropStyle } from '../apps/portrait-editor.mjs'
import { bindImageDrop, editTokenLook } from '../apps/image-drop.mjs'
import { quickSpell } from '../apps/spell-creator.mjs'
import { giveItemDialog, walletDialog, moveItem } from '../apps/transfer.mjs'
import * as Wagons from '../wagons.mjs'

/** Скільки штук (для стосу); Shift — одразу все */
async function askQty(name, quantity, all = false) {
  const qty = Math.max(1, Number(quantity) || 1)
  if (qty === 1 || all) return qty
  return foundry.applications.api.DialogV2.prompt({
    window: { title: name }, classes: ['god-dialog'], rejectClose: false, position: { width: 300 },
    content: `<label class="god-dlg-field"><span>Скільки (з ${qty})</span><input type="number" name="n" value="${qty}" min="1" max="${qty}" autofocus></label>`,
    ok: { label: 'Гаразд', callback: (e, btn) => Math.min(qty, Math.max(1, Number(btn.form.elements.n.value) || qty)) },
  })
}

/** Майстер: новий візок / налаштування — назва, пачка, місткість, хто бачить */
async function wagonDialog(w = {}) {
  const esc = foundry.utils.escapeHTML
  const players = game.users.filter(u => !u.isGM)
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: w.id ? `Візок: ${w.name}` : 'Новий візок', icon: 'fa-solid fa-cart-flatbed' }, classes: ['god-dialog'], position: { width: 380 }, rejectClose: false,
    content: `<label class="god-dlg-field"><span>Назва</span><input type="text" name="name" value="${esc(w.name ?? '')}" placeholder="Віз покритий" autofocus></label>
      <label class="god-dlg-field"><span>Чий (підпис)</span><input type="text" name="party" value="${esc(w.party ?? '')}" placeholder="Пачка"></label>
      <label class="god-dlg-field"><span>Місткість, кг (0 — без меж)</span><input type="number" name="capacity" value="${w.capacity ?? 0}" min="0"></label>
      <p class="god-dlg-info">Хто бачить (нікого не позначено — усі гравці):</p>
      ${players.map(u => `<label class="god-dlg-check"><input type="checkbox" name="u-${u.id}" ${w.users?.includes(u.id) ? 'checked' : ''}><span>${esc(u.name)}</span></label>`).join('')}`,
    buttons: [{ action: 'ok', label: 'Зберегти', icon: 'fa-solid fa-check', default: true, callback: (e, btn) => {
      const el = btn.form.elements
      return { name: el.name.value.trim() || 'Візок', party: el.party.value.trim(), capacity: Math.max(0, Number(el.capacity.value) || 0),
        users: players.filter(u => el[`u-${u.id}`]?.checked).map(u => u.id) }
    } }],
  })
  return res && typeof res === 'object' ? res : null
}
import { editEffect, changeChips, changeLabel as effectChangeLabel } from '../apps/effect-builder.mjs'
import { chooseNewItem } from '../apps/item-creator.mjs'
import { effectRounds, effectRoundsLeft } from '../compat.mjs'
import { GodDiceTray } from '../apps/dice-tray.mjs'
import { GodHud } from '../apps/hud.mjs'
import { bindResourceControls } from '../apps/res-controls.mjs'
import { buildInventory, inspectItem, newInventoryState } from './inventory.mjs'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets
const TPL = 'systems/god/templates/actor'
/** Обмежити розмір вікна екраном (з урахуванням панелей Foundry) */
export function fitToScreen(pos) {
  if (!pos || typeof window === 'undefined') return pos
  const W = window.innerWidth, H = window.innerHeight
  if (typeof pos.width === 'number') pos.width = Math.max(360, Math.min(pos.width, W - 340))
  if (typeof pos.height === 'number') pos.height = Math.max(420, Math.min(pos.height, H - 70))
  return pos
}
const enrich = (html, doc) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? '', { relativeTo: doc })

class GodActorSheetBase extends HandlebarsApplicationMixin(ActorSheetV2) {
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

// ═════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'overview',  label: 'Огляд',      icon: 'fa-solid fa-chess-knight' },
  { id: 'skills',    label: 'Вміння',     icon: 'fa-solid fa-star' },
  { id: 'gear',      label: 'Інвентар',   icon: 'fa-solid fa-sack' },
  { id: 'magic',     label: 'Магія',      icon: 'fa-solid fa-wand-sparkles' },
  { id: 'traits',    label: 'Риси',       icon: 'fa-solid fa-feather' },
  { id: 'effects',   label: 'Ефекти',     icon: 'fa-solid fa-bolt' },
  { id: 'bio',       label: 'Біографія',  icon: 'fa-solid fa-book' },
  { id: 'wagons',    label: 'Візки',      icon: 'fa-solid fa-cart-flatbed' },
]

export class GodCharacterSheet extends GodActorSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ['god', 'sheet', 'actor', 'character'],
    position: { width: 940, height: 780 },
    actions: {
      rollStat: GodCharacterSheet.#rollStat,
      rollStats: GodCharacterSheet.#rollStats,
      rollSkill: GodCharacterSheet.#rollSkill,
      skillUp: GodCharacterSheet.#skillUp,
      skillDown: GodCharacterSheet.#skillDown,
      statUp: GodCharacterSheet.#statUp,
      statDown: GodCharacterSheet.#statDown,
      toggleCat: GodCharacterSheet.#toggleCat,
      toggleLearned: GodCharacterSheet.#toggleLearned,
      commitBuild: GodCharacterSheet.#commitBuild,
      customAdd: GodCharacterSheet.#customAdd,
      customRemove: GodCharacterSheet.#customRemove,
      knowAdd: GodCharacterSheet.#knowAdd,
      knowRemove: GodCharacterSheet.#knowRemove,
      wagonPick: GodCharacterSheet.#wagonPick, wagonTake: GodCharacterSheet.#wagonTake, wagonPut: GodCharacterSheet.#wagonPut,
      wagonNew: GodCharacterSheet.#wagonNew, wagonEdit: GodCharacterSheet.#wagonEdit, wagonDelete: GodCharacterSheet.#wagonDelete, wagonRemove: GodCharacterSheet.#wagonRemove,
    },
  }

  static PARTS = {
    sidebar:  { template: `${TPL}/sidebar.hbs` },
    tabs:     { template: `${TPL}/tabs.hbs` },
    overview: { template: `${TPL}/overview.hbs`, scrollable: [''] },
    skills:   { template: `${TPL}/skills.hbs`, scrollable: [''] },
    gear:     { template: `${TPL}/gear.hbs`, scrollable: ['.god-inv-main', '.god-inv-detail'] },
    magic:    { template: `${TPL}/magic.hbs`, scrollable: [''] },
    traits:   { template: `${TPL}/traits.hbs`, scrollable: [''] },
    effects:  { template: `${TPL}/effects.hbs`, scrollable: [''] },
    bio:      { template: `${TPL}/bio.hbs`, scrollable: [''] },
    wagons:   { template: `${TPL}/wagons.hbs`, scrollable: ['.god-wagon-col .god-wagon-list'] },
  }

  _tab = 'overview'
  _wagon = null
  // ── Візки ────────────────────────────────────────────────────────────────
  static #wagonPick(ev, t) { this._wagon = t.dataset.wagon; this.render({ parts: ['wagons'] }) }
  static async #wagonTake(ev, t) {
    const id = t.closest('[data-wagon-item]')?.dataset.wagonItem
    const w = Wagons.allWagons().find(x => x.id === this._wagon), it = w?.items.find(i => i._id === id)
    if (!it) return
    const qty = await askQty(it.name, it.system?.quantity, ev.shiftKey)
    if (qty) Wagons.request({ action: 'take', wagon: w.id, itemId: id, qty, actor: this.document.uuid })
  }
  static async #wagonPut(ev, t) {
    const item = this.document.items.get(t.closest('[data-mine-item]')?.dataset.mineItem)
    if (!item || !this._wagon) return
    const qty = await askQty(item.name, item.system.quantity, ev.shiftKey)
    if (qty) Wagons.request({ action: 'put', wagon: this._wagon, item: item.uuid, qty })
  }
  static async #wagonNew() { const d = await wagonDialog(); if (d) Wagons.request({ action: 'create', ...d }) }
  static async #wagonEdit() {
    const w = Wagons.allWagons().find(x => x.id === this._wagon)
    const d = w && await wagonDialog(w)
    if (d) Wagons.request({ action: 'update', wagon: w.id, data: d })
  }
  static async #wagonDelete() {
    const w = Wagons.allWagons().find(x => x.id === this._wagon)
    if (!w) return
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: 'Видалити візок' }, content: `<p>Видалити «${foundry.utils.escapeHTML(w.name)}» разом із ${w.items.length} речами всередині?</p>` })
    if (ok) { this._wagon = null; Wagons.request({ action: 'delete', wagon: w.id }) }
  }
  static #wagonRemove(ev, t) { const id = t.closest('[data-wagon-item]')?.dataset.wagonItem; if (id) Wagons.request({ action: 'removeItem', wagon: this._wagon, itemId: id }) }

  /** Перетягування між колонками візка й інвентаря */
  _bindWagons(root) {
    const KEY = 'application/x-god-wagon'
    root.addEventListener('dragstart', ev => {
      const w = ev.target.closest?.('[data-wagon-item]'), m = ev.target.closest?.('[data-mine-item]')
      if (!w && !m) return
      ev.stopPropagation()
      ev.dataTransfer.setData(KEY, JSON.stringify(w ? { from: 'wagon', id: w.dataset.wagonItem } : { from: 'mine', id: m.dataset.mineItem }))
      if (m) { const it = this.document.items.get(m.dataset.mineItem); if (it) ev.dataTransfer.setData('text/plain', JSON.stringify(it.toDragData())) }
    }, true)
    root.addEventListener('dragover', ev => {
      const zone = ev.target.closest?.('[data-wagon-zone]')
      if (!zone || ![...ev.dataTransfer.types].includes(KEY)) return
      ev.preventDefault()
      root.querySelectorAll('[data-wagon-zone]').forEach(z => z.classList.toggle('drop-hover', z === zone))
    })
    root.addEventListener('dragleave', ev => { if (!ev.relatedTarget || !root.contains(ev.relatedTarget)) root.querySelectorAll('[data-wagon-zone]').forEach(z => z.classList.remove('drop-hover')) })
    root.addEventListener('drop', ev => {
      const zone = ev.target.closest?.('[data-wagon-zone]')
      const raw = ev.dataTransfer?.getData(KEY)
      root.querySelectorAll('[data-wagon-zone]').forEach(z => z.classList.remove('drop-hover'))
      if (!zone || !raw) return
      ev.preventDefault(); ev.stopPropagation()
      const d = JSON.parse(raw)
      if (d.from === 'mine' && zone.dataset.wagonZone === 'wagon') {
        const item = this.document.items.get(d.id)
        if (item && this._wagon) Wagons.request({ action: 'put', wagon: this._wagon, item: item.uuid })
      } else if (d.from === 'wagon' && zone.dataset.wagonZone === 'mine' && this._wagon) {
        Wagons.request({ action: 'take', wagon: this._wagon, itemId: d.id, actor: this.document.uuid })
      }
    }, true)
  }
  _onFirstRender(context, options) { super._onFirstRender(context, options); this._bindWagons(this.element) }
  _collapsed = new Set()
  _onlyLearned = false
  static #rollStat(ev, target) { this.document.rollStat(target.dataset.stat) }
  static #rollStats() { if (this.isEditable) import('../dice/rolls.mjs').then(m => m.rollStatArray(this.document)) }
  static #rollSkill(ev, target) { this.document.rollSkill(target.dataset.skill) }
  static #skillUp(ev, target) { this.document.changeSkill(target.dataset.skill, +1, { free: game.user.isGM && ev.shiftKey }) }
  static #skillDown(ev, target) { this.document.changeSkill(target.dataset.skill, -1, { free: game.user.isGM && ev.shiftKey }) }
  static #statUp(ev, target) { this.document.changeStat(target.dataset.stat, +1, { free: game.user.isGM && ev.shiftKey }) }
  static #statDown(ev, target) { this.document.changeStat(target.dataset.stat, -1, { free: game.user.isGM && ev.shiftKey }) }
  static #toggleCat(ev, target) {
    const c = target.dataset.cat
    this._collapsed.has(c) ? this._collapsed.delete(c) : this._collapsed.add(c)
    target.closest('.god-skillcat')?.classList.toggle('collapsed', this._collapsed.has(c))
  }
  static #toggleLearned() { this._onlyLearned = !this._onlyLearned; this.render({ parts: ['skills'] }) }
  static async #commitBuild() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Зафіксувати розвиток' }, rejectClose: false,
      content: '<p>Поточні рівні вмінь і характеристик стануть зафіксованими: знизити їх зможе лише майстер. Продовжити?</p>',
    })
    if (ok) this.document.commitBuild()
  }
  static #customAdd(ev, t) { this.document.addCustomSkill(t.dataset.cat) }
  static #customRemove(ev, t) { this.document.removeCustomSkill(t.closest('[data-custom-id]').dataset.customId) }
  static #knowAdd(ev, t) { this.document.addKnowledge(t.dataset.list) }
  static #knowRemove(ev, t) { const r = t.closest('[data-know-list]'); this.document.removeKnowledge(r.dataset.knowList, Number(r.dataset.knowIndex)) }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const sys = this.document.system
    const d = sys.derived
    const items = this.document.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))
    const st = sys.stats

    // Візки: ті, що бачать гравці-власники цього персонажа (майстер бачить те саме + керування)
    const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, 'OWNER')).map(u => u.id)
    const wagons = Wagons.allWagons().filter(w => (game.user.isGM || Wagons.canSee(w, game.user.id))
      && (!owners.length || !w.users?.length || w.users.some(id => owners.includes(id))))
    if (!wagons.some(w => w.id === this._wagon)) this._wagon = wagons[0]?.id ?? null
    const showWagons = wagons.length > 0 || game.user.isGM
    if (!showWagons && this._tab === 'wagons') this._tab = 'overview'
    const row = (id, name, img, s, type) => {
      const qty = Math.max(1, Number(s?.quantity) || 1)
      const sub = type === 'weapon' ? GOD.WEAPON_CATEGORIES[s?.category] : type === 'armor' ? GOD.ARMOR_SLOTS[s?.slot] : GOD.GEAR_CATEGORIES[s?.category]?.label
      return { id, name, img, qty, multi: qty > 1, weight: Math.round((Number(s?.weight) || 0) * qty * 100) / 100, sub: sub ?? '' }
    }
    context.wagons = wagons.map(w => ({ id: w.id, name: w.name, party: w.party, count: w.items.length, active: w.id === this._wagon }))
    const cur = wagons.find(w => w.id === this._wagon)
    if (cur) {
      const weight = Wagons.wagonWeight(cur)
      context.wagon = { ...cur, weight, over: cur.capacity > 0 && weight > cur.capacity, pct: cur.capacity > 0 ? Math.min(100, weight / cur.capacity * 100) : 0,
        items: cur.items.map(i => row(i._id, i.name, i.img, i.system, i.type)) }
    }
    context.mine = actor.items.filter(i => ['gear', 'weapon', 'armor'].includes(i.type) && !i.system.equipped).map(i => row(i.id, i.name, i.img, i.system, i.type))
    context.canPut = !!cur && actor.isOwner
    context.tabs = TABS.filter(t => t.id !== 'wagons' || showWagons).map(t => ({ ...t, active: t.id === this._tab }))

    // ── Бічна панель
    context.resources = Object.entries(GOD.RESOURCES).map(([key, cfg]) => {
      const r = sys.resources[key]
      return {
        key, ...cfg, value: r.value, max: r.max, bonus: r.bonus,
        pct: r.max > 0 ? Math.max(0, Math.min(100, r.value / r.max * 100)) : 0,
        tip: `${cfg.label}: ${GOD.STATS[cfg.stat].label} ${st[cfg.stat].value} × ${cfg.mult} = ${r.auto}${r.bonus ? ` ${r.bonus > 0 ? '+' : ''}${r.bonus}` : ''}`,
        state: key === 'mt' ? R.mentalState(r.value) : null,
      }
    })
    context.armorRes = ['pr', 'mr'].map(key => {
      const r = sys.resources[key]
      return { key, abbr: key.toUpperCase(), value: r.value, max: r.max,
        pct: r.max > 0 ? Math.max(0, Math.min(100, r.value / r.max * 100)) : 0,
        tip: key === 'pr' ? `Фізичний захист — сума одягненої броні${d.shield && sys.skill?.('Щити') ? ` + ${R.shieldPrBonus(sys.skill('Щити'))} від вміння «Щити»` : ''}` : 'Магічний захист — сума одягненої броні' }
    })
    const dp = d.dodgeParts
    const AW = { lightFit: 'легкий підігнаний', light: 'легкий', mediumFit: 'середній підігнаний', medium: 'середній', heavyFit: 'тяжкий підігнаний', heavy: 'тяжкий' }
    context.dodgeTip = `ШУ: навантаження ${dp.load} з бази ${dp.base} → ${dp.fromLoad}` +
      `${dp.skill ? ` · Ухиляння +${dp.skill}` : ''}` +
      ` · обладунок ${d.armorWorst ? AW[d.armorWorst] : 'відсутній'} ${d.armorDodge >= 0 ? '+' : ''}${d.armorDodge}` +
      `${d.shieldDodge ? ` · щит ${d.shieldDodge}` : ''}` +
      `${dp.bonus ? ` · правка/ефекти ${dp.bonus > 0 ? '+' : ''}${dp.bonus}` : ''} · максимум ${R.MAX_DODGE}`
    context.xpPct = (() => {
      const lo = R.totalXpForLevel(d.level), hi = d.xpNext
      return hi > lo ? Math.max(0, Math.min(100, (sys.progress.xp - lo) / (hi - lo) * 100)) : 0
    })()
    context.money = Object.entries(GOD.MONEY).map(([key, m]) => ({ key, ...m, value: sys.money[key] }))
    context.moneyTotal = R.fmtMoney(R.consolidateMoney(sys.money))

    // ── Огляд
    context.stats = Object.entries(GOD.STATS).map(([key, cfg]) => ({ key, ...cfg, value: st[key].value, base: st[key].base ?? st[key].value, bonus: st[key].bonus, mod: st[key].mod }))
    context.equippedWeapons = items.filter(i => i.type === 'weapon' && i.system.equipped).map(i => this._weaponRow(i))
    context.readySpells = items.filter(i => i.type === 'spell').slice(0, 6).map(i => GodActorSheetBase.itemRow(i, {
      school: GOD.SPELL_SCHOOLS[i.system.school], castable: R.spellMastery({ type: this.document.type, schools: sys.schools, school: i.system.school, level: i.system.level }) > 0,
    }))

    // ── Вміння
    context.onlyLearned = this._onlyLearned
    context.pendingBuild = d.pendingBuild
    const floors = sys.floors.skills
    const skillRow = (s, lvl, floor, locked, extra = {}) => {
      const next = R.skillNextCost(s.cost, lvl, s.max)
      return {
        ...s, lvl, floor, locked, next, maxed: next === null, info: skillInfo(s.key),
        search: `${s.name} ${skillInfo(s.key)}`.toLowerCase(),
        hidden: this._onlyLearned && !lvl,
        fixed: lvl > 0 && lvl <= floor,
        pips: s.max <= 10 ? Array.from({ length: s.max }, (_, i) => ({ on: i < lvl, fixed: i < Math.min(lvl, floor) })) : [],
        upTip: locked ? 'Гілка закрита — спершу вкачай ключове вміння' : next === null ? 'Максимальний рівень' : `Підняти до ${lvl + 1}: ${next} очок`,
        downTip: !lvl ? '' : lvl <= floor ? 'Зафіксовано — знизити може лише майстер (Shift)' : `Знизити: повернеться ${R.skillRefund(s.cost, lvl)} очок`,
        ...extra,
      }
    }
    context.skillCats = Object.entries(GOD.SKILL_CATEGORIES).map(([cat, c]) => {
      const gateLvl = sys.skills[cat][c.gate] ?? 0
      const open = gateLvl > 0
      const gateMeta = c.skills.find(s => s.key === c.gate)
      const gate = skillRow(gateMeta, gateLvl, floors[c.gate] ?? 0, false, { isGate: true })
      const rest = c.skills.filter(s => s.key !== c.gate).map(s => skillRow(s, sys.skills[cat][s.key], floors[s.key] ?? 0, !open))
      const customs = sys.customSkills.filter(s => s.cat === cat).map(s =>
        skillRow({ key: `custom:${s.id}`, name: s.name, cost: s.cost, max: s.max }, s.lvl, s.floor, !open, { custom: true, id: s.id }))
      const all = [gate, ...rest, ...customs]
      const invested = all.reduce((sum, s) => sum + R.skillInvested(s.cost, s.lvl), 0)
      return {
        cat, label: c.label, open, gate, skills: [...rest, ...customs], customs,
        learned: all.filter(s => s.lvl > 0).length, total: all.length, invested,
        collapsed: this._collapsed.has(cat), gateName: gateMeta.name,
      }
    })
    context.customCats = Object.fromEntries(Object.entries(GOD.SKILL_CATEGORIES).map(([k, v]) => [k, v.label]))

    // ── Риси та знання
    const traitItems = items.filter(i => i.type === 'trait')
    context.traits = traitItems.filter(i => i.system.kind === 'trait').map(i => GodActorSheetBase.itemRow(i))
    context.quirks = traitItems.filter(i => i.system.kind === 'quirk').map(i => GodActorSheetBase.itemRow(i))
    const debuffs = traitItems.filter(i => i.system.kind === 'debuff')
    const dPts = debuffs.reduce((s, i) => s + (i.system.points || 0), 0)
    context.debuffs = debuffs.map(i => GodActorSheetBase.itemRow(i))
    context.debuffPts = { total: dPts, max: GOD.BALANCE.DEBUFF_MAX_TOTAL, over: dPts > GOD.BALANCE.DEBUFF_MAX_TOTAL }
    context.knowledge = {
      languages: sys.knowledge.languages.map((r, index) => ({ ...r, index })),
      recipes: sys.knowledge.recipes.map((r, index) => ({ ...r, index })),
      tech: sys.knowledge.tech.map((r, index) => ({ ...r, index })),
    }
    context.reputation = Object.entries(GOD.REPUTATION).map(([key, r]) => ({ key, ...r, value: sys.reputation[key] }))

    await this._gearContext(context, items)

    this._magicContext(context, items)

    context.biography = await enrich(sys.biography, this.document)
    return context
  }

}

// ═════════════════════════════════════════════════════════════════════════════
const NPC_TABS = [
  { id: 'overview', label: 'Ворог',       icon: 'fa-solid fa-skull-crossbones' },
  { id: 'gear',     label: 'Інвентар',    icon: 'fa-solid fa-sack' },
  { id: 'magic',    label: 'Магія',       icon: 'fa-solid fa-wand-sparkles' },
  { id: 'effects',  label: 'Ефекти',      icon: 'fa-solid fa-bolt' },
  { id: 'notes',    label: 'Нотатки',     icon: 'fa-solid fa-feather' },
]

/** НІП: той самий набір, що й у персонажа (броня, інвентар, магія, ефекти), без розвитку */
export class GodNpcSheet extends GodActorSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ['god', 'sheet', 'actor', 'npc'],
    position: { width: 780, height: 700 },
    actions: { npcAttack: GodNpcSheet.#npcAttack, rollStat: GodNpcSheet.#rollStat },
  }
  static PARTS = {
    sidebar:  { template: `${TPL}/npc-sidebar.hbs` },
    tabs:     { template: `${TPL}/tabs.hbs` },
    overview: { template: `${TPL}/npc-overview.hbs`, scrollable: [''] },
    gear:     { template: `${TPL}/gear.hbs`, scrollable: ['.god-inv-main', '.god-inv-detail'] },
    magic:    { template: `${TPL}/magic.hbs`, scrollable: [''] },
    effects:  { template: `${TPL}/effects.hbs`, scrollable: [''] },
    notes:    { template: `${TPL}/npc-notes.hbs`, scrollable: [''] },
  }
  _tab = 'overview'

  static #npcAttack() {
    const a = this.document
    weaponAttack(a, { name: 'Атака', img: a.img, natural: true, system: { category: 'onehand', phys: 0, mag: 0, hand: 'main' } })
  }
  static #rollStat(ev, target) { this.document.rollStat(target.dataset.stat) }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const actor = this.document, sys = actor.system
    const items = actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))
    const pct = r => r.max > 0 ? Math.max(0, Math.min(100, r.value / r.max * 100)) : 0
    context.tabs = NPC_TABS.map(t => ({ ...t, active: t.id === this._tab }))
    // HP завжди; OM, MT, ВС — якщо задано максимум (або в режимі редагування, щоб задати)
    const edit = context.editMode
    context.resources = ['hp', 'mp', 'mt', 'ed'].filter(key => key === 'hp' || edit || (sys.resources[key]?.max ?? 0) > 0).map(key => {
      const r = sys.resources[key]
      return { key, abbr: key === 'ed' ? 'ВС' : (GOD.RESOURCES[key]?.abbr ?? key.toUpperCase()), value: r.value, max: r.max, pct: pct(r),
        tip: { hp: "Здоров'я", mp: 'Одхі (мана)', mt: 'Ментальне', ed: 'Витривалість — для здібностей' }[key] }
    })
    context.armorRes = ['pr', 'mr'].map(key => {
      const r = sys.resources[key], fromItems = key === 'pr' ? sys.derived.armorPr : sys.derived.armorMr
      return { key, abbr: key.toUpperCase(), value: r.value, max: r.max, base: r.base, pct: pct(r),
        tip: `${key === 'pr' ? 'Фізичний' : 'Магічний'} захист: природний ${r.base} + броня ${fromItems}` }
    })
    // Картка ворога як на сайті: показники з формулами і таблиця уражень 10–150% від PD/MD
    const d = sys.derived
    const dodgeTip = `База ${sys.dodge}${d.armorDodge ? `, обладунок ${d.armorDodge > 0 ? '+' : ''}${d.armorDodge}` : ''}${d.shieldDodge ? `, щит +${d.shieldDodge}` : ''}${sys.combat.dodgeBonus ? `, ефекти ${sys.combat.dodgeBonus > 0 ? '+' : ''}${sys.combat.dodgeBonus}` : ''}${sys.size !== 'medium' ? `, ${GOD.CREATURE_SIZES[sys.size]}` : ''}`
    context.foeStats = [
      { label: 'PD', path: 'system.attack.phys', value: sys.attack.phys, min: true, cls: 'phys', tip: 'Фізичний урон на 100% — база таблиці уражень' },
      { label: 'MD', path: 'system.attack.mag', value: sys.attack.mag, min: true, cls: 'mag', tip: 'Магічний урон на 100% — база таблиці уражень' },
      { label: 'ШУ', path: 'system.dodge', value: sys.dodge, min: true, cls: 'dodge', tip: `Шанс ухилення: попадання по ворогу має бути більше. ${dodgeTip}`,
        shown: d.dodge !== sys.dodge ? d.dodge : null, shownTip: `Підсумкове ШУ: ${dodgeTip}` },
      { label: 'Ініціатива', path: 'system.initiative', value: sys.initiative, tip: 'Порядок ходу в бою: більше — раніше' },
      { label: 'Швидкість', path: 'system.speed', value: sys.speed, min: true, tip: 'Клітинок за хід' },
      { label: 'Влучність', path: 'system.attack.hitMod', value: sys.attack.hitMod, tip: 'Додається до кидка попадання' },
    ]
    const hm = M.hitMods(actor, sys.attack.hitMod, 'влучність')
    context.hitTotal = hm.total
    const MULTS = [[10, 'Дотик'], [25, 'Слабке'], [50, 'Половина'], [75, 'Сильне'], [100, 'Повне'], [150, 'Крит']]
    const pd = sys.attack.phys || 0, md = sys.attack.mag || 0
    const r1 = n => Math.round(n * 10) / 10
    context.dmgCols = MULTS.map(([pct, tip]) => ({ pct, tip }))
    context.dmgRows = [
      pd && { label: 'PD', cls: 'phys', tip: 'Фізичний урон', values: MULTS.map(([p]) => r1(pd * p / 100)) },
      md && { label: 'MD', cls: 'mag', tip: 'Магічний урон', values: MULTS.map(([p]) => r1(md * p / 100)) },
      pd && md && { label: 'Σ', cls: 'sum', tip: 'Разом: фізичний + магічний', values: MULTS.map(([p]) => r1((pd + md) * p / 100)) },
    ].filter(Boolean)
    context.readySpells = items.filter(i => i.type === 'spell').map(i => GodActorSheetBase.itemRow(i, {
      school: GOD.SPELL_SCHOOLS[i.system.school], castable: R.spellMastery({ type: actor.type, schools: sys.schools, school: i.system.school, level: i.system.level }) > 0,
    }))
    context.abilities = items.filter(i => i.type === 'ability').map(i => GodActorSheetBase.itemRow(i))
    await this._gearContext(context, items)
    this._magicContext(context, items)
    context.notes = await enrich(sys.notes, actor)
    return context
  }
}
