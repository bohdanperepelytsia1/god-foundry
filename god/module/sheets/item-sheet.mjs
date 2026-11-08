import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'

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
      effectCreate: GodItemSheet.#effectCreate, effectEdit: GodItemSheet.#effectEdit,
      effectDelete: GodItemSheet.#effectDelete, effectToggle: GodItemSheet.#effectToggle,
    },
  }
  static PARTS = { body: { template: 'systems/god/templates/item/item-sheet.hbs', scrollable: [''] } }

  static #editImage() {
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker
    new FP({ type: 'image', current: this.document.img, callback: path => this.document.update({ img: path }) }).browse()
  }

  _eff(t) { return this.document.effects.get(t.closest('[data-effect-id]')?.dataset.effectId) }
  static async #effectCreate() {
    const [e] = await this.document.createEmbeddedDocuments('ActiveEffect', [{
      name: `${this.document.name}: ефект`, img: this.document.img, transfer: true,
    }])
    e?.sheet.render(true)
  }
  static #effectEdit(ev, t) { this._eff(t)?.sheet.render(true) }
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
      if (s.armorClass !== 'none') f.push({ label: GOD.ARMOR_CLASSES[s.armorClass] })
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
    if (item.type === 'gear' && s.consumable) {
      f.push({ label: 'розхідне' })
      for (const r of R.restoreList(s.restore)) f.push({ label: `${GOD.RESOURCES[r.key]?.abbr ?? r.key.toUpperCase()} ${r.value > 0 ? '+' : ''}${r.value}`, cls: r.key === 'mp' ? 'mag' : '' })
    }
    if (item.type === 'trait') {
      f.push({ label: s.kind === 'quirk' ? 'Особливість' : 'Риса' })
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
      traitKinds: { trait: 'Риса', quirk: 'Особливість' },
      isPhysical: ['weapon', 'armor', 'gear'].includes(item.type),
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      description: await enrich(item.system.description),
      upgrades: item.type === 'spell' ? await enrich(item.system.upgrades) : '',
      handOptions: { main: 'Основна рука (+СИЛ×5)', off: 'Друга рука (без СИЛ)' },
      damageKinds: { mag: 'Магічний', phys: 'Фізичний', none: 'Без урону' },
      facts: GodItemSheet.facts(item),
      restoreFields: item.type === 'gear' ? R.RESTORE_KEYS.map(key => ({
        key, value: item.system.restore?.[key] ?? 0,
        abbr: GOD.RESOURCES[key]?.abbr ?? key.toUpperCase(),
        tip: GOD.RESOURCES[key]?.label ?? (key === 'pr' ? 'Фізичний захист' : 'Магічний захист'),
      })) : [],
      equipGated: ['weapon', 'armor'].includes(item.type),
      effects: item.effects.map(e => ({
        id: e.id, name: e.name, img: e.img, disabled: e.disabled,
        changes: e.changes.map(ch => `${ch.key.replace('system.', '')} ${Number(ch.value) >= 0 ? '+' : ''}${ch.value}`).join(' · ') || 'без змін',
      })),
    })
    return context
  }
}
