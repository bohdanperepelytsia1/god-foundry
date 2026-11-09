/** Міграція світу: проходить по світових акторах і неприв'язаних токенах на картах, без помилок */
import assert from 'node:assert/strict'

const calls = []
const coll = arr => Object.assign(arr, { contents: arr, get: id => arr.find(x => x.id === id) })
const mkItem = (id, type, img, system) => ({ id, type, img, system, _source: { system }, effects: coll([]),
  deleteEmbeddedDocuments: async () => {} })
const mkActor = (id, type, items, extra = {}) => ({ id, name: id, type, img: 'x.png', items: coll(items), effects: coll([]),
  prototypeToken: { bar1: {}, bar2: { attribute: 'resources.mp' } }, _source: { system: { a: 1 } },
  update: async u => calls.push(['actor.update', id, u]),
  updateEmbeddedDocuments: async (cls, ups, o) => calls.push(['embedded', id, cls, ups, o]), ...extra })
const gearGeneric = 'systems/god/assets/icons/gear/item.svg'
const hero = mkActor('hero', 'character', [mkItem('i1', 'gear', gearGeneric, { category: 'potion' })])
const orcItems = [mkItem('i2', 'gear', gearGeneric, { category: 'ammo' })]
const orcToken = { id: 't1', name: 'Орк', actorLink: false, bar1: {}, bar2: {}, actor: mkActor('orc-token', 'npc', orcItems) }
const scene = { name: 'Ліс', tokens: coll([orcToken]), updateEmbeddedDocuments: async (cls, ups) => calls.push(['scene', cls, ups]) }
let worldVersion = '0.9.8'
globalThis.game = {
  user: { isGM: true }, system: { version: '0.9.9' }, release: { generation: 13 },
  actors: coll([hero]), items: coll([]), scenes: coll([scene]),
  settings: { get: () => worldVersion, set: async (a, b, v) => { worldVersion = v } },
}
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: m => { throw new Error(m) } } }
globalThis.foundry = { utils: { isNewerVersion: (a, b) => a.localeCompare(b, undefined, { numeric: true }) > 0, deepClone: x => structuredClone(x) },
  applications: { instances: new Map() } }
globalThis.CONFIG = { Actor: { documentClass: { updateDocuments: async (u, o) => calls.push(['Actor.updateDocuments', u, o]) } },
  Item: { documentClass: { updateDocuments: async () => {} } } }
globalThis.Item = { updateDocuments: async () => {} }
const { migrateWorld } = await import('../god/module/migration.mjs')
await migrateWorld()
assert.equal(worldVersion, '0.9.9')
const emb = calls.filter(c => c[0] === 'embedded')
assert.ok(emb.some(c => c[1] === 'hero' && c[3][0].img.endsWith('gear/potion.svg')), 'іконка за категорією у світового актора')
assert.ok(emb.some(c => c[1] === 'orc-token' && c[3][0].img.endsWith('gear/ammo.svg')), 'і в токена на карті')
assert.ok(calls.some(c => c[0] === 'scene' && c[2][0]['bar1.attribute'] === 'resources.hp' && c[2][0]['bar2.attribute'] === 'resources.pr'), 'смуги токена НІП на карті')
assert.ok(calls.some(c => c[0] === 'actor.update' && c[2]['prototypeToken.bar1.attribute'] === 'resources.hp'), 'смуги прототипу')
assert.ok(calls.some(c => c[0] === 'Actor.updateDocuments' && c[2].godMigration && c[2].diff === false), 'дані акторів записано')
assert.ok(emb.some(c => c[1] === 'orc-token' && c[4]?.godMigration), 'предмети токена на карті записано')
console.log('✓ міграція: світ + токени на картах, іконки, смуги, запис даних')
