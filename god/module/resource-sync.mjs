/**
 * Поточні ресурси йдуть за максимумом.
 * Одягнув броню (+40 PR) — поточний PR +40; підняв Статуру (+10 HP макс.) — поточне HP +10;
 * зняв — так само вниз. Працює для будь-якого джерела: характеристики, бонуси, броня,
 * ефекти предметів, ручний максимум НІП.
 *
 * Як: pre-хук (виконується лише на клієнті, що робить зміну) кладе знімок максимумів
 * в options операції; post-хук того ж клієнта порівнює і дописує різницю.
 * Інші клієнти нічого не пишуть — подвійних нарахувань немає. Операції без змін
 * (post не приходить) нічого по собі не лишають.
 */
import * as R from './rules.mjs'

const KEYS = ['hp', 'mp', 'mt', 'ed', 'pr', 'mr']
const queued = new Map()    // actor.uuid → { actor, base:{m,t}, skip:Set, timer }
const applied = new Map()   // actor.uuid → { m, t } — максимуми після останнього врахування
let clock = 0               // монотонний лічильник замість часу: порядок важливіший за мілісекунди

const maxes = actor => {
  const res = actor?.system?.resources
  if (!res) return null
  const out = {}
  for (const k of KEYS) if (res[k] && typeof res[k].max === 'number') out[k] = res[k].max
  return out
}
const actorOf = doc => {
  if (doc instanceof Actor) return doc
  const p = doc?.parent
  if (p instanceof Actor) return p
  if (p?.parent instanceof Actor) return p.parent
  return null
}

function begin(actor, options, skip = []) {
  if (!actor || !options || !['character', 'npc'].includes(actor.type)) return
  const store = (options.godResSnap ??= {})
  const e = (store[actor.uuid] ??= { m: maxes(actor), t: ++clock, skip: [] })
  e.skip.push(...skip)
}

function end(actor, options, userId) {
  const snap = actor && options?.godResSnap?.[actor.uuid]
  if (!snap || userId !== game.user.id) return
  // База: найраніший знімок, але не раніший за вже враховане
  const done = applied.get(actor.uuid)
  const base = done && done.t > snap.t ? done : snap
  let q = queued.get(actor.uuid)
  if (!q) { q = { actor, base, skip: new Set() }; queued.set(actor.uuid, q) }
  else if (base.t < q.base.t) q.base = base
  for (const k of snap.skip ?? []) q.skip.add(k)
  // Заміна броні — кілька оновлень предметів; збираємо їх і рахуємо разом
  clearTimeout(q.timer)
  q.timer = setTimeout(() => flush(q), 0)
}

async function flush(q) {
  const { actor } = q
  queued.delete(actor.uuid)
  const now = maxes(actor)
  if (!now) return
  applied.set(actor.uuid, { m: now, t: ++clock })
  const prev = q.base.m ?? {}
  const debt = actor.getFlag('god', 'resDebt') ?? {}
  const upd = {}
  for (const k of Object.keys(now)) {
    if (q.skip.has(k) || prev[k] === undefined || now[k] === prev[k]) continue
    const cur = actor.system.resources[k].value
    const r = R.followMax(cur, prev[k], now[k], debt[k] ?? 0)
    if (r.value !== cur) upd[`system.resources.${k}.value`] = r.value
    if ((debt[k] ?? 0) !== r.debt) upd[`flags.god.resDebt.${k}`] = r.debt
  }
  if (Object.keys(upd).length) await actor.update(upd, { godResSync: true })
}

export function registerResourceSync() {
  // Зміни самого актора: характеристики, бонуси, ручний максимум НІП
  Hooks.on('preUpdateActor', (actor, changes, options) => {
    if (options.godResSync) return
    // Якщо в цьому ж оновленні поточне значення задано явно — не втручаємось у нього
    const skip = KEYS.filter(k => foundry.utils.getProperty(changes, `system.resources.${k}.value`) !== undefined)
    begin(actor, options, skip)
  })
  Hooks.on('updateActor', (actor, changes, options, userId) => end(actor, options, userId))

  // Предмети й ефекти: одягнути броню, ефект «+200 OM» на персні, зміна PR предмета
  for (const type of ['Item', 'ActiveEffect']) {
    for (const op of ['create', 'update', 'delete']) {
      const Op = op[0].toUpperCase() + op.slice(1)
      // pre: create/update (doc, data|changes, options, userId); delete (doc, options, userId)
      Hooks.on(`pre${Op}${type}`, (doc, a, b) => begin(actorOf(doc), op === 'delete' ? a : b))
      // post: create/delete (doc, options, userId); update (doc, changes, options, userId)
      Hooks.on(`${op}${type}`, (doc, a, b, c) => {
        const [options, userId] = op === 'update' ? [b, c] : [a, b]
        end(actorOf(doc), options, userId)
      })
    }
  }
}
