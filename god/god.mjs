/**
 * G.O.D. — ігрова система для Foundry VTT (v13–v14).
 * Точка входу: реєстрація моделей даних, документів, листів і хелперів.
 */
import { GOD, defaultIcon, ACTOR_ICONS, STATUS_EFFECTS } from './module/config.mjs'
import { GodActiveEffect } from './module/documents/active-effect.mjs'
import { CharacterData, NpcData } from './module/data/actor.mjs'
import { WeaponData, ArmorData, GearData, SpellData, AbilityData, TraitData } from './module/data/item.mjs'
import { GodActor } from './module/documents/actor.mjs'
import { GodItem } from './module/documents/item.mjs'
import { GodCharacterSheet, GodNpcSheet } from './module/sheets/actor-sheets.mjs'
import { GodItemSheet } from './module/sheets/item-sheet.mjs'
import * as R from './module/rules.mjs'
import * as Dice from './module/dice/rolls.mjs'
import * as FX from './module/fx.mjs'
import { GodDiceTray } from './module/apps/dice-tray.mjs'
import * as API from './module/api.mjs'
import { GodHud } from './module/apps/hud.mjs'
import { registerPinSettings, Pins } from './module/apps/pins.mjs'
import { registerMigrationSettings, registerMigrationMenu, migrateWorld, migrateWorldForce } from './module/migration.mjs'
import { registerRotationHandle } from './module/rotate-handle.mjs'
import { registerResourceSync } from './module/resource-sync.mjs'
import { GodQuickbar, registerQuickbarSettings, syncNativeHotbar, replacesHotbar } from './module/apps/quickbar.mjs'

Hooks.once('init', () => {
  console.log('G.O.D. | ініціалізація системи')
  CONFIG.GOD = GOD

  CONFIG.Actor.documentClass = GodActor
  CONFIG.Item.documentClass = GodItem
  CONFIG.ActiveEffect.documentClass = GodActiveEffect
  // Ефекти предметів не копіюються на актора, а діють з самого предмета (сучасний режим Foundry)
  CONFIG.ActiveEffect.legacyTransferral = false

  // Стани на токенах — з іконками системи; "dead" лишається спеціальним станом поразки
  CONFIG.statusEffects = STATUS_EFFECTS

  // Шрифти системи в редакторі журналів і малюнках (файли підключені через CSS)
  CONFIG.fontDefinitions['Montserrat'] = { editor: true, fonts: [] }
  CONFIG.fontDefinitions['Rubik'] = { editor: true, fonts: [] }
  Object.assign(CONFIG.Actor.dataModels, { character: CharacterData, npc: NpcData })
  Object.assign(CONFIG.Item.dataModels, { weapon: WeaponData, armor: ArmorData, gear: GearData, spell: SpellData, ability: AbilityData, trait: TraitData })

  // Смуги токенів: ресурси з value/max
  const bars = ['resources.hp', 'resources.mp', 'resources.ed', 'resources.mt', 'resources.pr', 'resources.mr']
  CONFIG.Actor.trackableAttributes = {
    character: { bar: bars, value: ['derived.dodge', 'derived.speed', 'derived.initiative'] },
    npc: { bar: ['resources.hp', 'resources.mp', 'resources.ed', 'resources.pr', 'resources.mr'], value: ['derived.dodge'] },
  }

  // Ініціатива G.O.D. = ⌊поточна витривалість / 100⌋ (як на сайті); у НІП — власне поле
  // Рівна ініціатива — першість визначає чистий 1d20 (сота частка числа)
  CONFIG.Combat.initiative = { formula: '@derived.initiative + 1d20 / 100', decimals: 2 }

  const Actors = foundry.documents.collections?.Actors ?? globalThis.Actors
  const Items = foundry.documents.collections?.Items ?? globalThis.Items
  Actors.registerSheet('god', GodCharacterSheet, { types: ['character'], makeDefault: true, label: 'G.O.D. — Персонаж' })
  Actors.registerSheet('god', GodNpcSheet, { types: ['npc'], makeDefault: true, label: 'G.O.D. — НІП' })
  Items.registerSheet('god', GodItemSheet, { makeDefault: true, label: 'G.O.D. — Предмет' })

  // Спільний рядок предмета (partial-block)
  const hb = foundry.applications.handlebars ?? globalThis
  hb.loadTemplates({
    'god-row': 'systems/god/templates/partials/row.hbs',
    'god-skill-controls': 'systems/god/templates/partials/skill-controls.hbs',
    'god-res': 'systems/god/templates/partials/res.hbs',
    'god-effect-card': 'systems/god/templates/partials/effect-card.hbs',
    'god-weapon-card': 'systems/god/templates/partials/weapon-card.hbs',
  })

  registerPinSettings()
  registerMigrationSettings()
  registerMigrationMenu()
  registerRotationHandle()
  game.settings.register('god', 'animations', {
    name: 'Анімації ударів і магії',
    hint: 'Програються в момент нанесення урону. Потрібні модулі Sequencer і JB2A (безкоштовний). Без них нічого не відбувається.',
    scope: 'world', config: true, type: String, default: 'all',
    choices: { all: 'Увімкнено', off: 'Вимкнено' },
  })
  registerQuickbarSettings()
  game.settings.register('god', 'combatStamina', {
    name: 'Витривалість за бій', hint: 'Після бою списувати 10 ВС за кожен раунд (якщо бій дійшов до 2-го раунду), як у Combat manual.',
    scope: 'world', config: true, type: Boolean, default: true,
  })
  game.settings.register('god', 'stanceReflexes', {
    name: 'Стійки з рівня Бойових рефлексів',
    hint: 'Бойові стійки — підвид маневрів: без Бойових рефлексів герою доступні лише атака, втеча, пересування й крик. 0 — без обмеження.',
    scope: 'world', config: true, type: Number, default: 1, range: { min: 0, max: 5, step: 1 },
  })
  syncNativeHotbar()
  registerResourceSync()

  game.god = {
    useItem, ...API, rules: R, migrate: () => migrateWorldForce(),
    diceTray: actor => GodDiceTray.open(actor),
    hud: actor => GodHud.open(actor ?? defaultActor()),
    quickbar: () => GodQuickbar.refresh(),
    guide: openGuide,
  }

  // Shift+Q — показати/сховати швидку панель
  game.keybindings.register('god', 'quickbar', {
    name: 'Швидка панель G.O.D.',
    hint: 'Показати або сховати смужку швидкого доступу внизу екрана',
    editable: [{ key: 'KeyQ', modifiers: ['Shift'] }],
    onDown: () => { game.settings.set('god', 'quickbar', !game.settings.get('god', 'quickbar')); return true },
  })

  // Shift+C — панель персонажа (обраний токен або свій персонаж)
  game.keybindings.register('god', 'hud', {
    name: 'Панель персонажа G.O.D.',
    hint: 'Компактна панель: ресурси, ШУ, стійка, атаки, заклинання',
    editable: [{ key: 'KeyC', modifiers: ['Shift'] }],
    onDown: () => { game.god.hud(); return true },
  })

  // 1–0 — слоти швидкої панелі, коли вона замінює хотбар (інакше клавіші лишаються за Foundry)
  for (let n = 1; n <= 10; n++) {
    const key = `Digit${n % 10}`
    game.keybindings.register('god', `quickSlot${n}`, {
      name: `Швидка панель: слот ${n}`,
      editable: [{ key }],
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
      onDown: () => replacesHotbar() && GodQuickbar.instance.rendered ? GodQuickbar.instance.activateSlot(n - 1) || true : false,
    })
  }

  // Shift+R — панель кидків (змінюється в налаштуваннях клавіш Foundry)
  game.keybindings.register('god', 'diceTray', {
    name: 'Панель кидків G.O.D.',
    hint: 'Відкрити панель: характеристики, вміння, лоток кубів',
    editable: [{ key: 'KeyR', modifiers: ['Shift'] }],
    onDown: () => { GodDiceTray.open(); return true },
  })

  Handlebars.registerHelper('god-signed', n => (Number(n) >= 0 ? `+${n}` : `${n}`))
  Handlebars.registerHelper('god-eq', (a, b) => a === b)
  Handlebars.registerHelper('god-or', (...a) => a.slice(0, -1).some(Boolean))
  if (!Handlebars.helpers.and) Handlebars.registerHelper('and', (...a) => a.slice(0, -1).every(Boolean))
  Handlebars.registerHelper('god-lte', (a, b) => Number(a) <= Number(b))
  Handlebars.registerHelper('god-range', n => Array.from({ length: Number(n) || 0 }, (_, i) => i + 1))
  if (!Handlebars.helpers.or) Handlebars.registerHelper('or', (...a) => a.slice(0, -1).some(Boolean))
  // Секції з плаского списку: ("key", "Назва", "іконка", ...) → [{key, label, icon}]
  Handlebars.registerHelper('god-array', (...a) => {
    const args = a.slice(0, -1), out = []
    for (let i = 0; i < args.length; i += 3) out.push({ key: args[i], label: args[i + 1], icon: args[i + 2] })
    return out
  })
})

// Типові іконки для нових предметів — за категорією, слотом чи школою
Hooks.on('preCreateItem', (item, data, options) => {
  if (!data.img || data.img === 'icons/svg/item-bag.svg') item.updateSource({ img: defaultIcon(item.type, item.system) })
  // Однакові речі складаються в стос: ще одне «Зілля лікування» → кількість +1, а не новий рядок
  const actor = item.parent
  if (!(actor instanceof Actor) || item.type !== 'gear' || options.godNoStack || options.keepId) return
  const same = actor.items.find(i => i.type === 'gear' && i.name === item.name && i.img === item.img && !i.system.equipped)
  if (!same) return
  same.update({ 'system.quantity': same.system.quantity + Math.max(1, item.system.quantity) })
  ui.notifications.info(`«${item.name}»: +${Math.max(1, item.system.quantity)} до наявних`)
  return false
})

// Нові персонажі: токен прив'язаний до актора і показує HP/OM
Hooks.on('preCreateActor', (actor, data) => {
  // Картинка — стандартна для Foundry (силует), токен = портрет, поки не задано окремий.
  // Токен: рівно в клітинку, без власного масштабу; ім'я — при наведенні.
  const n = actor.type === 'npc' ? (CONFIG.GOD.TOKEN_SIZES[actor.system.size] ?? 1) : 1
  const tok = { 'prototypeToken.displayName': CONST.TOKEN_DISPLAY_MODES.HOVER }
  if (foundry.utils.getProperty(data, 'prototypeToken.width') === undefined) Object.assign(tok, { 'prototypeToken.width': n, 'prototypeToken.height': n })
  if (data.img && !foundry.utils.getProperty(data, 'prototypeToken.texture.src')) tok['prototypeToken.texture.src'] = data.img
  actor.updateSource(tok)
  if (actor.type === 'npc') {
    // НІП: ресурси повні, токен ворожий і не прив'язаний (кожен на сцені — окремий екземпляр)
    const fill = {}
    for (const k of ['hp', 'mp', 'ed']) {
      if (foundry.utils.getProperty(data, `system.resources.${k}.value`) === undefined) fill[`system.resources.${k}.value`] = actor.system.resources[k].max
    }
    for (const k of ['pr', 'mr']) {
      if (foundry.utils.getProperty(data, `system.resources.${k}.value`) === undefined) fill[`system.resources.${k}.value`] = actor.system.resources[k].base
    }
    actor.updateSource({
      ...fill,
      'prototypeToken.bar1.attribute': 'resources.hp',
      'prototypeToken.bar2.attribute': 'resources.pr',
      'prototypeToken.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
      'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.HOSTILE,
    })
    return
  }
  if (actor.type !== 'character') return
  // Ресурси стартують повними: value = авто-максимум від початкових характеристик
  const fill = {}
  for (const [k, cfg] of Object.entries(CONFIG.GOD.RESOURCES)) {
    if (foundry.utils.getProperty(data, `system.resources.${k}.value`) !== undefined) continue
    const stat = foundry.utils.getProperty(data, `system.stats.${cfg.stat}.value`) ?? actor.system.stats[cfg.stat].value
    fill[`system.resources.${k}.value`] = Math.round(stat * cfg.mult)
  }
  actor.updateSource({
    ...fill,
    'prototypeToken.actorLink': true,
    'prototypeToken.bar1.attribute': 'resources.hp',
    'prototypeToken.bar2.attribute': 'resources.mp',
    'prototypeToken.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER,
    'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.FRIENDLY,
  })
})

// ── Хотбар: перетягни зброю/заклинання на панель — отримаєш макрос ──────────
async function useItem(uuid) {
  const item = await fromUuid(uuid)
  if (!item) return ui.notifications.warn('Предмет не знайдено — можливо, його видалили')
  return item.use()
}
Hooks.on('hotbarDrop', (bar, data, slot) => {
  if (data.type !== 'Item' || !data.uuid) return
  ;(async () => {
    const item = await fromUuid(data.uuid)
    if (!item?.parent) return ui.notifications.warn('Макрос можна створити лише для предмета персонажа')
    const command = `game.god.useItem("${data.uuid}")`
    let macro = game.macros.find(m => m.command === command && m.author?.id === game.user.id)
    macro ??= await Macro.create({ name: item.name, type: 'script', img: item.img, command, flags: { god: { itemMacro: true } } })
    game.user.assignHotbarMacro(macro, slot)
  })()
  return false
})

// ── Чат: кнопки «застосувати урон» на картках атак і заклинань ──────────────
Hooks.on('renderChatMessageHTML', (message, html) => {
  // Вдача: кидок перекинуто — стара картка більше не діє
  const card = html.querySelector('.god-card')
  if (card && message.getFlag('god', 'lucky')) {
    card.classList.add('god-lucky-old')
    card.insertAdjacentHTML('afterbegin', '<div class="god-luck-tag old"><i class="fa-solid fa-clover"></i> Перекинуто вдачею — дивись наступну картку</div>')
    for (const b of card.querySelectorAll('button')) { b.disabled = true; b.dataset.godDead = '1' }
  } else if (card && Dice.canLuck(message)) {
    const actor = Dice.canLuck(message)
    card.insertAdjacentHTML('beforeend', `<div class="god-apply god-apply-one god-luck-row"><button type="button" data-god-luck="1"
      data-tooltip="Витратити 1 вдачу: перекинути з перевагою, без від'ємних модифікаторів (є ${Dice.luckOf(actor)})">
      <i class="fa-solid fa-clover"></i> Вдача <small>${Dice.luckOf(actor)}</small></button></div>`)
    card.querySelector('[data-god-luck]').addEventListener('click', async ev => {
      ev.preventDefault()
      ev.currentTarget.disabled = true
      Dice.luckReroll(message, markLucky)
    })
  }
  // «Кинути урон» — окремий кидок після влучання, лише раз
  for (const btn of html.querySelectorAll('[data-god-damage]')) {
    if (btn.dataset.godDead) continue
    if (message.getFlag('god', 'damageRolled')) {
      btn.disabled = true; btn.classList.add('applied')
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Урон кинуто'
      continue
    }
    btn.addEventListener('click', async ev => {
      ev.preventDefault()
      btn.disabled = true
      try { await Dice.rollAttackDamage(message, markFlag) } finally { if (!message.getFlag('god', 'damageRolled')) btn.disabled = false }
    })
  }
  // «Спробувати ще раз» — повторне сотворення того ж заклинання
  for (const btn of html.querySelectorAll('[data-god-recast]')) {
    btn.addEventListener('click', async ev => {
      ev.preventDefault()
      const spell = await fromUuid(btn.dataset.godRecast)
      if (!spell?.isOwner) return ui.notifications.warn('Немає доступу до цього заклинання')
      spell.use()
    })
  }
  // Перевірки після удару і спаскидки — кидає власник героя або майстер
  const ownedActor = async uuid => {
    const a = await fromUuid(uuid)
    const actor = a?.actor ?? a
    if (!actor?.isOwner) { ui.notifications.warn('Кидати може власник персонажа або майстер'); return null }
    return actor
  }
  html.querySelector('[data-god-guide]')?.addEventListener('click', ev => { ev.preventDefault(); openGuide() })
  // Кнопки перевірок одноразові для всіх: після кидка гаснуть (прапорець на повідомленні),
  // майстер може повторити Shift+кліком.
  const onceButtons = [...html.querySelectorAll('[data-god-check], [data-god-death]')]
  const usedOnce = (btn, ev) => btn.classList.contains('applied') && !(game.user.isGM && ev.shiftKey)
  const dimUsed = btn => {
    btn.classList.add('applied')
    if (!game.user.isGM) btn.disabled = true
    btn.dataset.tooltip = game.user.isGM ? 'Уже кинуто. Shift+клік — кинути ще раз' : 'Уже кинуто'
  }
  const markUsed = btn => { dimUsed(btn); markFlag(message, 'used', { ...(message.getFlag('god', 'used') ?? {}), [onceButtons.indexOf(btn)]: true }) }
  const used = message.getFlag('god', 'used') ?? {}
  onceButtons.forEach((btn, i) => { if (used[i]) dimUsed(btn) })
  for (const btn of html.querySelectorAll('[data-god-check]')) {
    btn.addEventListener('click', async ev => {
      ev.preventDefault()
      const [uuid, stat, dc] = btn.dataset.godCheck.split('|')
      const actor = await ownedActor(uuid)
      if (!actor || usedOnce(btn, ev)) return
      const why = btn.textContent.trim()
      if (await Dice.thresholdCheck(actor, stat, Number(dc), why)) markUsed(btn)
    })
  }
  for (const btn of html.querySelectorAll('[data-god-death]')) {
    btn.addEventListener('click', async ev => {
      ev.preventDefault()
      const [uuid, kind] = btn.dataset.godDeath.split('|')
      const actor = await ownedActor(uuid)
      if (!actor || usedOnce(btn, ev)) return
      if (await (kind === 'coin' ? Dice.deathCoin(actor) : Dice.deathSave(actor))) markUsed(btn)
    })
  }

  // «Урон» — цілі атаки (або обраним токенам у старих картках): MR → PR → HP.
  // Натиснути можна один раз: після застосування кнопка гасне в усіх (прапорець на повідомленні).
  // Майстер може повторити Shift+кліком.
  const applied = message.getFlag('god', 'applied') ?? {}
  html.querySelectorAll('[data-god-apply]').forEach((btn, i) => {
    if (btn.dataset.godDead) return   // картку перекинуто вдачею
    const key = String(i)
    const done = applied[key]
    const defBtn = btn.parentElement?.querySelector('[data-god-defend]')
    if (done || pendingApply.has(`${message.id}:${key}`)) { lockApplyButton(btn, done); defBtn?.remove() }
    // Маневр «Захист»: власник цілі кидає захист, і застосовується лише те, що пройшло
    defBtn?.addEventListener('click', async ev => {
      ev.preventDefault()
      const doc = fromUuidSync(btn.dataset.target)
      const actor = doc?.actor ?? (doc instanceof Actor ? doc : null)
      if (!actor) return ui.notifications.warn('Ціль більше не існує')
      if (!actor.isOwner) return ui.notifications.warn(`Захищатись може лише власник «${actor.name}» або майстер`)
      const pk = `${message.id}:${key}`
      if (pendingApply.has(pk) || message.getFlag('god', `applied.${key}`)) return
      const amount = (Number(btn.dataset.phys) || 0) + (Number(btn.dataset.mag) || 0)
      const left = await Dice.defend(actor, amount, defBtn.dataset.kind)
      if (left === null || left === undefined) return
      pendingApply.add(pk)
      lockApplyButton(btn, null)
      try {
        const out = await API.dealDamage(actor, btn.dataset.pierce ? { amount: left, ignorePr: true } : left)
        if (left > 0) FX.playDamage(message.getFlag('god', 'fx'), doc, { hpLoss: out?.toHp ?? 1 })
        await markApplied(message, key, { by: game.user.id, text: `Захист — ${API.damageSummary(actor.name, out)}` })
      } catch (err) { console.error('G.O.D. | захист', err); pendingApply.delete(pk); unlockApplyButton(btn) }
    })
    btn.addEventListener('click', async ev => {
      ev.preventDefault()
      const again = game.user.isGM && ev.shiftKey
      if ((btn.disabled || message.getFlag('god', `applied.${key}`)) && !again) return
      const pk = `${message.id}:${key}`
      if (pendingApply.has(pk) && !again) return
      pendingApply.add(pk)
      lockApplyButton(btn, null)
      const sum = (Number(btn.dataset.phys) || 0) + (Number(btn.dataset.mag) || 0) + (Number(btn.dataset.amount) || 0)
      const amount = btn.dataset.pierce ? { amount: sum, ignorePr: true } : sum
      try {
        if (btn.dataset.target) {
          const ok = await applyToTarget(btn.dataset.target, amount, { messageId: message.id, key })
          if (!ok) { pendingApply.delete(pk); unlockApplyButton(btn) }
          else FX.playDamage(message.getFlag('god', 'fx'), fromUuidSync(btn.dataset.target), { hpLoss: typeof ok === 'object' ? (ok.toHp ?? 1) : 1 })
          return
        }
        const tokens = (canvas.tokens?.controlled ?? []).filter(t => t.actor?.isOwner)
        if (!tokens.length) {
          pendingApply.delete(pk); unlockApplyButton(btn)
          return ui.notifications.warn('Обери токен(и), яким застосувати урон')
        }
        const lines = []
        for (const t of tokens) {
          const out = await API.dealDamage(t.actor, amount)
          FX.playDamage(message.getFlag('god', 'fx'), t.document, { hpLoss: out?.toHp ?? 1 })
          lines.push(API.damageSummary(t.actor.name, out))
        }
        await markApplied(message, key, { by: game.user.id, text: lines.join('; ') })
      } catch (err) {
        console.error('G.O.D. | урон не застосовано', err)
        pendingApply.delete(pk); unlockApplyButton(btn)
      }
    })
  })
})

// ── Числові поля: клік по «0» — нуль зникає, по іншому числу — воно виділяється ──
// Набираєш одразу нове значення, без стирання. Порожнє поле при виході повертає «0».
const NUMERIC_SCOPE = '.god, .god-dialog, .god-tray, .god-quickbar'
document.addEventListener('focusin', ev => {
  const el = ev.target
  if (!(el instanceof HTMLInputElement) || el.readOnly || el.disabled || !el.closest(NUMERIC_SCOPE)) return
  const numeric = el.type === 'number' || el.dataset.delta !== undefined || el.inputMode === 'numeric'
  if (!numeric) return
  if (el.value.trim() === '0') {
    el.dataset.godZero = '1'
    if (!el.placeholder) { el.placeholder = '0'; el.dataset.godPh = '1' }
    el.value = ''
  } else if (el.dataset.delta !== undefined && el.type === 'text') {
    // Поле з математикою: курсор у кінець — дописуєш «-100», «+5», «*2» до наявного числа, без стирання
    const end = el.value.length
    requestAnimationFrame(() => { try { el.setSelectionRange(end, end) } catch {} })
    el.addEventListener('mouseup', e => e.preventDefault(), { once: true })
  } else {
    el.select()
    // Клік мишею інакше одразу скине виділення в курсор
    el.addEventListener('mouseup', e => e.preventDefault(), { once: true })
  }
})
document.addEventListener('focusout', ev => {
  const el = ev.target
  if (!(el instanceof HTMLInputElement) || !el.dataset.godZero) return
  if (el.value.trim() === '') el.value = '0'
  delete el.dataset.godZero
  if (el.dataset.godPh) { el.placeholder = ''; delete el.dataset.godPh }
})

/** Довідник із компендіуму системи: як користуватись листом і правила коротко */
async function openGuide(pageName) {
  const pack = game.packs.get('god.rules')
  const entry = (await pack?.getDocuments())?.[0]
  if (!entry) return ui.notifications.warn('Довідник G.O.D. не знайдено в компендіумах')
  const page = pageName ? entry.pages.getName(pageName) : null
  return entry.sheet.render(true, page ? { pageId: page.id } : {})
}

/** Перший вхід у світ: коротке вітання лише цьому користувачу (один раз) */
async function welcome() {
  if (game.user.getFlag('god', 'welcomed')) return
  await game.user.setFlag('god', 'welcomed', true)
  const gm = game.user.isGM ? '<li><b>Майстру:</b> предмети й вороги-зразки — у компендіумі «Арсенал G.O.D.»; макроси (видати досвід, завдати урону) — у «Макроси G.O.D.».</li>' : ''
  ChatMessage.create({
    whisper: [game.user.id], speaker: { alias: 'G.O.D.' },
    content: `<div class="god-card"><header class="god-card-head"><div><h3>Вітаємо в G.O.D.</h3><span>п'ять речей, щоб почати</span></div></header>
      <ul class="god-list-plain god-welcome">
        <li><b>Замок</b> у кутку портрета вмикає редагування листа. Без нього лист показує значення й кнопки кидків.</li>
        <li><b>Клік по характеристиці, вмінню чи кнопці «Атака»</b> — кидок. Усі бонуси й штрафи підставляються самі й підписані у вікні кидка.</li>
        <li><b>Атака:</b> обери ціль → кидок попадання → якщо влучив, на картці з'явиться «Кинути урон» → «Урон» застосовує його до цілі.</li>
        <li><b>Числа можна рахувати:</b> у HP, грошах, досвіді допиши <code>-25</code> чи <code>+10</code> і натисни Enter.</li>
        <li><b>Shift+R</b> — панель кидків, <b>Shift+Q</b> — швидка панель унизу екрана.</li>${gm}
      </ul>
      <div class="god-apply god-apply-one"><button type="button" data-god-guide><i class="fa-solid fa-circle-question"></i> Відкрити довідник</button></div></div>`,
  })
}

function defaultActor() {
  return canvas.tokens?.controlled[0]?.actor ?? game.user.character ?? game.actors.find(a => a.type === 'character' && a.isOwner)
}

// ── Відкриті панелі стежать за персонажем: будь-яка зміна — оновлення ───────
function refreshPanels(actor) {
  const apps = foundry.applications.instances
  if (!apps) return
  const tray = apps.get('god-dice-tray')
  if (tray?.rendered) tray.render()
  if (!actor) return
  const hud = apps.get(`god-hud-${actor.id}`)
  if (hud?.rendered) hud.render()
}
// Швидка панель — лише коли змінився саме її персонаж (або обраний токен)
let qbTimer = null
function refreshQuickbar(actor) {
  if (!game.ready || !game.settings.get('god', 'quickbar')) return
  const qb = GodQuickbar.instance
  if (actor && qb.actor && actor !== qb.actor && actor.uuid !== qb.actor.uuid) return
  clearTimeout(qbTimer)
  qbTimer = setTimeout(() => qb.render({ force: true }), 30)
}
const actorOf = doc => doc?.parent instanceof Actor ? doc.parent : doc?.parent?.parent instanceof Actor ? doc.parent.parent : null
Hooks.on('updateActor', actor => { refreshPanels(actor); refreshQuickbar(actor) })
Hooks.on('controlToken', () => { refreshPanels(null); refreshQuickbar(null) })
Hooks.on('canvasReady', () => refreshQuickbar(null))
// Режим без персонажа показує хотбар користувача — стежимо за ним і за макросами
Hooks.on('updateUser', (user, changes) => { if (user.isSelf && 'hotbar' in changes) refreshQuickbar(null) })
for (const ev of ['updateMacro', 'deleteMacro']) Hooks.on(ev, () => refreshQuickbar(null))
for (const ev of ['createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
  Hooks.on(ev, doc => { const a = actorOf(doc); if (a) { refreshPanels(a); refreshQuickbar(a) } })
}

// ── Старт світу: міграція і відновлення закріплених вікон ───────────────────
// Витривалість на нулі — герой непритомніє (пише лише той, хто змінив значення)
Hooks.on('updateActor', (actor, changes, options, userId) => {
  if (userId !== game.user.id || options.godMigration) return
  // НІП не непритомніють і не кидають спаскидків: HP ≤ 0 — мертвий (і навпаки, вилікували — живий)
  if (actor.type === 'npc') {
    const hp = foundry.utils.getProperty(changes, 'system.resources.hp.value')
    if (hp === undefined) return
    const dead = actor.statuses?.has('dead')
    if (hp <= 0 && !dead) actor.toggleStatusEffect?.('dead', { active: true, overlay: true })
    if (hp > 0 && dead) actor.toggleStatusEffect?.('dead', { active: false })
    return
  }
  if (actor.type !== 'character') return
  const ed = foundry.utils.getProperty(changes, 'system.resources.ed.value')
  if (ed !== undefined && ed <= 0 && (actor.system.resources.ed?.max ?? 0) > 0 && !actor.statuses?.has('unconscious')) {
    actor.toggleStatusEffect?.('unconscious', { active: true })
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="god-card"><p><b>${foundry.utils.escapeHTML?.(actor.name) ?? actor.name}</b> знесилений: витривалість ${ed} — втрата свідомості.</p></div>` })
  }
})

// Початок бою: хто має 2 повні ходи (ініціатива вдвічі вища за середню ворожої пачки)
// і хто без Бойових рефлексів пропускає перший раунд
Hooks.on('combatStart', async combat => {
  if (game.user !== game.users.activeGM) return
  const side = c => c.token?.disposition ?? c.actor?.prototypeToken?.disposition ?? 0
  const ini = c => c.actor?.system?.derived?.initiative ?? 0
  const fighters = combat.combatants.filter(c => c.actor && side(c) !== 0)
  const doubles = [], idle = []
  for (const c of fighters) {
    const foes = fighters.filter(o => side(o) !== side(c) && side(o) !== 0).map(ini)
    const two = R.doubleTurn(ini(c), foes)
    if (two !== !!c.getFlag('god', 'doubleTurn')) await c.setFlag('god', 'doubleTurn', two)
    if (two) doubles.push(c.name)
    if (c.actor.type === 'character' && !(c.actor.system.skill?.('Бойові_рефлекси') > 0)) idle.push(c.name)
  }
  const e = n => foundry.utils.escapeHTML?.(n) ?? n
  const parts = []
  if (doubles.length) parts.push(`<p><b>2 повні ходи на раунд:</b> ${doubles.map(e).join(', ')}</p>`)
  if (idle.length) parts.push(`<p><b>Пропускають перший раунд</b> (немає Бойових рефлексів), далі ШАНС пропуску кожного ходу: ${idle.map(e).join(', ')}</p>`)
  if (parts.length) ChatMessage.create({ content: `<div class="god-card"><header class="god-card-head"><div><h3>Бій почався</h3><span>ініціатива</span></div></header>${parts.join('')}</div>` })
})

// Позначка 2ПХ у трекері бою
Hooks.on('renderCombatTracker', (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0]
  const combat = app.viewed ?? game.combat
  if (!root || !combat) return
  for (const c of combat.combatants) {
    if (!c.getFlag('god', 'doubleTurn')) continue
    const name = root.querySelector(`[data-combatant-id="${c.id}"] .token-name, [data-combatant-id="${c.id}"] h4`)
    if (name && !name.querySelector('.god-2ph')) name.insertAdjacentHTML('beforeend', ' <span class="god-2ph" data-tooltip="2 повні ходи на раунд">2ПХ</span>')
  }
})

// Кожен раунд бою коштує 10 ВС (списується після бою, якщо бій дійшов до 2-го раунду)
Hooks.on('deleteCombat', async combat => {
  if (game.user !== game.users.activeGM || !game.settings.get('god', 'combatStamina')) return
  const cost = R.combatStamina(combat.round)
  if (!cost) return
  const seen = new Set(), lines = []
  for (const c of combat.combatants) {
    const a = c.actor
    if (!a || seen.has(a.uuid) || !(a.system.resources?.ed?.max > 0)) continue
    seen.add(a.uuid)
    const from = a.system.resources.ed.value
    await a.update({ 'system.resources.ed.value': from - cost })
    lines.push(`<li>${foundry.utils.escapeHTML?.(a.name) ?? a.name}: ВС ${from} → ${from - cost}</li>`)
  }
  if (lines.length) ChatMessage.create({ content: `<div class="god-card"><header class="god-card-head"><div><h3>Бій завершено</h3><span>${combat.round} раунд(и) × 10 ВС</span></div></header><ul class="god-list-plain">${lines.join('')}</ul></div>` })
})

/**
 * Урон по цілі: власник застосовує сам, інакше — через активного майстра (сокет системи),
 * тож гравець може натиснути «Урон» по ворогу, а ворог — по гравцю.
 */
async function applyToTarget(uuid, amount, mark) {
  const doc = fromUuidSync(uuid)
  const actor = doc?.actor ?? (doc instanceof Actor ? doc : null)
  if (!actor) { ui.notifications.warn('Ціль більше не існує'); return false }
  if (actor.isOwner) {
    const out = await API.dealDamage(actor, amount)
    await markApplied(game.messages.get(mark.messageId), mark.key, { by: game.user.id, text: API.damageSummary(actor.name, out) })
    return out ?? true
  }
  if (!game.users.activeGM) { ui.notifications.warn('Немає майстра онлайн, щоб застосувати урон'); return false }
  game.socket.emit('system.god', { op: 'damage', uuid, amount, from: game.user.id, ...mark })
  ui.notifications.info(`Урон ${amount?.amount ?? amount} → ${actor.name}: надіслано майстру`)
  // для анімації: оцінка, чи дійде урон до HP (застосує майстер)
  const r = actor.system.resources ?? {}
  try { return R.applyDamage({ hp: r.hp?.value ?? 0, pr: r.pr?.value ?? 0, mr: r.mr?.value ?? 0 }, amount) } catch { return true }
}

/** Ключі кнопок урону, які вже натиснуто на цьому клієнті (до приходу прапорця з сервера) */
const pendingApply = new Set()
function lockApplyButton(btn, done) {
  btn.parentElement?.querySelector('[data-god-defend]')?.remove()
  btn.disabled = true
  btn.classList.add('applied')
  btn.innerHTML = `<i class="fa-solid fa-check"></i> ${done?.text ? foundry.utils.escapeHTML?.(done.text) ?? done.text : 'Застосовано'}`
  btn.dataset.tooltip = game.user.isGM ? 'Урон уже застосовано. Shift+клік — застосувати ще раз' : 'Урон уже застосовано'
  if (game.user.isGM) btn.disabled = false   // майстру лишаємо Shift+клік
}
function unlockApplyButton(btn) {
  btn.disabled = false
  btn.classList.remove('applied')
  const amount = (Number(btn.dataset.phys) || 0) + (Number(btn.dataset.mag) || 0) + (Number(btn.dataset.amount) || 0)
  btn.innerHTML = `<i class="fa-solid fa-burst"></i> Урон ${amount}`
}
/** Позначити кнопку на повідомленні як застосовану — для всіх клієнтів і після перезавантаження */
/** Позначка на картці (перекинуто вдачею / урон уже кинуто) — сам або через майстра */
const MESSAGE_FLAGS = new Set(['lucky', 'damageRolled', 'used'])
async function markFlag(message, key, value = true) {
  if (!MESSAGE_FLAGS.has(key)) return
  if (message.isOwner) return message.setFlag('god', key, value)
  if (game.users.activeGM) game.socket.emit('system.god', { op: 'flag', messageId: message.id, key, value })
}
const markLucky = message => markFlag(message, 'lucky', true)
async function markApplied(message, key, info) {
  if (!message) return
  if (message.isOwner) return message.setFlag('god', `applied.${key}`, info)
  if (game.users.activeGM) game.socket.emit('system.god', { op: 'mark', messageId: message.id, key, info })
}

Hooks.once('ready', async () => {
  game.socket.on('system.god', async msg => {
    if (game.user !== game.users.activeGM) return
    const message = msg?.messageId ? game.messages.get(msg.messageId) : null
    if (msg?.op === 'damage') {
      const doc = fromUuidSync(msg.uuid)
      const actor = doc?.actor ?? (doc instanceof Actor ? doc : null)
      if (!actor || message?.getFlag('god', `applied.${msg.key}`)) return
      const out = await API.dealDamage(actor, typeof msg.amount === 'object' && msg.amount ? { amount: Number(msg.amount.amount) || 0, ignorePr: !!msg.amount.ignorePr } : (Number(msg.amount) || 0))
      if (message) await message.setFlag('god', `applied.${msg.key}`, { by: msg.from, text: API.damageSummary(actor.name, out) })
    } else if (msg?.op === 'mark' && message) {
      await message.setFlag('god', `applied.${msg.key}`, msg.info)
    } else if (msg?.op === 'flag' && message && MESSAGE_FLAGS.has(msg.key)) {
      await message.setFlag('god', msg.key, msg.value ?? true)
    }
  })
  await migrateWorld()
  welcome().catch(err => console.warn('G.O.D. | вітання', err))
  GodQuickbar.refresh()
  for (const [id, pin] of Object.entries(Pins.all())) {
    const position = pin.position
    if (pin.type === 'hud') {
      const actor = game.actors.get(pin.actorId)
      if (actor) GodHud.open(actor, { position }); else Pins.set(id, null)
    } else if (pin.type === 'tray') {
      GodDiceTray.open(game.actors.get(pin.actorId), { position })
    }
  }
})
