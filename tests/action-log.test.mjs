import assert from 'node:assert/strict'
globalThis.foundry = { applications: { api: { ApplicationV2: class {} } }, utils: {} }
const { actorParts, itemParts, partText, pushEntry, actorLabel } = await import('../god/module/apps/action-log.mjs')

// підписи
assert.equal(actorLabel('system.resources.hp.value'), 'HP')
assert.equal(actorLabel('system.resources.spr.value'), 'PR щита')
assert.equal(actorLabel('system.stats.str.value'), 'Сила')
assert.equal(actorLabel('system.money.gold'), 'Золото')

// актор: старе → нове з різницею, шум пропускаємо
const p = actorParts({ 'system.resources.hp.value': 120, 'system.progress.xp': 10 },
  { 'system.resources.hp.value': 95, 'flags.god.quickbar': [1], sort: 3, 'system.progress.xp': 60, 'system.rollMods.stat.str': 2 })
assert.deepEqual(p.map(partText), ['HP 120 → 95 (−25)', 'XP 10 → 60 (+50)'])

// предмет: переклав, кількість, одягнув
const ip = itemParts('Стріли', { 'system.location': 'main', 'system.quantity': 12, 'system.equipped': false },
  { 'system.location': 'quiver', 'system.quantity': 11, 'system.equipped': true })
assert.deepEqual(ip.map(partText), ['переклав «Стріли»: Загальне → Сагайдак', '«Стріли» × 12 → 11 (−1)', 'одягнув / взяв «Стріли»'])

// злиття кліків по HP за короткий час; повернення до початку — запис зникає
const log = []
const e = (t, from, to) => ({ t, u: 'u1', a: 'A', i: null, parts: [{ k: 'system.resources.hp.value', label: 'HP', from, to }] })
pushEntry(log, e(0, 100, 99)); pushEntry(log, e(1000, 99, 98)); pushEntry(log, e(2000, 98, 90))
assert.equal(log.length, 1); assert.equal(partText(log[0].parts[0]), 'HP 100 → 90 (−10)')
pushEntry(log, e(60000, 90, 80))
assert.equal(log.length, 2, 'через 60 с — новий запис')
pushEntry(log, e(61000, 80, 90))
assert.equal(log.length, 1, 'повернув як було — запис зайвий')
// інший гравець — окремо
pushEntry(log, { ...e(2500, 90, 85), u: 'u2' })
assert.equal(log.length, 2)
console.log('✓ журнал дій: підписи, різниця, злиття')
