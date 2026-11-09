/** Одягання зброї: дві легкі в дві руки, щит, дворучна */
import assert from 'node:assert/strict'
globalThis.Actor = class {}
globalThis.foundry = { utils: { getProperty: () => undefined } }
const { GodActor } = await import('../god/module/documents/actor.mjs')
const R = await import('../god/module/rules.mjs')

const mk = (id, type, system) => ({ id, type, name: id, system: { equipped: false, ...system }, update: async u => { apply([{ _id: id, ...u }]) } })
let items
const apply = ups => { for (const u of ups) { const it = items.find(i => i.id === u._id); for (const [k, v] of Object.entries(u)) if (k !== '_id') it.system[k.replace('system.', '')] = v } }
const actor = Object.create(GodActor.prototype)
Object.defineProperty(actor, 'items', { get: () => items })
actor.updateEmbeddedDocuments = async (cls, ups) => apply(ups)
const on = () => items.filter(i => i.system.equipped).map(i => `${i.id}:${i.system.hand ?? i.system.slot}`).sort()

items = [mk('d1', 'weapon', { category: 'light', hand: 'main' }), mk('d2', 'weapon', { category: 'light', hand: 'main' }),
  mk('sword', 'weapon', { category: 'onehand', hand: 'main' }), mk('shield', 'armor', { slot: 'Щит' }),
  mk('great', 'weapon', { category: 'twohand', twoHanded: true, hand: 'main' })]
await actor.toggleEquip(items[0]); await actor.toggleEquip(items[1])
assert.deepEqual(on(), ['d1:main', 'd2:off'], 'другий кинджал — у другу руку')
await actor.toggleEquip(items[2])
assert.deepEqual(on(), ['d2:off', 'sword:main'], 'меч замінює кинджал в основній руці, лівий лишається')
await actor.toggleEquip(items[3])
assert.deepEqual(on(), ['shield:Щит', 'sword:main'], 'щит займає другу руку')
await actor.toggleEquip(items[4])
assert.deepEqual(on(), ['great:main'], 'дворучна знімає все')
items[1].system.hand = 'off'
await actor.toggleEquip(items[2]); await actor.toggleEquip(items[1])
assert.deepEqual(on(), ['d2:off', 'sword:main'])
// кулаки: зміни сітки з рівнем
assert.equal(R.fistExtras(6, 17, 15).chanceCrit, true); assert.equal(R.fistExtras(5, 17, 15).chanceCrit, false)
assert.deepEqual([8, 9, 10].map(l => R.fistExtras(l, 19, 19).shock), [false, true, true])
assert.deepEqual([7, 8, 9, 10].map(l => R.fistExtras(l, 1, 1).disarmAt), [0, 19, 18, 16])
assert.deepEqual([3, 4, 6, 8, 9].map(R.arrowSurvival), [null, 'chance', 'half', 'threeQuarters', 'always'])
console.log('✓ одягання: дві легкі зброї, щит, дворучна; кулаки й стріли за рівнем')
