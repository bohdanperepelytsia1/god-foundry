/**
 * Міграція світу між версіями системи. Запускається один раз у майстра на старті,
 * якщо світ створено старішою версією. Кожен крок ідемпотентний.
 */
import { GOD, defaultIcon, ACTOR_ICONS, STANCE_ICONS } from './config.mjs'
import { isV14 } from './compat.mjs'
import { guessGearCategory, siteEffectsHtml, SITE_EFFECTS_TITLE } from './site-import.mjs'
import { migrateStorageActors } from './wagons.mjs'

const LEGACY_ITEM_ICONS = new Set(['icons/svg/sword.svg', 'icons/svg/shield.svg', 'icons/svg/item-bag.svg', 'icons/svg/fire.svg', 'icons/svg/lightning.svg'])
const LEGACY_STANCE = { 'icons/svg/sword.svg': 'attack', 'icons/svg/shield.svg': 'defense', 'icons/svg/daze.svg': 'nonlethal' }

export function registerMigrationSettings() {
  game.settings.register('god', 'worldVersion', { scope: 'world', config: false, type: String, default: '0.0.0' })
}

/** 0.1–0.3 → 0.4+: стандартні іконки Foundry → іконки системи */
async function migrateIcons() {
  let n = 0
  const fixItems = async (collection, parent) => {
    const updates = collection.filter(i => LEGACY_ITEM_ICONS.has(i.img)).map(i => ({ _id: i.id, img: defaultIcon(i.type, i.system) }))
    if (!updates.length) return
    n += updates.length
    if (parent) await parent.updateEmbeddedDocuments('Item', updates)
    else await Item.updateDocuments(updates)
  }
  await fixItems(game.items)
  for (const actor of game.actors) {
    await fixItems(actor.items, actor)
    const stances = actor.effects.filter(e => e.getFlag('god', 'stance') && LEGACY_STANCE[e.img])
      .map(e => ({ _id: e.id, img: STANCE_ICONS[LEGACY_STANCE[e.img]] }))
    if (stances.length) { await actor.updateEmbeddedDocuments('ActiveEffect', stances); n += stances.length }
  }
  return n
}

/**
 * 0.9.2: ШУ від класу обладунку тепер рахується автоматично — старі ефекти «−1/−2 ШУ»
 * на кольчузі й латах дали б подвійний штраф. Прибираємо їх.
 */
async function migrateArmorDodgeEffects() {
  let n = 0
  const isOld = e => ['Середній обладунок', 'Тяжкий обладунок'].includes(e.name)
    && e.changes.length === 1 && e.changes[0].key === 'system.combat.dodgeBonus'
  const items = [...game.items, ...game.actors.contents.flatMap(a => a.items.contents)].filter(i => i.type === 'armor')
  for (const item of items) {
    const ids = item.effects.filter(isOld).map(e => e.id)
    if (ids.length) { await item.deleteEmbeddedDocuments('ActiveEffect', ids); n += ids.length }
  }
  return n
}

/**
 * Усі актори, з якими треба працювати: світові + неприв'язані токени на сценах (картах).
 * Для неприв'язаного токена зміни йдуть у його власну дельту — сам світовий актор не чіпається.
 */
function* allActors() {
  for (const a of game.actors) yield { actor: a, where: a.name }
  for (const scene of game.scenes) {
    for (const t of scene.tokens) {
      if (t.actorLink || !t.actor) continue
      yield { actor: t.actor, where: `${scene.name}: ${t.name}` }
    }
  }
}
const allItems = () => [...game.items, ...[...allActors()].flatMap(({ actor }) => actor.items.contents)]

/** Звичайні предмети: загальна іконка «мішок» → іконка за категорією (після розширення категорій) */
async function migrateGearIcons() {
  let n = 0
  const generic = defaultIcon('gear', { category: 'item' })
  const fix = async (items, parent) => {
    const ups = items.filter(i => i.type === 'gear' && i.img === generic && i.system.category && i.system.category !== 'item')
      .map(i => ({ _id: i.id, img: defaultIcon('gear', i.system) }))
    if (!ups.length) return
    n += ups.length
    parent ? await parent.updateEmbeddedDocuments('Item', ups) : await Item.updateDocuments(ups)
  }
  await fix(game.items.contents)
  for (const { actor } of allActors()) await fix(actor.items.contents, actor)
  return n
}

/** Ефекти, створені старою версією: додаємо v14-поле `type` і прибираємо порожні зміни */
async function migrateEffectChanges() {
  if (!isV14()) return 0   // у v13 поле type не існує — нічого записувати
  let n = 0
  const fixDoc = async doc => {
    const ups = []
    for (const e of doc.effects) {
      const src = e._source.changes ?? []
      if (!src.length || src.every(c => c.type)) continue
      ups.push({ _id: e.id, changes: src.filter(c => c.key).map(c => ({ ...c, type: c.type ?? ({ 1: 'multiply', 2: 'add', 3: 'downgrade', 4: 'upgrade', 5: 'override' }[c.mode] ?? 'add') })) })
    }
    if (ups.length) { await doc.updateEmbeddedDocuments('ActiveEffect', ups); n += ups.length }
  }
  for (const { actor } of allActors()) { await fixDoc(actor); for (const i of actor.items) await fixDoc(i) }
  for (const i of game.items) await fixDoc(i)
  return n
}

/** Токени на картах і прототипи: смуги HP/PR (НІП) і HP/OM (персонаж), якщо їх не налаштовано */
async function migrateTokenBars() {
  let n = 0
  const want = type => type === 'npc' ? ['resources.hp', 'resources.pr'] : ['resources.hp', 'resources.mp']
  for (const a of game.actors) {
    const [b1, b2] = want(a.type), pt = a.prototypeToken
    const upd = {}
    if (!pt.bar1?.attribute) upd['prototypeToken.bar1.attribute'] = b1
    if (!pt.bar2?.attribute) upd['prototypeToken.bar2.attribute'] = b2
    if (Object.keys(upd).length) { await a.update(upd); n++ }
  }
  for (const scene of game.scenes) {
    const ups = scene.tokens.filter(t => t.actor && (!t.bar1?.attribute || !t.bar2?.attribute)).map(t => {
      const [b1, b2] = want(t.actor.type)
      return { _id: t.id, ...(!t.bar1?.attribute ? { 'bar1.attribute': b1 } : {}), ...(!t.bar2?.attribute ? { 'bar2.attribute': b2 } : {}) }
    })
    if (ups.length) { await scene.updateEmbeddedDocuments('Token', ups); n += ups.length }
  }
  return n
}

/**
 * 0.14.1: те, що перенесла з сайту 0.14.0.
 * — Предмети: категорія спорядження за назвою й іконка за категорією (вкладені предмети лишились з торбинкою).
 *   Чіпаємо лише перенесені предмети зі стандартною іконкою — свої картинки майстра не змінюються.
 * — Текстові «ефекти» сайту: з активних ефектів у розділ біографії (у ворога — у нотатки).
 */
async function migrateSiteImportFix() {
  const BAG = 'icons/svg/item-bag.svg', EXACT = ['potion', 'food', 'book', 'ingredient', 'scroll', 'jewellery']
  const opts = { godMigration: true }
  let n = 0
  const fixItems = async (items, parent) => {
    const ups = []
    for (const it of items) {
      const site = it.getFlag?.('god', 'site') ?? it.flags?.god?.site
      if (!site || (it.img && it.img !== BAG && it.img !== defaultIcon(it.type, it.system))) continue
      const upd = { _id: it.id }
      let sys = it.system
      if (it.type === 'gear' && !EXACT.includes(site.type) && it.system.category === (GOD.LOCATION_CATEGORY[it.system.location] ?? 'item')) {
        const cat = guessGearCategory(it.name, site.type)
        if (cat !== 'item' && cat !== it.system.category) { upd['system.category'] = cat; sys = { ...it.system, category: cat } }
      }
      const img = defaultIcon(it.type, sys)
      if (img !== it.img) upd.img = img
      if (Object.keys(upd).length > 1) ups.push(upd)
    }
    if (!ups.length) return
    n += ups.length
    parent ? await parent.updateEmbeddedDocuments('Item', ups, opts) : await Item.updateDocuments(ups, opts)
  }
  await fixItems(game.items.contents)
  for (const { actor } of allActors()) {
    await fixItems(actor.items.contents, actor)
    const site = actor.effects.filter(e => e.getFlag?.('god', 'fromSite') ?? e.flags?.god?.fromSite)
    if (!site.length) continue
    const field = actor.type === 'npc' ? 'system.notes' : 'system.biography'
    const cur = foundry.utils.getProperty(actor, field) ?? ''
    const texts = site.map(e => { const d = String(e.description ?? '').replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').trim(); return d || e.name })
    const upd = cur.includes(SITE_EFFECTS_TITLE) ? {} : { [field]: cur + siteEffectsHtml(texts) }
    if (Object.keys(upd).length) await actor.update(upd, opts)
    await actor.deleteEmbeddedDocuments('ActiveEffect', site.map(e => e.id), opts)
    n += site.length
  }
  return n
}

/** 0.14.0: смуги HP/OM над токенами героїв прибрано (ресурси видно в панелі героя) */
async function migrateHideHeroBars() { return hideBars('character', CONST.TOKEN_DISPLAY_MODES.OWNER) }
/** 0.15.1: і над ворогами (HP видно на листі ворога та в панелі бою) */
async function migrateHideFoeBars() { return hideBars('npc', CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER) }
async function hideBars(type, OWNER) {
  const NONE = CONST.TOKEN_DISPLAY_MODES.NONE
  const opts = { godMigration: true }
  let n = 0
  for (const a of game.actors) {
    if (a.type !== type || a.prototypeToken.displayBars !== OWNER) continue
    await a.update({ 'prototypeToken.displayBars': NONE }, opts); n++
  }
  for (const scene of game.scenes) {
    const ups = scene.tokens.filter(t => t.actor?.type === type && t.displayBars === OWNER).map(t => ({ _id: t.id, displayBars: NONE }))
    if (ups.length) { await scene.updateEmbeddedDocuments('Token', ups, opts); n += ups.length }
  }
  return n
}

/** 0.19.1: ворог зі зброєю в руках → «Чим б'є» = категорія тієї зброї (урон тепер завжди PD/MD) */
async function migrateFoeLook() {
  let n = 0
  for (const a of game.actors) {
    if (a.type !== 'npc' || a.system.attack?.look) continue
    const w = a.items.find(i => i.type === 'weapon' && i.system.equipped)
    if (!w?.system.category) continue
    await a.update({ 'system.attack.look': w.system.category }, { godMigration: true }); n++
  }
  return n
}

/**
 * Дані акторів і предметів, перетворені новою версією (нові поля, перейменування, обрізані максимуми),
 * записуємо в базу — тоді все виглядає однаково і на картах, і в списках, без пересоздання світу.
 */
async function persistMigratedData() {
  let n = 0
  const write = async (docs, cls, parent) => {
    const ups = docs.filter(d => d._source?.system).map(d => ({ _id: d.id, system: foundry.utils.deepClone(d._source.system) }))
    if (!ups.length) return
    const opts = { diff: false, recursive: false, render: false, godMigration: true }
    parent ? await parent.updateEmbeddedDocuments(cls, ups, opts) : await CONFIG[cls].documentClass.updateDocuments(ups, opts)
    n += ups.length
  }
  await write(game.actors.contents, 'Actor')
  await write(game.items.contents, 'Item')
  for (const a of game.actors) await write(a.items.contents, 'Item', a)
  // неприв'язані токени: лише предмети (власні дані в них — дельта поверх світового актора)
  for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) await write(t.actor.items.contents, 'Item', t.actor)
  return n
}

/**
 * 0.12.0: типова картинка актора — стандартний силует Foundry замість іконок системи (орк у НІП);
 * токен без окремої картинки показує портрет. Розмір токена НІП — за розміром істоти.
 */
async function migrateActorImages() {
  const OLD = new Set(Object.values(ACTOR_ICONS)), STD = 'icons/svg/mystery-man.svg'
  const opts = { godMigration: true }
  let n = 0
  for (const a of game.actors) {
    const upd = {}
    const img = OLD.has(a.img) ? STD : a.img
    if (img !== a.img) upd.img = img
    const ts = a.prototypeToken?.texture?.src
    if (!ts || OLD.has(ts) || (ts === STD && img !== STD)) upd['prototypeToken.texture.src'] = img
    if (a.type === 'npc') {
      const k = GOD.TOKEN_SIZES[a.system.size] ?? 1
      if (k !== 1 && a.prototypeToken.width === 1 && a.prototypeToken.height === 1) Object.assign(upd, { 'prototypeToken.width': k, 'prototypeToken.height': k })
    }
    if (Object.keys(upd).length) { await a.update(upd, opts); n++ }
  }
  for (const scene of game.scenes) {
    const ups = []
    for (const t of scene.tokens) {
      const ts = t.texture?.src, base = t.actor?.img || game.actors.get(t.actorId)?.img || STD
      if (!ts || OLD.has(ts)) ups.push({ _id: t.id, 'texture.src': OLD.has(base) ? STD : base })
    }
    if (ups.length) { await scene.updateEmbeddedDocuments('Token', ups, opts); n += ups.length }
  }
  return n
}

/** Стара версія з'їдала ШУ-ефекти лише у світових акторів — тепер і на картах */
async function migrateArmorDodgeEverywhere() {
  let n = 0
  const isOld = e => ['Середній обладунок', 'Тяжкий обладунок'].includes(e.name)
    && e.changes.length === 1 && e.changes[0].key === 'system.combat.dodgeBonus'
  for (const item of allItems().filter(i => i.type === 'armor')) {
    const ids = item.effects.filter(isOld).map(e => e.id)
    if (ids.length) { await item.deleteEmbeddedDocuments('ActiveEffect', ids); n += ids.length }
  }
  return n
}

// Кожен крок ідемпотентний; кроки з '*' виконуються при кожному оновленні системи
const STEPS = [
  ['0.4.0', migrateIcons], ['0.9.2', migrateArmorDodgeEffects],
  ['0.9.9', migrateArmorDodgeEverywhere], ['0.9.9', migrateGearIcons], ['0.9.9', migrateTokenBars], ['0.12.0', migrateActorImages], ['0.14.0', migrateHideHeroBars], ['0.14.1', migrateSiteImportFix], ['0.15.1', migrateHideFoeBars], ['0.18.0', migrateStorageActors], ['0.19.1', migrateFoeLook],
  ['*', migrateEffectChanges], ['*', persistMigratedData],
]

/** Запустити всі кроки примусово (кнопка в налаштуваннях) */
export async function migrateWorldForce() {
  if (!game.user.isGM) return ui.notifications.warn('Оновлювати дані світу може лише майстер')
  return runSteps(STEPS, game.settings.get('god', 'worldVersion'), game.system.version, true)
}

export async function migrateWorld() {
  if (!game.user.isGM) return
  const from = game.settings.get('god', 'worldVersion')
  const to = game.system.version
  if (!foundry.utils.isNewerVersion(to, from)) return
  const pending = STEPS.filter(([v]) => v === '*' || foundry.utils.isNewerVersion(v, from) || v === to)
  return runSteps(pending, from, to, false)
}

async function runSteps(steps, from, to, forced) {
  if (from !== '0.0.0' || forced) ui.notifications.info(`G.O.D.: оновлюю дані світу ${forced ? '' : `${from} → ${to}`}…`)
  let changed = 0
  for (const [v, step] of steps) {
    try { changed += (await step()) || 0 }
    catch (e) { console.error(`G.O.D. | міграція ${v} (${step.name}) не вдалась`, e); ui.notifications.error(`G.O.D.: крок оновлення «${step.name}» не вдався — деталі в консолі (F12)`); return }
  }
  await game.settings.set('god', 'worldVersion', to)
  ui.notifications.info(`G.O.D.: дані світу оновлено до ${to}${changed ? ` (записано ${changed})` : ''}`)
  for (const app of foundry.applications.instances?.values?.() ?? []) if (app.document) app.render?.()
}

/** Пункт у налаштуваннях системи: «Оновити дані світу» */
export function registerMigrationMenu() {
  const { ApplicationV2 } = foundry.applications.api
  class GodMigrationMenu extends ApplicationV2 {
    static DEFAULT_OPTIONS = { id: 'god-migrate', window: { title: 'G.O.D.: оновити дані світу' } }
    async render() {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Оновити дані світу' },
        content: '<p>Перезаписати дані всіх персонажів, НІП (і на картах), предметів і ефектів за поточною версією системи?</p><p class="god-hint">Нічого не видаляється, крім старих дублів ШУ-ефектів на обладунку. Корисно, якщо після оновлення щось виглядає по-старому.</p>',
      })
      if (ok) await migrateWorldForce()
      return this
    }
  }
  game.settings.registerMenu('god', 'migrateMenu', {
    name: 'Оновити дані світу', label: 'Оновити зараз', icon: 'fa-solid fa-rotate',
    hint: 'Переписує дані акторів (і токенів на картах), предметів та ефектів за поточною версією системи — без пересоздання світу.',
    type: GodMigrationMenu, restricted: true,
  })
}
