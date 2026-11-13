/** Лист героя: огляд, вміння, інвентар, магія, риси, ефекти, біографія, візки */
import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'
import { skillInfo } from '../skill-info.mjs'
import * as Wagons from '../wagons.mjs'
import { GodActorSheetBase, TPL, enrich } from './sheet-base.mjs'

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
    const actor = this.document
    const sys = actor.system
    const d = sys.derived
    const items = actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))
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
