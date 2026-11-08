/**
 * Ефекти предметів G.O.D.: ефект на зброї чи обладунку діє на персонажа
 * лише поки предмет одягнений/у руці. Кільце «+200 OM» у рюкзаку — не працює.
 */
export class GodActiveEffect extends ActiveEffect {
  get isSuppressed() {
    const item = this.parent
    if (item instanceof Item && ['weapon', 'armor'].includes(item.type)) return !item.system.equipped
    return super.isSuppressed ?? false
  }

  /** Підпис джерела для листа персонажа */
  get sourceLabel() {
    return this.parent instanceof Item ? this.parent.name : null
  }
}
