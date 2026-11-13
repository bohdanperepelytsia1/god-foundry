// Візки світу: покласти (стос), взяти частину, вага, хто бачить
import assert from 'node:assert/strict'
let n = 0
globalThis.foundry = { data: { fields: {} }, utils: { randomID: () => `id${++n}`, deepClone: x => structuredClone(x) } }
const W = await import('../god/module/wagons.mjs')
const w = { id: 'w', name: 'Віз', capacity: 50, users: [], items: [] }
const rope = { name: 'Мотузка', type: 'gear', img: 'r.svg', system: { quantity: 2, weight: 1.5, equipped: false, location: 'belt' }, folder: 'f', _stats: {} }
W.wagonAdd(w, rope, 2)
W.wagonAdd(w, { ...rope, system: { ...rope.system } }, 3)
assert.equal(w.items.length, 1, 'однакові речі — в один стос')
assert.equal(w.items[0].system.quantity, 5)
assert.equal(w.items[0].system.location, 'main', 'пояс → загальне')
assert.ok(!('folder' in w.items[0]) && !('_stats' in w.items[0]), 'службові поля прибрано')
const sword = { name: 'Меч', type: 'weapon', img: 's.svg', system: { quantity: 1, weight: 2, equipped: true } }
W.wagonAdd(w, sword, 1); W.wagonAdd(w, sword, 1)
assert.equal(w.items.length, 3, 'зброя не складається в стос'); assert.equal(w.items[1].system.equipped, false)
assert.equal(W.wagonWeight(w), 5 * 1.5 + 2 + 2)
const part = W.wagonTake(w, w.items[0]._id, 2)
assert.equal(part.system.quantity, 2); assert.ok(!('_id' in part)); assert.equal(w.items[0].system.quantity, 3)
const rest = W.wagonTake(w, w.items[0]._id, 99)
assert.equal(rest.system.quantity, 3); assert.equal(w.items.length, 2, 'узяв усе — рядок зник')
assert.equal(W.wagonTake(w, 'нема', 1), null)
assert.ok(W.canSee({ users: [] }, 'u1') && W.canSee({ users: ['u1'] }, 'u1') && !W.canSee({ users: ['u2'] }, 'u1') && W.canSee({ users: ['u2'] }, 'u1', true))
console.log('✓ візки: стос, взяти частину, вага, хто бачить')
