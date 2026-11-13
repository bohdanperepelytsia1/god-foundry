import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'
import { fitToScreen } from './actor-sheets.mjs'
import { editEffect, changeLabel } from '../apps/effect-builder.mjs'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

export class GodItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['god', 'sheet', 'item'],
    position: { width: 600, height: 680 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      editImage: GodItemSheet.#editImage,
      saveClose: GodItemSheet.#saveClose,
      gearCategory: GodItemSheet.#gearCategory,
      effectCreate: GodItemSheet.#effectCreate, effectEdit: GodItemSheet.#effectEdit,
      effectDelete: GodItemSheet.#effectDelete, effectToggle: GodItemSheet.#effectToggle,
    },
  }
  _initializeApplicationOptions(options) {
    const o = super._initializeApplicationOptions(options)
    fitToScreen(o.position)
    return o
  }

  static PARTS = { body: { template: 'systems/god/templates/item/item-sheet.hbs', scrollable: [''] } }

  /**
   * «Зберегти»: поля форми + текст із відкритих редакторів опису (вони інакше зберігаються
   * лише власною кнопкою або при закритті), потім закрити лист.
   */
  static async #saveClose() {
    if (!this.isEditable) return this.close()
    const upd = {}
    for (const pm of this.element.querySelectorAll('prose-mirror[name]')) {
      const live = pm.querySelector('.ProseMirror')
      if (live) upd[pm.getAttribute('name')] = live.innerHTML
    }
    try {
      await this.submit()
      if (Object.keys(upd).length) await this.document.update(upd)
      ui.notifications.info(`«${this.document.name}» збережено`)
      await this.close({ submit: false })
    } catch (err) {
      console.error('G.O.D. | збереження предмета', err)
      ui.notifications.error(`Не вдалося зберегти: ${err.message}`)
    }
  }

  static #editImage() {
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker
    new FP({ type: 'image', current: this.document.img, callback: path => this.document.update({ img: path }) }).browse()
  }

  /** Категорія звичайного предмета: іконка, розділ і «розхідне» підлаштуються в _preUpdate */
  static #gearCategory(ev, target) {
    if (!this.isEditable) return
    this.document.update({ 'system.category': target.dataset.cat })
  }

  _eff(t) { return this.document.effects.get(t.closest('[data-effect-id]')?.dataset.effectId) }
  static #effectCreate() { if (this.isEditable) editEffect(this.document) }
  static #effectEdit(ev, t) { const e = this._eff(t); if (e && this.isEditable) editEffect(this.document, e); else e?.sheet.render(true) }
  static #effectDelete(ev, t) { this._eff(t)?.delete() }
  static #effectToggle(ev, t) { const e = this._eff(t); e?.update({ disabled: !e.disabled }) }

  /** Ключові характеристики для шапки — щоб суть предмета читалась одразу */
  static facts(item) {
    const s = item.system, f = []
    if (item.type === 'weapon') {
      f.push({ label: GOD.WEAPON_CATEGORIES[s.category] })
      if (s.phys) f.push({ label: `${s.phys} фіз`, cls: 'phys' })
      if (s.mag) f.push({ label: `${s.mag} маг`, cls: 'mag' })
      if (s.twoHanded) f.push({ label: 'дворучна' })
    } else if (item.type === 'armor') {
      f.push({ label: GOD.ARMOR_SLOTS[s.slot] })
      if (s.armorClass !== 'none') {
        const k = R.armorClassKey(s.armorClass, s.fitted)
        f.push({ label: `${GOD.ARMOR_CLASSES[s.armorClass]}${s.fitted ? ', підігнаний' : ''} · ШУ ${R.ARMOR_DODGE[k] >= 0 ? '+' : ''}${R.ARMOR_DODGE[k]}` })
      }
      if (s.phys) f.push({ label: `PR ${s.phys}`, cls: 'phys' })
      if (s.mag) f.push({ label: `MR ${s.mag}`, cls: 'mag' })
    } else if (item.type === 'spell') {
      f.push({ label: GOD.SPELL_SCHOOLS[s.school] }, { label: `ПППС ${s.threshold}` }, { label: `${s.manaCost} OM`, cls: 'mag' })
      if (s.staminaCost) f.push({ label: `${s.staminaCost} ВС` })
      if (s.baseDamage) f.push({ label: `база ${s.baseDamage}` })
      f.push({ label: GOD.ATTACK_TYPES[s.attackType] })
    } else if (item.type === 'ability') {
      if (s.manaCost) f.push({ label: `${s.manaCost} OM`, cls: 'mag' })
      if (s.staminaCost) f.push({ label: `${s.staminaCost} ВС` })
      if (s.cooldown) f.push({ label: `CD ${s.cooldown}` })
    }
    if (item.type === 'gear' && s.category && s.category !== 'item') f.push({ label: GOD.GEAR_CATEGORIES[s.category]?.label })
    if (item.type === 'gear' && s.consumable) {
      f.push({ label: 'розхідне' })
      for (const r of R.restoreList(s.restore)) f.push({ label: `${GOD.RESOURCES[r.key]?.abbr ?? r.key.toUpperCase()} ${r.value > 0 ? '+' : ''}${r.value}`, cls: r.key === 'mp' ? 'mag' : '' })
    }
    if (item.type === 'trait') {
      f.push({ label: s.kind === 'quirk' ? 'Особливість' : s.kind === 'debuff' ? `Дебаф${s.controlled ? ', контрольований' : ''}` : 'Риса' })
      if (s.kind === 'debuff' && s.points) f.push({ label: `+${s.points} очок умінь` })
      if (s.cost) f.push({ label: `вартість ${s.cost}` })
    }
    if (['weapon', 'armor', 'gear'].includes(item.type) && s.weight) f.push({ label: `${s.weight} кг` })
    return f
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const item = this.document
    const enrich = html => foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? '', { relativeTo: item })
    Object.assign(context, {
      item, system: item.system, config: GOD,
      isWeapon: item.type === 'weapon', isArmor: item.type === 'armor', isGear: item.type === 'gear',
      isSpell: item.type === 'spell', isAbility: item.type === 'ability', isTrait: item.type === 'trait',
      traitKinds: { trait: 'Риса', quirk: 'Особливість (квірк)', debuff: 'Дебаф' },
      isPhysical: ['weapon', 'armor', 'gear'].includes(item.type),
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      description: await enrich(item.system.description),
      upgrades: item.type === 'spell' ? await enrich(item.system.upgrades) : '',
      handOptions: { main: 'Основна рука (+СИЛ×5)', off: 'Друга рука (без СИЛ)' },
      damageKinds: { mag: 'Магічний', phys: 'Фізичний', none: 'Без урону' },
      facts: GodItemSheet.facts(item),
      gearGroups: item.type === 'gear' ? Object.entries(GOD.GEAR_GROUPS).map(([gid, label]) => ({
        label, cats: Object.entries(GOD.GEAR_CATEGORIES).filter(([, g]) => g.group === gid).map(([id, g]) => ({ id, label: g.label, active: item.system.category === id })),
      })) : [],
      gearCats: item.type === 'gear' ? Object.entries(GOD.GEAR_CATEGORIES).map(([id, g]) => ({
        id, label: g.label, consumable: g.consumable, locLabel: GOD.INVENTORY_LOCATIONS[g.loc],
        icon: `systems/god/assets/icons/gear/${g.icon}.svg`, active: item.system.category === id,
      })) : [],
      restoreFields: item.type === 'gear' ? R.RESTORE_KEYS.map(key => ({
        key, value: item.system.restore?.[key] ?? 0,
        abbr: GOD.RESOURCES[key]?.abbr ?? key.toUpperCase(),
        tip: GOD.RESOURCES[key]?.label ?? (key === 'pr' ? 'Фізичний захист' : 'Магічний захист'),
      })) : [],
      equipGated: ['weapon', 'armor'].includes(item.type),
      effects: item.effects.map(e => ({
        id: e.id, name: e.name, img: e.img, disabled: e.disabled,
        changes: e.changes.map(ch => `${changeLabel(ch.key)} ${Number(ch.value) >= 0 ? '+' : ''}${ch.value}`).join(' · ') || 'без змін',
      })),
    })
    return context
  }
}
