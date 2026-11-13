/**
 * Візки пачки — спільні сховища гравців, що живуть у даних світу (не актори):
 * у майстра не з'являється купа «сховищ» серед акторів, а гравці бачать свої візки
 * на вкладці «Візки» листа персонажа.
 *
 * Візок: { id, name, party, capacity, users: [userId] (порожньо — усім гравцям), items: [дані предмета], siteId }
 * Писати в дані світу може лише майстер, тож гравець надсилає запит через сокет системи,
 * а майстер (або сам гравець-майстер) виконує: перекладає предмет між листом і візком.
 */
import { defaultIcon } from './config.mjs'

const KEY = 'wagons'
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const rid = () => foundry.utils.randomID()

// ── Чисті функції (тестуються в Node) ──────────────────────────────────────────
export const wagonWeight = w => Math.round((w?.items ?? []).reduce((t, i) => t + num(i.system?.weight) * Math.max(1, num(i.system?.quantity) || 1), 0) * 100) / 100

/** Чи бачить користувач візок: майстер — усі; гравець — якщо в списку або список порожній */
export const canSee = (w, userId, isGM = false) => isGM || !(w?.users?.length) || w.users.includes(userId)

/** Покласти дані предмета у візок: однакові речі (назва, тип, картинка) складаються в стос */
export function wagonAdd(w, data, qty) {
  const n = Math.max(1, Math.trunc(qty ?? data.system?.quantity ?? 1) || 1)
  const same = w.items.find(i => i.name === data.name && i.type === data.type && i.img === data.img && i.type === 'gear')
  if (same) { same.system.quantity = Math.max(1, num(same.system.quantity) || 1) + n; return same }
  const it = foundry.utils?.deepClone ? foundry.utils.deepClone(data) : structuredClone(data)
  it._id = rid()
  it.system = { ...(it.system ?? {}), quantity: n }
  if ('equipped' in it.system) it.system.equipped = false
  if (it.system.location === 'belt') it.system.location = 'main'
  delete it.folder; delete it.sort; delete it.ownership; delete it._stats
  w.items.push(it)
  return it
}

/** Взяти з візка n штук: повертає дані для створення на листі (або null) і зменшує/прибирає рядок */
export function wagonTake(w, itemId, qty) {
  const i = w.items.findIndex(x => x._id === itemId)
  if (i < 0) return null
  const src = w.items[i], have = Math.max(1, num(src.system?.quantity) || 1)
  const n = Math.min(have, Math.max(1, Math.trunc(qty ?? have) || have))
  const out = structuredClone(src)
  delete out._id
  out.system.quantity = n
  if (n >= have) w.items.splice(i, 1)
  else src.system.quantity = have - n
  return out
}

// ── Дані світу ────────────────────────────────────────────────────────────────
export const allWagons = () => structuredClone(game.settings.get('god', KEY) ?? [])
export const wagonsFor = (user = game.user) => allWagons().filter(w => canSee(w, user.id, user.isGM))
async function save(list) { await game.settings.set('god', KEY, list) }

/** Виконати операцію (лише майстер). user — хто просив */
async function perform(op, user) {
  const list = allWagons()
  const w = list.find(x => x.id === op.wagon)
  if (op.action !== 'create' && !w) return
  if (w && !canSee(w, user.id, user.isGM)) return
  const card = (actor, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="god-card god-give-card">${html}</div>` })

  if (op.action === 'put') {
    const item = await fromUuid(op.item)
    const actor = item?.parent
    if (!item || !(actor instanceof Actor) || !actor.testUserPermission(user, 'OWNER')) return
    const have = Math.max(1, item.system.quantity ?? 1), n = Math.min(have, Math.max(1, Math.trunc(op.qty ?? have) || have))
    if (w.capacity > 0 && wagonWeight(w) + num(item.system.weight) * n > w.capacity + 1e-6) {
      return notify(user, `«${w.name}» переповнений: ${wagonWeight(w)} / ${w.capacity} кг`)
    }
    wagonAdd(w, item.toObject(), n)
    await save(list)
    n >= have ? await item.delete() : await item.update({ 'system.quantity': have - n })
    return card(actor, `<div class="god-give-row"><b>${esc(actor.name)}</b><i class="fa-solid fa-arrow-right"></i><b>${esc(w.name)}</b></div><div class="god-give-what"><img src="${esc(item.img)}" alt=""> ${esc(item.name)}${n > 1 ? ` ×${n}` : ''}</div>`)
  }
  if (op.action === 'take') {
    const actor = await fromUuid(op.actor)
    if (!(actor instanceof Actor) || !actor.testUserPermission(user, 'OWNER')) return
    const data = wagonTake(w, op.itemId, op.qty)
    if (!data) return
    await save(list)
    await actor.createEmbeddedDocuments('Item', [data])
    return card(actor, `<div class="god-give-row"><b>${esc(w.name)}</b><i class="fa-solid fa-arrow-right"></i><b>${esc(actor.name)}</b></div><div class="god-give-what"><img src="${esc(data.img)}" alt=""> ${esc(data.name)}${data.system.quantity > 1 ? ` ×${data.system.quantity}` : ''}</div>`)
  }
  if (!user.isGM) return
  // ── керування (лише майстер)
  if (op.action === 'create') list.push({ id: rid(), name: op.name || 'Новий візок', party: op.party ?? '', capacity: num(op.capacity), users: op.users ?? [], items: [] })
  if (op.action === 'update') Object.assign(w, foundry.utils.mergeObject({}, op.data ?? {}), { id: w.id, items: w.items })
  if (op.action === 'delete') list.splice(list.indexOf(w), 1)
  if (op.action === 'removeItem') { const i = w.items.findIndex(x => x._id === op.itemId); if (i >= 0) w.items.splice(i, 1) }
  return save(list)
}

function notify(user, text) {
  if (user.isSelf) return ui.notifications.warn(text)
  game.socket.emit('system.god', { op: 'wagonMsg', to: user.id, text })
}

/** Запит від поточного користувача: сам (майстер) або через майстра */
export function request(op) {
  if (game.user.isGM) return perform(op, game.user)
  if (!game.users.activeGM) return ui.notifications.warn('Візки працюють, коли майстер онлайн')
  game.socket.emit('system.god', { op: 'wagon', from: game.user.id, data: op })
}

/**
 * Імпорт візків із сайту (лише майстер): список { name, party, capacity, users, items, siteId }.
 * Візок із тим самим siteId замінюється (overwrite) або пропускається.
 */
export async function importWagons(wagons, { overwrite = false } = {}) {
  const list = allWagons()
  let added = 0, skipped = []
  for (const w of wagons) {
    const at = list.findIndex(x => w.siteId && x.siteId === w.siteId)
    if (at >= 0 && !overwrite) { skipped.push(w.name); continue }
    const wagon = { id: at >= 0 ? list[at].id : rid(), name: w.name, party: w.party ?? '', capacity: num(w.capacity), users: w.users ?? [], siteId: w.siteId ?? null, items: [] }
    for (const it of w.items ?? []) wagonAdd(wagon, { ...it, img: it.img ?? defaultIcon(it.type, it.system) }, it.system?.quantity)
    at >= 0 ? (list[at] = wagon) : list.push(wagon)
    added++
  }
  await save(list)
  return { added, skipped }
}

/** Оновити відкриті листи, коли візки змінились */
function refreshSheets() {
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (app.document?.type === 'character' && app.rendered && app.constructor.PARTS?.wagons) app.render({ parts: ['wagons'] })
  }
}

export function registerWagons() {
  game.settings.register('god', KEY, { scope: 'world', config: false, type: Array, default: [], onChange: () => refreshSheets() })
}

export function registerWagonSocket() {
  game.socket.on('system.god', async msg => {
    if (msg?.op === 'wagonMsg' && msg.to === game.user.id) return ui.notifications.warn(msg.text)
    if (msg?.op !== 'wagon' || game.user !== game.users.activeGM) return
    const user = game.users.get(msg.from)
    if (user) try { await perform(msg.data, user) } catch (err) { console.error('G.O.D. | візок', err) }
  })
}

/**
 * Перенести старі сховища-актори (0.17.0) у візки світу й видалити їх разом із токенами на сценах.
 * Хто володів сховищем — той і бачить візок.
 */
export async function migrateStorageActors() {
  const old = game.actors.filter(a => a.type === 'storage')
  if (!old.length) return 0
  const wagons = old.map(a => ({
    name: a.name, party: a.system.party ?? '', capacity: a.system.capacity ?? 0, siteId: a.getFlag('god', 'siteId') ?? null,
    users: game.users.filter(u => !u.isGM && a.testUserPermission(u, 'OWNER') && (a.ownership?.[u.id] ?? 0) >= 3).map(u => u.id),
    items: a.items.map(i => i.toObject()),
  }))
  await importWagons(wagons, { overwrite: true })
  for (const scene of game.scenes) {
    const ids = scene.tokens.filter(t => t.actor?.type === 'storage' || old.some(a => a.id === t.actorId)).map(t => t.id)
    if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids)
  }
  const folders = new Set(old.map(a => a.folder).filter(Boolean))
  await Actor.implementation.deleteDocuments(old.map(a => a.id))
  for (const f of folders) if (!f.contents?.length && !f.children?.length) await f.delete().catch(() => {})
  return old.length
}
