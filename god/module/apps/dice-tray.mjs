/**
 * Панель кидків G.O.D. — неблокуюче вікно поверх сцени.
 * Обираєш характеристику чи прокачане вміння → модифікатор підставляється сам;
 * лоток кубів для довільних пулів; перевага/недолік; ±модифікатор.
 * Після кожного кидка параметри скидаються до дефолту, щоб недолік чи старий
 * модифікатор не "залипали" на наступний кидок.
 * 3D-анімацію дає Dice So Nice автоматично — для будь-якого кидка в чаті.
 */
import { GOD } from '../config.mjs'
import { quickRoll } from '../dice/rolls.mjs'
import { PinnableMixin } from './pins.mjs'

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api
const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

export class GodDiceTray extends PinnableMixin(HandlebarsApplicationMixin(ApplicationV2)) {
  static DEFAULT_OPTIONS = {
    id: 'god-dice-tray',
    classes: ['god', 'god-tray'],
    window: { title: 'Панель кидків', icon: 'fa-solid fa-dice-d20', resizable: true },
    position: { width: 380, height: 620 },
    actions: {
      pick: GodDiceTray.#pick,
      addDie: GodDiceTray.#addDie,
      clearPool: GodDiceTray.#clearPool,
      setMode: GodDiceTray.#setMode,
      modStep: GodDiceTray.#modStep,
      setSource: GodDiceTray.#setSource,
      roll: GodDiceTray.#roll,
      pin: GodDiceTray.#pin,
    },
  }
  static PARTS = { body: { template: 'systems/god/templates/apps/dice-tray.hbs', scrollable: ['.god-tray-picks'] } }

  /** Відкрити (або підняти наверх) панель; actor — необов'язково */
  static open(actor, { position } = {}) {
    const app = foundry.applications.instances?.get('god-dice-tray') ?? GodDiceTray._instance ?? new GodDiceTray(position ? { position } : {})
    GodDiceTray._instance = app
    if (actor) app._actorId = actor.id
    app.render({ force: true })
    app.bringToFront?.()
    return app
  }

  _actorId = null
  _source = 'skills'        // 'stats' | 'skills'
  _search = ''
  _defaults() { this._pick = null; this._extra = 0; this._mode = 'norm'; this._pool = {} }
  constructor(...args) { super(...args); this._defaults() }

  /** Актор: обраний вручну → контрольований токен → призначений персонаж */
  get actor() {
    return game.actors.get(this._actorId)
      ?? canvas.tokens?.controlled[0]?.actor
      ?? game.user.character
      ?? game.actors.find(a => a.type === 'character' && a.isOwner)
      ?? null
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options)
    this.element.addEventListener('change', ev => {
      if (ev.target.name === 'actor') { this._actorId = ev.target.value; this._pick = null; this.render() }
      if (ev.target.name === 'extra') { this._extra = Number(ev.target.value) || 0; this.render({ parts: ['body'] }) }
    })
    this.element.addEventListener('input', ev => {
      if (ev.target.name !== 'search') return
      this._search = ev.target.value.trim().toLowerCase()
      for (const el of this.element.querySelectorAll('[data-search]')) {
        el.classList.toggle('god-hidden', !!this._search && !el.dataset.search.includes(this._search))
      }
    })
    // ПКМ по кубу в лотку — прибрати один
    this.element.addEventListener('contextmenu', ev => {
      const btn = ev.target.closest('[data-action="addDie"]')
      if (!btn) return
      ev.preventDefault()
      const d = btn.dataset.die
      this._pool[d] = Math.max(0, (this._pool[d] || 0) - 1)
      this.render()
    })
  }

  async _prepareContext() {
    const actor = this.actor
    const sys = actor?.system
    const isChar = actor?.type === 'character'
    const pickKey = this._pick ? `${this._pick.kind}:${this._pick.key}` : ''

    const stats = sys?.stats ? Object.entries(GOD.STATS).map(([key, c]) => ({
      kind: 'stat', key, label: c.label, abbr: c.abbr, mod: sys.stats[key].mod, value: sys.stats[key].value,
      active: pickKey === `stat:${key}`,
    })) : []

    const skillGroups = isChar ? Object.entries(GOD.SKILL_CATEGORIES).map(([cat, c]) => ({
      label: c.label,
      skills: c.skills.filter(s => sys.skills[cat][s.key] > 0).map(s => ({
        kind: 'skill', key: s.key, label: s.name, mod: sys.skills[cat][s.key], search: s.name.toLowerCase(),
        active: pickKey === `skill:${s.key}`,
      })),
    })).filter(g => g.skills.length) : []

    const base = this._baseMod(actor)
    const total = base + this._extra
    const poolDice = Object.entries(this._pool).filter(([, n]) => n > 0)
    const formula = poolDice.length
      ? poolDice.map(([d, n]) => `${n}${d}`).join(' + ')
      : ({ norm: '1d20', adv: '2d20 (краща)', dis: '2d20 (гірша)' })[this._mode]

    return {
      actor, isChar,
      actors: game.actors.filter(a => a.isOwner && ['character', 'npc'].includes(a.type)).map(a => ({ id: a.id, name: a.name, selected: a.id === actor?.id })),
      source: this._source, stats, skillGroups, search: this._search,
      pickLabel: this._pickLabel(),
      dice: DIE_TYPES.map(d => ({ d, n: this._pool[d] || 0 })),
      hasPool: poolDice.length > 0,
      modes: [['dis', 'Недолік'], ['norm', 'Звичайний'], ['adv', 'Перевага']].map(([id, label]) => ({ id, label, active: this._mode === id })),
      base, extra: this._extra,
      preview: `${formula}${total ? ` ${total > 0 ? '+' : '−'} ${Math.abs(total)}` : ''}`,
      dsn: !!game.modules.get('dice-so-nice')?.active,
      pinned: this.isPinned,
    }
  }

  _baseMod(actor) {
    if (!this._pick || actor?.type !== 'character') return 0
    return this._pick.kind === 'stat' ? actor.system.stats[this._pick.key]?.mod ?? 0 : actor.system.skill(this._pick.key)
  }
  _pickLabel() {
    if (!this._pick) return ''
    return this._pick.kind === 'stat' ? GOD.STATS[this._pick.key]?.label : GOD.SKILL_INDEX[this._pick.key]?.name
  }

  _onRender(context, options) {
    super._onRender(context, options)
    if (this._search) {
      const inp = this.element.querySelector('[name="search"]')
      if (inp) inp.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  _pinData() { return { type: 'tray', actorId: this._actorId } }
  static #pin() { this.togglePin() }
  static #setSource(ev, t) { this._source = t.dataset.source; this.render() }
  static #pick(ev, t) {
    const same = this._pick?.kind === t.dataset.kind && this._pick?.key === t.dataset.key
    this._pick = same ? null : { kind: t.dataset.kind, key: t.dataset.key }
    // Подвійний клік по вже обраному — одразу кинути
    if (same && ev.detail >= 2) { this._pick = { kind: t.dataset.kind, key: t.dataset.key }; return GodDiceTray.#roll.call(this) }
    this.render()
  }
  static #addDie(ev, t) { const d = t.dataset.die; this._pool[d] = (this._pool[d] || 0) + 1; this.render() }
  static #clearPool() { this._pool = {}; this.render() }
  static #setMode(ev, t) { this._mode = t.dataset.mode; this.render() }
  static #modStep(ev, t) { this._extra += Number(t.dataset.step) || 0; this.render() }

  static async #roll() {
    const actor = this.actor
    if (!actor) return ui.notifications.warn('Обери персонажа для кидка')
    const label = this._pickLabel() || (Object.values(this._pool).some(n => n) ? 'Кидок кубів' : 'Перевірка d20')
    const sub = this._pick ? (this._pick.kind === 'stat' ? 'характеристика' : `вміння, рівень ${this._baseMod(actor)}`) : ''
    await quickRoll(actor, { label, sub, base: this._baseMod(actor), extra: this._extra, mode: this._mode, pool: { ...this._pool } })
    this._defaults()   // скидаємо все до дефолту після кидка
    this.render()
  }
}
