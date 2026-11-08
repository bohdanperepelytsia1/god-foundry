import * as Dice from '../dice/rolls.mjs'
import { GOD, defaultIcon, ICON_ROOT } from '../config.mjs'

export class GodItem extends Item {
  /** Головна дія предмета: атака зброєю, сотворення заклинання, використання здібності */
  async use() {
    const actor = this.actor
    if (!actor) return ui.notifications.warn('Предмет має належати персонажу')
    if (this.type === 'weapon') return Dice.weaponAttack(actor, this)
    if (this.type === 'spell')  return Dice.castSpell(actor, this)
    if (this.type === 'ability') return Dice.useAbility(actor, this)
    if (this.type === 'gear' && this.system.consumable) return Dice.consumeItem(actor, this)
    return Dice.postItem(actor, this)
  }

  /** Іконка за замовчуванням іде за категорією: змінив категорію меча на сокиру — змінилась і іконка.
   *  Власні картинки користувача ніколи не перезаписуються. */
  /** Пояс має обмежену кількість слотів: перекласти в повний пояс не можна */
  static beltFull(actor, ignoreId) {
    if (actor?.type !== 'character') return false
    const used = actor.items.filter(i => i.id !== ignoreId && i.system.location === 'belt').length
    return used >= (actor.system.derived?.belt?.slots ?? 0)
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false
    // Звичайний предмет: розділ і «розхідне» — за категорією, якщо не задано явно
    if (this.type === 'gear') {
      const cat = GOD.GEAR_CATEGORIES[this.system.category]
      const upd = {}
      if (cat && foundry.utils.getProperty(data, 'system.location') === undefined) upd['system.location'] = cat.loc
      if (cat && foundry.utils.getProperty(data, 'system.consumable') === undefined) upd['system.consumable'] = !!cat.consumable
      if (Object.keys(upd).length) this.updateSource(upd)
    }
    if (this.system.location === 'belt' && GodItem.beltFull(this.parent)) {
      ui.notifications.warn('Пояс заповнений — предмет покладено в «Загальне»')
      this.updateSource({ 'system.location': 'main' })
    }
  }

  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false
    if (foundry.utils.getProperty(changes, 'system.location') === 'belt' && this.system.location !== 'belt'
        && GodItem.beltFull(this.parent, this.id)) {
      ui.notifications.warn(`Пояс заповнений (${this.parent.system.derived.belt.slots} слотів). Одягни пояс більшого розміру.`)
      this.parent.sheet?.render()   // повернути випадний список до реального значення
      return false
    }
    // Нова категорія предмета: розділ і «розхідне» підлаштовуються (якщо їх не змінено в цьому ж оновленні)
    if (this.type === 'gear' && foundry.utils.hasProperty(changes, 'system.category')) {
      const cat = GOD.GEAR_CATEGORIES[changes.system.category], old = GOD.GEAR_CATEGORIES[this.system.category]
      if (cat && !foundry.utils.hasProperty(changes, 'system.location') && [old?.loc, 'main'].includes(this.system.location)
          && !(cat.loc === 'belt' && GodItem.beltFull(this.parent, this.id))) {
        foundry.utils.setProperty(changes, 'system.location', cat.loc)
      }
      if (cat && !foundry.utils.hasProperty(changes, 'system.consumable')) foundry.utils.setProperty(changes, 'system.consumable', !!cat.consumable)
    }
    const keys = ['category', 'slot', 'school']
    const touched = keys.some(k => foundry.utils.hasProperty(changes, `system.${k}`))
    if (!touched || changes.img || !this.img?.startsWith(ICON_ROOT)) return
    const merged = foundry.utils.mergeObject(this.system.toObject(), changes.system ?? {}, { inplace: false })
    changes.img = defaultIcon(this.type, merged)
  }

  get isPhysical() { return ['weapon', 'armor', 'gear'].includes(this.type) }
  get totalWeight() { return Math.round((this.system.weight || 0) * (this.system.quantity ?? 1) * 100) / 100 }
}
