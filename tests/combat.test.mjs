/** Бойовка: ціль обов'язкова, урон лише коли попадання > ШУ; НІП як повноцінний актор */
import assert from 'node:assert/strict'

// ── моки Foundry ──
let nextTotals = []
const rolled = []
globalThis.Roll = class { constructor(f, d) { this.formula = f; rolled.push(f) }
  async evaluate() { const t = nextTotals.shift() ?? 10; this.total = t; this.dice = [{ faces: 20, total: t, results: [{ result: t, active: true }] }]; return this } }
const cards = [], warns = []
const msgs = []
globalThis.ChatMessage = { getSpeaker: () => ({}), applyRollMode: () => {}, create: async d => { cards.push(d.content); msgs.push(d); return d } }
globalThis.CONFIG = { sounds: { dice: '' } }
globalThis.ui = { notifications: { warn: m => warns.push(m), info: () => {} } }
let dialogAnswer = {}
globalThis.foundry = { applications: { api: { DialogV2: { wait: async ({ content, buttons }) => {
  globalThis.lastDialog = content
  const form = { elements: Object.fromEntries(Object.entries(dialogAnswer).map(([k, v]) => [k, { value: v, checked: !!v }])), querySelector: () => ({ value: 'norm' }) }
  return buttons[0].callback(null, { form })
} } } } }
const targets = []
const mkToken = (id, name, dodge) => ({ id, name, center: { x: 0, y: 0 }, visible: true, document: { uuid: `Scene.s.Token.${id}` }, actor: { system: { derived: { dodge } } } })
const goblin = mkToken('g', 'Гоблін', 8), ogre = mkToken('o', 'Огр', 3)
globalThis.canvas = { ready: true, tokens: { placeables: [goblin, ogre] }, grid: { measurePath: () => ({ distance: 2 }) } }
globalThis.game = { settings: { get: () => 'publicroll' }, user: { targets: new Set(targets), isGM: true } }
globalThis.fromUuidSync = uuid => { const t = [goblin, ogre].find(t => t.document.uuid === uuid); return t && { name: t.name, actor: t.actor, object: null } }

const { weaponAttack, weaponDamage, targetChoices } = await import('../god/module/dice/rolls.mjs')
/** Попадання; якщо влучив — окремий кидок урону з кнопки картки */
const attack = async (a, w, o) => { const n = cards.length; await weaponAttack(a, w, o); const st = cards.length > n && msgs.at(-1).flags?.god?.attack; if (st) await weaponDamage(a, w, st) }

const hero = {
  type: 'character', img: 'h.png', getActiveTokens: () => [],
  system: { stats: { str: { value: 30 }, int: { value: 20 } }, combat: {}, skill: () => 3 },
}
const sword = { name: 'Меч', img: 's.png', system: { category: 'onehand', phys: 30, mag: 0, hand: 'main' } }

// Порядок цілей: позначена першою
game.user.targets = new Set([{ id: 'o' }])
assert.deepEqual(targetChoices(hero).map(t => t.name), ['Огр', 'Гоблін'])
game.user.targets = new Set()

// Однакові імена — з номерами
const g2 = mkToken('g2', 'Гоблін', 5)
canvas.tokens.placeables = [goblin, g2, ogre]
assert.deepEqual(targetChoices(hero).map(t => t.label).sort(), ['Гоблін #1', 'Гоблін #2', 'Огр'])
canvas.tokens.placeables = [goblin, ogre]

// 1. Без цілі в діалозі — атака не відбувається
dialogAnswer = { target: '', dir: 'front', hitMod: 3, dmgMod: 1 }
await weaponAttack(hero, sword)
assert.equal(cards.length, 0); assert.match(warns.pop(), /ціль/i)
assert.ok(lastDialog.includes('type="radio" name="target"') && lastDialog.includes('Гоблін') && lastDialog.includes('<b>8</b> ШУ'), 'список цілей у діалозі')
assert.ok(!/Token\.\w+" checked/.test(lastDialog), 'без позначеної цілі нічого не обрано наперед')

// 2. Попадання 8 проти ШУ 8 — промах (треба більше), урон не кидається
rolled.length = 0; nextTotals = [8]
dialogAnswer = { target: goblin.document.uuid, dir: 'front', hitMod: 0, dmgMod: 0 }
await weaponAttack(hero, sword)
assert.equal(rolled.length, 1, 'лише кидок попадання')
assert.ok(cards.at(-1).includes('Промах') && !cards.at(-1).includes('data-god-apply'), 'промах без урону')

// 3. Попадання 9 > 8 — урон з кнопкою на ціль
rolled.length = 0; nextTotals = [9, 15]
await weaponAttack(hero, sword)
assert.equal(rolled.length, 1, 'спершу лише попадання')
assert.ok(cards.at(-1).includes('data-god-damage') && !cards.at(-1).includes('data-god-apply'), 'кнопка «Кинути урон», урону ще немає')
const st3 = msgs.at(-1).flags.god.attack
assert.equal(st3.target, goblin.document.uuid)
await weaponDamage(hero, sword, st3)
assert.equal(rolled.length, 2, 'урон — окремим кидком')
assert.ok(cards.at(-2).includes('Влучання') && cards.at(-1).includes(`data-target="${goblin.document.uuid}"`) && cards.at(-1).includes('→ Гоблін'), 'урон на ціль')

// 3а. Натуральна 20 проти ШУ 30 — гарантований крит, навіть якщо кидок урону слабкий
ogre.actor.system.derived.dodge = 30
rolled.length = 0; nextTotals = [20, 4]
dialogAnswer = { target: ogre.document.uuid, dir: 'back', hitMod: 0, dmgMod: 0 }
await attack(hero, sword)
assert.ok(rolled[0].startsWith('2d20kh'), 'з тилу — попадання з перевагою')
assert.ok(cards.at(-2).includes('Гарантовано') && cards.at(-1).includes('Критичний урон'), 'гарантований крит')
assert.ok(cards.at(-1).includes('тил +2'), 'тил: +2 до урону видно в картці урону')
ogre.actor.system.derived.dodge = 3

// 3б. Урон 18 → 100% із ШАНСОМ на крит; 1d4 = 3 → крит
rolled.length = 0; nextTotals = [10, 18, 3]
dialogAnswer = { target: goblin.document.uuid, dir: 'front', hitMod: 0, dmgMod: 0 }
await attack(hero, sword)
assert.deepEqual(rolled.slice(-1), ['1d4'], 'ШАНС кидається окремо')
assert.ok(cards.at(-1).includes('Спрацював') && cards.at(-1).includes('Критичний урон'), 'ШАНС підняв до криту')

// 3в. Натуральна 1 — промах навіть із модом +30
rolled.length = 0; nextTotals = [1]
dialogAnswer = { target: goblin.document.uuid, dir: 'front', hitMod: 30, dmgMod: 0 }
await weaponAttack(hero, sword)
assert.equal(rolled.length, 1); assert.ok(cards.at(-1).includes('Промах'))

// 4. Порожня сцена — попередження без діалогу
canvas.tokens.placeables = []
await weaponAttack(hero, sword)
assert.match(warns.pop(), /немає цілей/)
console.log('✓ бойовка: ціль, попадання > ШУ, сітка попадання 1/17–20, ШАНС, позиції')
// 5. Тіньовий удар (легка, 4 рівень): без кидка попадання, −20 ВС, при уроні 17+ — ШАНС на крит
canvas.tokens.placeables = [goblin, ogre]
const updates = []
const rogue = { ...hero, system: { ...hero.system, skill: () => 4, resources: { ed: { value: 100 } } }, update: async u => updates.push(u) }
const dagger = { name: 'Кинджал', img: 'd.png', system: { category: 'light', phys: 10, mag: 0, hand: 'main' } }
goblin.actor.system.resources = { pr: { value: 0 }, mr: { value: 0 } }
rolled.length = 0; nextTotals = [17, 3]
dialogAnswer = { target: goblin.document.uuid, dir: 'front', ability: 'shadow', hitMod: 0, dmgMod: 0 }
await attack(rogue, dagger)
assert.deepEqual(updates.at(-1), { 'system.resources.ed.value': 80 }, 'витривалість списано')
assert.equal(rolled[0], '1d20 + @m', 'перший кидок — уже урон')
assert.ok(cards.at(-2).includes('автоматично') && cards.at(-2).includes('data-god-damage'), 'картка попадання без кидка')
assert.ok(cards.at(-1).includes('Тіньовий удар') && cards.at(-1).includes('Критичний урон'), 'крит від тіньового удару')
assert.ok(cards.at(-1).includes('data-god-defend'), 'кнопка «Захист»')
// Без витривалості — не б'є
rogue.system.resources.ed.value = 5; const before = cards.length
await weaponAttack(rogue, dagger)
assert.equal(cards.length, before); assert.match(warns.pop(), /ВС/)
console.log('✓ здібності зброї: тіньовий удар, витривалість, кнопка захисту')
// 6. Крити: оголошуються до кидка, списуються, +N до роллу; вдача — перевага без від'ємних модифікаторів
const ups = []
const lucky = { ...hero, uuid: 'Actor.lucky', system: { ...hero.system, reputation: { crits: 5, luck: 2 }, resources: { ed: { value: 100 } } },
  update: async u => { ups.push(u); if ('system.reputation.crits' in u) lucky.system.reputation.crits = u['system.reputation.crits'] } }
rolled.length = 0; nextTotals = [12, 15]
dialogAnswer = { target: goblin.document.uuid, dir: 'front', hitMod: -2, dmgMod: 1, critHit: 3 }
await weaponAttack(lucky, sword)
assert.ok(lastDialog.includes('Крити на попадання') && !lastDialog.includes('Крити на урон'), 'на попадання — крити до кидка попадання')
assert.deepEqual(ups[0], { 'system.reputation.crits': 2 })
assert.equal(rolled[0], '1d20 + @m + @c')
const hitMsg = msgs.at(-1), rp = hitMsg.flags.god.replay
assert.equal(rp.fn, 'weapon'); assert.equal(rp.preset.critHit, 3)
// урон: крити оголошуються вже перед кидком урону
dialogAnswer = { crits: 9 }
await weaponDamage(lucky, sword, hitMsg.flags.god.attack)
assert.deepEqual(ups.at(-1), { 'system.reputation.crits': 0 }, 'на урон — скільки лишилось (2)')
assert.equal(msgs.at(-1).flags.god.replay.preset.crits, 2)
// перекидання попадання вдачею: без діалогу, перевага, −2 відкидається, крити не списуються вдруге
rolled.length = 0; nextTotals = [12, 15]; ups.length = 0
await weaponAttack(lucky, sword, { luck: true, preset: rp.preset })
assert.equal(rolled.length, 1); assert.ok(rolled[0].startsWith('2d20kh'), 'перевага')
assert.ok(cards.at(-1).includes('Вдача') && cards.at(-1).includes('куб 12 +3'), 'від\'ємна ручна правка відкинута, прицільність лишилась')
assert.equal(ups.length, 0, 'нічого не списано вдруге')
// натуральна 1 — крити згорають
rolled.length = 0; nextTotals = [1]; lucky.system.reputation.crits = 4
dialogAnswer = { target: goblin.document.uuid, dir: 'front', hitMod: 0, dmgMod: 0, critHit: 4 }
await weaponAttack(lucky, sword)
assert.ok(cards.at(-1).includes('згоріли') && cards.at(-1).includes('Промах'))
console.log('✓ крити і вдача: списання, +N, натуральна 1, перекидання з перевагою')



// ── НІП: дані ──
class Field { constructor(o = {}) { this.o = o } }
class SchemaField extends Field { constructor(fields) { super(); this.fields = fields } }
foundry.data = { fields: { NumberField: Field, StringField: Field, BooleanField: Field, HTMLField: Field, SchemaField, ObjectField: Field, ArrayField: Field } }
foundry.abstract = { TypeDataModel: class { static migrateData(s) { return s } } }
const { NpcData } = await import('../god/module/data/actor.mjs')
const src = { resources: { pr: { value: 20, max: 20 }, mr: { value: 0, max: 5 } } }
NpcData.migrateData(src)
assert.deepEqual(src.resources.pr, { value: 20, base: 20 }, 'старий max → база')
const build = s => Object.fromEntries(Object.entries(s).map(([k, f]) => [k, f instanceof SchemaField ? build(f.fields) : f.o.initial]))
const npc = Object.assign(Object.create(NpcData.prototype), build(NpcData.defineSchema()))
npc.resources.pr.base = 10; npc.attack.skillLvl = 4; npc.attack.hitMod = 2
npc.parent = { items: [{ type: 'armor', system: { equipped: true, phys: 30, mag: 5, weight: 5, quantity: 1, location: 'main' } }] }
npc.prepareDerivedData()
assert.equal(npc.resources.pr.max, 40, 'PR = природна 10 + броня 30'); assert.equal(npc.resources.mr.max, 5)
assert.equal(npc.skill('Одноручна'), 4, 'володіння зброєю → skillLvl')
assert.equal(npc.skill('Прицільність_легка_та_одноручна'), 2, 'влучність → hitMod')
assert.equal(npc.stats.str.mod !== undefined, true, 'модифікатори характеристик')
console.log('✓ НІП: природна броня + броня з предметів, володіння, міграція')
