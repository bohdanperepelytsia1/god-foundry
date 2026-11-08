/** Синхронізація поточних ресурсів із максимумом — на моках хуків Foundry */
import assert from 'node:assert/strict'
const hooks = {}
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f) }
const call = (n, ...a) => (hooks[n] ?? []).forEach(f => f(...a))
globalThis.Actor = class {}
globalThis.game = { user: { id: 'me' } }
globalThis.foundry = { utils: { getProperty: (o, p) => p.split('.').reduce((x, k) => x?.[k], o) } }
const { registerResourceSync } = await import('../god/module/resource-sync.mjs')
registerResourceSync()

class A extends Actor {
  constructor() { super(); this.type = 'character'; this.uuid = 'Actor.a'; this.flags = {}; this.updates = []
    this.system = { resources: { hp: { value: 150, max: 300 }, pr: { value: 10, max: 40 }, mr: { value: 0, max: 0 } } } }
  getFlag(s, k) { return this.flags[k] }
  async update(u, o) {
    this.updates.push(u)
    for (const [p, v] of Object.entries(u)) {
      if (p.startsWith('flags.god.resDebt.')) { (this.flags.resDebt ??= {})[p.split('.').pop()] = v; continue }
      const [, , k] = p.split('.'); this.system.resources[k].value = v
    }
  }
}
const tick = () => new Promise(r => setTimeout(r, 5))
const a = new A()

// Стат зріс: макс HP 300 → 315
let opt = {}
call('preUpdateActor', a, { system: { stats: { con: { value: 31.5 } } } }, opt)
a.system.resources.hp.max = 315
call('updateActor', a, {}, opt, 'me'); await tick()
assert.equal(a.system.resources.hp.value, 165, 'HP +15')

// Зняв розбиту броню (10/40 → макс 0) і вдягнув назад — без безкоштовного ремонту
const item = { parent: a }
opt = {}; call('preUpdateItem', item, {}, opt); a.system.resources.pr.max = 0; call('updateItem', item, {}, opt, 'me'); await tick()
assert.equal(a.system.resources.pr.value, 0); assert.equal(a.flags.resDebt.pr, 30)
opt = {}; call('preUpdateItem', item, {}, opt); a.system.resources.pr.max = 40; call('updateItem', item, {}, opt, 'me'); await tick()
assert.equal(a.system.resources.pr.value, 10, 'повернулось 10/40'); assert.equal(a.flags.resDebt.pr, 0)

// Заміна броні двома оновленнями одним запитом: −40 і +50 → разом +10
opt = {}
call('preUpdateItem', item, {}, opt); call('preUpdateItem', item, {}, opt)
a.system.resources.pr.max = 50
call('updateItem', item, {}, opt, 'me'); call('updateItem', item, {}, opt, 'me'); await tick()
assert.equal(a.system.resources.pr.value, 20, 'разом +10')

// Явно задане значення в тому ж оновленні — не чіпаємо
opt = {}
call('preUpdateActor', a, { system: { resources: { hp: { value: 100 } } } }, opt)
a.system.resources.hp.value = 100; a.system.resources.hp.max = 330
const n = a.updates.length
call('updateActor', a, {}, opt, 'me'); await tick()
assert.equal(a.updates.length, n, 'без зайвого оновлення'); assert.equal(a.system.resources.hp.value, 100)

// Чужий клієнт не пише
opt = {}
call('preCreateItem', item, {}, opt, 'me'); a.system.resources.mr.max = 20
call('createItem', item, opt, 'other'); await tick()
assert.equal(a.system.resources.mr.value, 0, 'інший користувач — нічого')
// Порожнє оновлення без post-хука не ламає наступні
call('preUpdateItem', item, {}, {})
opt = {}; call('preUpdateItem', item, {}, opt); a.system.resources.pr.max = 60; call('updateItem', item, {}, opt, 'me'); await tick()
assert.equal(a.system.resources.pr.value, 30, 'після «порожньої» операції все одно +10')

// Дві операції в польоті з однаковим знімком — різниця не подвоюється
const o1 = {}, o2 = {}
call('preUpdateItem', item, {}, o1); call('preUpdateItem', item, {}, o2)
a.system.resources.pr.max = 70; call('updateItem', item, {}, o1, 'me'); await tick()
a.system.resources.pr.max = 80; call('updateItem', item, {}, o2, 'me'); await tick()
assert.equal(a.system.resources.pr.value, 50, '+10 і ще +10, а не +30')
console.log('✓ синхронізація поточних ресурсів з максимумом (7 сценаріїв)')
