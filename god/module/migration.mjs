/**
 * Міграція світу між версіями системи. Запускається один раз у майстра на старті,
 * якщо світ створено старішою версією. Кожен крок ідемпотентний.
 */
import { defaultIcon, ACTOR_ICONS, STANCE_ICONS } from './config.mjs'

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
    if (actor.img === 'icons/svg/mystery-man.svg' && ACTOR_ICONS[actor.type]) { await actor.update({ img: ACTOR_ICONS[actor.type] }); n++ }
    const stances = actor.effects.filter(e => e.getFlag('god', 'stance') && LEGACY_STANCE[e.img])
      .map(e => ({ _id: e.id, img: STANCE_ICONS[LEGACY_STANCE[e.img]] }))
    if (stances.length) { await actor.updateEmbeddedDocuments('ActiveEffect', stances); n += stances.length }
  }
  return n
}

const STEPS = [['0.4.0', migrateIcons]]

export async function migrateWorld() {
  if (!game.user.isGM) return
  const from = game.settings.get('god', 'worldVersion')
  const to = game.system.version
  if (!foundry.utils.isNewerVersion(to, from)) return
  const pending = STEPS.filter(([v]) => foundry.utils.isNewerVersion(v, from) || v === to)
  if (pending.length && from !== '0.0.0') ui.notifications.info(`G.O.D.: оновлюю світ ${from} → ${to}…`)
  let changed = 0
  for (const [v, step] of pending) {
    try { changed += (await step()) || 0 }
    catch (e) { console.error(`G.O.D. | міграція ${v} не вдалась`, e); ui.notifications.error(`G.O.D.: міграція ${v} не вдалась — деталі в консолі (F12)`) ; return }
  }
  await game.settings.set('god', 'worldVersion', to)
  if (changed) ui.notifications.info(`G.O.D.: світ оновлено до ${to} (змінено ${changed} документів)`)
}
