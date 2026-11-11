/**
 * Панель бою G.O.D. — як трекер ініціативи на сайті, але поверх стандартного бою Foundry
 * (той самий документ Combat, тож працюють і маркери ходу на токенах, і вбудований трекер).
 *
 * Майстер: «Почати бій» з виділеними токенами (або з усіма на сцені) — ініціатива
 * підставляється сама з листа, без кидків; далі хід за ходом, раунди ←/→, вибулі, кінець бою.
 * Гравці бачать порядок ходів і раунд; у свій хід — кнопка «Завершити хід».
 */
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api

const esc = s => foundry.utils.escapeHTML?.(String(s ?? '')) ?? String(s ?? '')
/** Ініціатива з листа: у героя — похідна, у НІП — задана майстром */
export const initiativeOf = actor => Number(actor?.system?.derived?.initiative ?? actor?.system?.initiative ?? 0) || 0
const SIDE = { '-1': 'hostile', '0': 'neutral', '1': 'friendly', '-2': 'secret' }

export class GodCombatPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'god-combat',
    classes: ['god', 'god-combat'],
    window: { title: 'Бій', icon: 'fa-solid fa-swords', minimizable: true, resizable: true },
    position: { width: 340, height: 'auto', top: 80, left: 120 },
    actions: {
      start: GodCombatPanel.#start, add: GodCombatPanel.#add, end: GodCombatPanel.#end,
      nextTurn: GodCombatPanel.#nextTurn, prevTurn: GodCombatPanel.#prevTurn,
      nextRound: GodCombatPanel.#nextRound, prevRound: GodCombatPanel.#prevRound,
      remove: GodCombatPanel.#remove, defeated: GodCombatPanel.#defeated, hide: GodCombatPanel.#hide,
      pan: GodCombatPanel.#pan, sheet: GodCombatPanel.#sheet, resetIni: GodCombatPanel.#resetIni,
    },
  }
  static PARTS = { body: { template: 'systems/god/templates/apps/combat-panel.hbs', scrollable: ['.god-cb-list'] } }

  static get instance() { return foundry.applications.instances?.get('god-combat') ?? null }
  static open() { const app = GodCombatPanel.instance ?? new GodCombatPanel(); app.render({ force: true }); return app }
  static toggle() { const app = GodCombatPanel.instance; return app?.rendered ? app.close() : GodCombatPanel.open() }
  static refresh() { const app = GodCombatPanel.instance; if (app?.rendered) app.render() }

  get combat() { return game.combats?.viewed ?? game.combat ?? null }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options)
    // Ініціатива редагується майстром прямо в рядку (з формулами: 12, +2, -1)
    this.element.addEventListener('change', ev => {
      const el = ev.target.closest('[data-ini]')
      if (!el || !game.user.isGM) return
      const c = this.combat?.combatants.get(el.closest('[data-combatant-id]')?.dataset.combatantId)
      if (!c) return
      const raw = el.value.trim(), cur = Number(c.initiative) || 0
      const v = /^[+-]/.test(raw) ? cur + (Number(raw) || 0) : Number(raw)
      if (Number.isFinite(v)) c.update({ initiative: v })
    })
    // Наведення на рядок підсвічує токен на сцені
    this.element.addEventListener('pointerover', ev => {
      const row = ev.target.closest('[data-combatant-id]')
      const t = this.combat?.combatants.get(row?.dataset.combatantId)?.token?.object
      if (t?.visible && !t.controlled) { this._hovered?._onHoverOut?.(ev); t._onHoverIn?.(ev, { hoverOutOthers: true }); this._hovered = t }
    })
    this.element.addEventListener('pointerleave', ev => { this._hovered?._onHoverOut?.(ev); this._hovered = null })
  }

  async _prepareContext() {
    const combat = this.combat, gm = game.user.isGM
    const scene = canvas?.scene
    if (!combat) {
      const selected = (canvas?.tokens?.controlled ?? []).filter(t => t.actor).length
      const onScene = (scene?.tokens ?? []).filter(t => t.actor).length
      return { none: true, gm, selected, onScene, sceneName: scene?.name ?? '' }
    }
    const started = combat.started
    const rows = combat.turns.filter(c => gm || !c.hidden).map((c, n) => {
      const i = combat.turns.indexOf(c)
      const a = c.actor, r = a?.system?.resources?.hp
      const seeHp = !!r && (gm || c.isOwner)
      const disp = c.token?.disposition ?? a?.prototypeToken?.disposition ?? 0
      return {
        id: c.id, num: n + 1, name: c.name, img: c.token?.texture?.src || c.img || a?.img,
        ini: c.initiative ?? '—', hasIni: c.initiative !== null && c.initiative !== undefined,
        active: started && i === combat.turn, done: started && i < combat.turn,
        defeated: c.isDefeated, hidden: c.hidden, owner: c.isOwner, side: SIDE[disp] ?? 'neutral',
        double: !!c.getFlag?.('god', 'doubleTurn'),
        hp: seeHp ? { value: r.value, max: r.max, pct: r.max > 0 ? Math.max(0, Math.min(100, r.value / r.max * 100)) : 0, low: r.value <= r.max * 0.25 } : null,
      }
    })
    const cur = combat.combatant
    return {
      gm, started, round: combat.round, rows,
      current: started && cur ? { name: cur.hidden && !gm ? '???' : cur.name } : null,
      myTurn: started && !!cur?.isOwner && !gm,
      selected: (canvas?.tokens?.controlled ?? []).filter(t => t.actor && !combat.combatants.some(c => c.tokenId === t.id)).length,
      otherScene: combat.scene && scene && combat.scene.id !== scene.id ? combat.scene.name : '',
    }
  }

  // ── Дії ────────────────────────────────────────────────────────────────────
  /** Почати бій: виділені токени, а якщо нічого не виділено — усі на сцені */
  static async #start() {
    if (!game.user.isGM) return
    const scene = canvas?.scene
    if (!scene) return ui.notifications.warn('Спершу відкрий сцену')
    let tokens = (canvas.tokens?.controlled ?? []).filter(t => t.actor)
    if (!tokens.length) tokens = canvas.tokens.placeables.filter(t => t.actor)
    if (!tokens.length) return ui.notifications.warn('На сцені немає токенів для бою')
    const combat = (game.combat?.scene?.id === scene.id ? game.combat : null)
      ?? await getDocumentClass('Combat').create({ scene: scene.id, active: true })
    await addTokens(combat, tokens)
    if (!combat.started) await combat.startCombat()
  }
  static async #add() {
    const combat = this.combat
    if (!game.user.isGM || !combat) return
    const tokens = (canvas.tokens?.controlled ?? []).filter(t => t.actor)
    if (!tokens.length) return ui.notifications.warn('Виділи токени, яких додати до бою')
    const n = await addTokens(combat, tokens)
    if (!n) ui.notifications.info('Ці токени вже в бою')
  }
  static #end() { if (game.user.isGM) this.combat?.endCombat() }
  static #nextTurn() { const c = this.combat; if (c && (game.user.isGM || c.combatant?.isOwner)) c.nextTurn() }
  static #prevTurn() { if (game.user.isGM) this.combat?.previousTurn() }
  static #nextRound() { if (game.user.isGM) this.combat?.nextRound() }
  static #prevRound() { if (game.user.isGM) this.combat?.previousRound() }
  static #remove(ev, el) { if (game.user.isGM) this.#row(el)?.delete() }
  static async #defeated(ev, el) {
    const c = this.#row(el)
    if (!game.user.isGM || !c) return
    const v = !c.defeated
    await c.update({ defeated: v })
    await c.actor?.toggleStatusEffect?.('dead', { active: v, overlay: true })
  }
  static #hide(ev, el) { const c = this.#row(el); if (game.user.isGM && c) c.update({ hidden: !c.hidden }) }
  static #pan(ev, el) {
    const t = this.#row(el)?.token?.object
    if (!t) return
    if (t.isOwner) t.control({ releaseOthers: !ev.shiftKey })
    canvas.animatePan({ x: t.center.x, y: t.center.y, duration: 250 })
  }
  static #sheet(ev, el) { const a = this.#row(el)?.actor; if (a?.isOwner || game.user.isGM) a.sheet.render(true) }
  /** Ініціатива знову з листів (якщо змінились характеристики чи бонуси) */
  static async #resetIni() {
    const combat = this.combat
    if (!game.user.isGM || !combat) return
    await combat.updateEmbeddedDocuments('Combatant', combat.combatants.map(c => ({ _id: c.id, initiative: initiativeOf(c.actor) })))
    ui.notifications.info('Ініціативу перераховано з листів')
  }
  #row(el) { return this.combat?.combatants.get(el.closest('[data-combatant-id]')?.dataset.combatantId) ?? null }
}

/** Додати токени до бою з ініціативою з листа (без кидків і повідомлень у чат) */
async function addTokens(combat, tokens) {
  const have = new Set(combat.combatants.map(c => c.tokenId))
  const data = tokens.filter(t => !have.has(t.id)).map(t => ({
    tokenId: t.id, sceneId: t.scene?.id ?? t.document.parent?.id, actorId: t.actor?.id,
    hidden: t.document.hidden, initiative: initiativeOf(t.actor),
  }))
  if (data.length) await combat.createEmbeddedDocuments('Combatant', data)
  return data.length
}

export function registerCombatPanel() {
  game.settings.register('god', 'combatPanelAuto', {
    name: 'Панель бою відкривається сама', hint: 'Коли майстер починає бій, у всіх відкривається панель G.O.D. з порядком ходів і раундом.',
    scope: 'client', config: true, type: Boolean, default: true,
  })
  game.keybindings.register('god', 'combatPanel', {
    name: 'Панель бою G.O.D.', hint: 'Порядок ходів, раунд, початок і кінець бою',
    editable: [{ key: 'KeyB', modifiers: ['Shift'] }],
    onDown: () => { GodCombatPanel.toggle(); return true },
  })

  // Будь-який спосіб додати учасника (і вбудований трекер) — ініціатива з листа, без кидка
  Hooks.on('preCreateCombatant', (c, data) => {
    if (data.initiative !== undefined && data.initiative !== null) return
    try { c.updateSource({ initiative: initiativeOf(c.actor ?? game.actors.get(data.actorId)) }) } catch {}
  })

  // Кнопка на панелі інструментів токенів (ліворуч)
  Hooks.on('getSceneControlButtons', controls => {
    const tool = { name: 'godCombat', title: 'Бій G.O.D. (Shift+B)', icon: 'fa-solid fa-swords', order: 99, button: true, visible: true,
      onChange: () => GodCombatPanel.toggle(), onClick: () => GodCombatPanel.toggle() }
    const tokens = controls?.tokens ?? (Array.isArray(controls) ? controls.find(c => c.name === 'token') : null)
    if (!tokens) return
    if (Array.isArray(tokens.tools)) tokens.tools.push(tool)
    else if (tokens.tools) tokens.tools.godCombat = tool
  })

  let timer = null
  const later = () => { clearTimeout(timer); timer = setTimeout(() => GodCombatPanel.refresh(), 40) }
  for (const ev of ['createCombat', 'deleteCombat', 'createCombatant', 'updateCombatant', 'deleteCombatant', 'controlToken', 'canvasReady']) Hooks.on(ev, later)
  Hooks.on('updateActor', actor => { if (game.combat?.combatants.some(c => c.actor === actor || c.actorId === actor.id)) later() })

  Hooks.on('updateCombat', (combat, changed) => {
    later()
    if (combat !== (game.combats?.viewed ?? game.combat)) return
    // бій щойно почався — відкрити панель усім
    if (changed.round === 1 && (changed.turn === 0 || changed.turn === undefined) && game.settings.get('god', 'combatPanelAuto')) GodCombatPanel.open()
    if ('round' in changed && changed.round > 1) ui.notifications.info(`Раунд ${combat.round}`)
    if (('turn' in changed || 'round' in changed) && combat.started) {
      const c = combat.combatant
      if (c?.isOwner && !game.user.isGM) ui.notifications.info(`Твій хід: ${esc(c.name)}`)
    }
  })
  Hooks.on('deleteCombat', () => { if (!game.combat) setTimeout(() => GodCombatPanel.refresh(), 60) })
}
