/** Бойовка: ціль обов'язкова, урон лише коли попадання > ШУ; НІП як повноцінний актор */
import assert from 'node:assert/strict'

// ── моки Foundry ──
let nextTotals = []
const rolled = []
globalThis.Roll = class { constructor(f, d) { this.formula = f; rolled.push(f) }
  async evaluate() { const t = nextTotals.shift() ?? 10; this.total = t; this.dice = [{ faces: 20, total: t, results: [{ result: t, active: true }] }]; return this } }
const cards = [], warns = []
globalThis.ChatMessage = { getSpeaker: () => ({}), applyRollMode: () => {}, create: async d => { cards.push(d.content); return d } }
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

const { weaponAttack, targetChoices } = await import('../god/module/dice/rolls.mjs')

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
dialogAnswer = { target: '', hitMod: 3, dmgMod: 1 }
await weaponAttack(hero, sword)
assert.equal(cards.length, 0); assert.match(warns.pop(), /ціль/i)
assert.ok(lastDialog.includes('type="radio" name="target"') && lastDialog.includes('Гоблін') && lastDialog.includes('<b>8</b> ШУ'), 'список цілей у діалозі')
assert.ok(!/Token\.\w+" checked/.test(lastDialog), 'без позначеної цілі нічого не обрано наперед')

// 2. Попадання 8 проти ШУ 8 — промах (треба більше), урон не кидається
rolled.length = 0; nextTotals = [8]
dialogAnswer = { target: goblin.document.uuid, hitMod: 0, dmgMod: 0 }
await weaponAttack(hero, sword)
assert.equal(rolled.length, 1, 'лише кидок попадання')
assert.ok(cards.at(-1).includes('Промах') && !cards.at(-1).includes('data-god-apply'), 'промах без урону')

// 3. Попадання 9 > 8 — урон з кнопкою на ціль
rolled.length = 0; nextTotals = [9, 12]
await weaponAttack(hero, sword)
assert.equal(rolled.length, 2, 'попадання + урон')
assert.ok(cards.at(-1).includes('Влучання') && cards.at(-1).includes(`data-target="${goblin.document.uuid}"`) && cards.at(-1).includes('→ Гоблін'), 'урон на ціль')

// 4. Порожня сцена — попередження без діалогу
canvas.tokens.placeables = []
await weaponAttack(hero, sword)
assert.match(warns.pop(), /немає цілей/)
console.log('✓ бойовка: ціль обов\'язкова, урон лише при попаданні > ШУ, кнопка урону на ціль')

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
