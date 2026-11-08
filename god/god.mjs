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
import { GodDiceTray } from './module/apps/dice-tray.mjs'
import * as API from './module/api.mjs'
import { GodHud } from './module/apps/hud.mjs'
import { registerPinSettings, Pins } from './module/apps/pins.mjs'
import { registerMigrationSettings, migrateWorld } from './module/migration.mjs'
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
  CONFIG.Combat.initiative = { formula: '@derived.initiative', decimals: 0 }

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
    'god-weapon-card': 'systems/god/templates/partials/weapon-card.hbs',
  })

  registerPinSettings()
  registerMigrationSettings()
  registerQuickbarSettings()
  syncNativeHotbar()
  registerResourceSync()

  game.god = {
    useItem, ...API, rules: R,
    diceTray: actor => GodDiceTray.open(actor),
    hud: actor => GodHud.open(actor ?? defaultActor()),
    quickbar: () => GodQuickbar.refresh(),
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
  if (!Handlebars.helpers.and) Handlebars.registerHelper('and', (...a) => a.slice(0, -1).every(Boolean))
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
  if (!data.img || data.img === 'icons/svg/mystery-man.svg') actor.updateSource({ img: ACTOR_ICONS[actor.type], 'prototypeToken.texture.src': ACTOR_ICONS[actor.type] })
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
  // «Спробувати ще раз» — повторне сотворення того ж заклинання
  for (const btn of html.querySelectorAll('[data-god-recast]')) {
    btn.addEventListener('click', async ev => {
      ev.preventDefault()
      const spell = await fromUuid(btn.dataset.godRecast)
      if (!spell?.isOwner) return ui.notifications.warn('Немає доступу до цього заклинання')
      spell.use()
    })
  }
  // «Урон» — цілі атаки (або обраним токенам у старих картках): MR → PR → HP.
  // Натиснути можна один раз: після застосування кнопка гасне в усіх (прапорець на повідомленні).
  // Майстер може повторити Shift+кліком.
  const applied = message.getFlag('god', 'applied') ?? {}
  html.querySelectorAll('[data-god-apply]').forEach((btn, i) => {
    const key = String(i)
    const done = applied[key]
    if (done || pendingApply.has(`${message.id}:${key}`)) lockApplyButton(btn, done)
    btn.addEventListener('click', async ev => {
      ev.preventDefault()
      const again = game.user.isGM && ev.shiftKey
      if ((btn.disabled || message.getFlag('god', `applied.${key}`)) && !again) return
      const pk = `${message.id}:${key}`
      if (pendingApply.has(pk) && !again) return
      pendingApply.add(pk)
      lockApplyButton(btn, null)
      const amount = (Number(btn.dataset.phys) || 0) + (Number(btn.dataset.mag) || 0) + (Number(btn.dataset.amount) || 0)
      try {
        if (btn.dataset.target) {
          const ok = await applyToTarget(btn.dataset.target, amount, { messageId: message.id, key })
          if (!ok) { pendingApply.delete(pk); unlockApplyButton(btn) }
          return
        }
        const tokens = (canvas.tokens?.controlled ?? []).filter(t => t.actor?.isOwner)
        if (!tokens.length) {
          pendingApply.delete(pk); unlockApplyButton(btn)
          return ui.notifications.warn('Обери токен(и), яким застосувати урон')
        }
        const lines = []
        for (const t of tokens) lines.push(API.damageSummary(t.actor.name, await API.dealDamage(t.actor, amount)))
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
    return true
  }
  if (!game.users.activeGM) { ui.notifications.warn('Немає майстра онлайн, щоб застосувати урон'); return false }
  game.socket.emit('system.god', { op: 'damage', uuid, amount, from: game.user.id, ...mark })
  ui.notifications.info(`Урон ${amount} → ${actor.name}: надіслано майстру`)
  return true
}

/** Ключі кнопок урону, які вже натиснуто на цьому клієнті (до приходу прапорця з сервера) */
const pendingApply = new Set()
function lockApplyButton(btn, done) {
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
      const out = await API.dealDamage(actor, Number(msg.amount) || 0)
      if (message) await message.setFlag('god', `applied.${msg.key}`, { by: msg.from, text: API.damageSummary(actor.name, out) })
    } else if (msg?.op === 'mark' && message) {
      await message.setFlag('god', `applied.${msg.key}`, msg.info)
    }
  })
  await migrateWorld()
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
