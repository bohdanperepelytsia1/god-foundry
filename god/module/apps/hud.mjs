/**
 * Панель персонажа — компактне вікно поверх сцени: ресурси з дельта-вводом,
 * ШУ/швидкість/ініціатива, стійка, атака зброєю в руках, швидкі заклинання.
 * Можна закріпити: відкриється саме після перезавантаження, на тому ж місці.
 */
import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'
import { PinnableMixin } from './pins.mjs'
import { bindResourceControls } from './res-controls.mjs'

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api

export class GodHud extends PinnableMixin(HandlebarsApplicationMixin(ApplicationV2)) {
  static DEFAULT_OPTIONS = {
    classes: ['god', 'god-hud'],
    window: { icon: 'fa-solid fa-id-badge', minimizable: true, resizable: false },
    position: { width: 290, height: 'auto' },
    actions: {
      use: GodHud.#use, stance: GodHud.#stance, sheet: GodHud.#sheet, tray: GodHud.#tray, pin: GodHud.#pin,
    },
  }
  static PARTS = { body: { template: 'systems/god/templates/apps/hud.hbs' } }

  static open(actor, { position } = {}) {
    if (!actor) return null
    const id = `god-hud-${actor.id}`
    const app = foundry.applications.instances?.get(id) ?? new GodHud({ id, actorId: actor.id, ...(position ? { position } : {}) })
    app.render({ force: true })
    return app
  }

  constructor(options = {}) {
    super(options)
    this.actorId = options.actorId
  }
  get actor() { return game.actors.get(this.actorId) }
  get title() { return this.actor?.name ?? 'Панель персонажа' }
  _pinData() { return { type: 'hud', actorId: this.actorId } }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options)
    bindResourceControls(this.element, () => this.actor, { delta: true })
  }

  async _prepareContext() {
    const a = this.actor
    if (!a) return { missing: true }
    const s = a.system
    const isChar = a.type === 'character'
    const keys = isChar ? ['hp', 'mp', 'ed', 'mt'] : ['hp', 'mp', 'ed']
    const bar = k => {
      const r = s.resources[k]
      return { key: k, abbr: GOD.RESOURCES[k]?.abbr ?? k.toUpperCase(),
        value: r.value, max: r.max, pct: r.max > 0 ? Math.max(0, Math.min(100, r.value / r.max * 100)) : 0 }
    }
    const stance = a.effects.find(e => e.getFlag('god', 'stance'))?.getFlag('god', 'stance') ?? 'neutral'
    return {
      actor: a, isChar, pinned: this.isPinned,
      bars: keys.map(bar), armor: ['pr', 'mr'].map(bar),
      dodge: s.derived?.dodge ?? 0, speed: s.derived?.speed ?? s.speed, initiative: s.derived?.initiative ?? s.initiative,
      stances: [['neutral', 'Нейтр.', 'Нейтральна'], ['attack', 'Атака', 'Атакуюча: урон +2, ШУ −4'], ['defense', 'Захист', 'Захисна: ШУ +2, урон −4'], ['nonlethal', 'Несм.', 'Несмертельна: урон −3, попадання +1']]
        .map(([id, label, tip]) => ({ id, label, tip, active: id === stance })),
      weapons: a.items.filter(i => i.type === 'weapon' && (i.system.equipped || !isChar)),
      spells: a.items.filter(i => i.type === 'spell' && (s.schools?.[i.system.school] ?? 0) > 0),
      overloaded: s.derived?.overloaded,
    }
  }

  static #use(ev, t) { this.actor?.items.get(t.dataset.itemId)?.use() }
  static #stance(ev, t) { this.actor?.setStance(t.dataset.stance) }
  static #sheet() { this.actor?.sheet.render(true) }
  static #tray() { game.god.diceTray(this.actor) }
  static #pin() { this.togglePin() }
}
