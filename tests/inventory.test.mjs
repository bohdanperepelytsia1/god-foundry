/** Інвентар: фільтри, сортування, розділи, вибір, інспектор — на моках предметів */
import assert from 'node:assert/strict'
globalThis.game = { i18n: { localize: k => k.split('.').pop() } }
const { buildInventory, inspectItem, newInventoryState } = await import('../god/module/sheets/inventory.mjs')

let n = 0
const mk = (id, type, name, system, extra = {}) => {
  const s = { quantity: 1, weight: 1, location: 'main', price: {}, ...system }
  return { id, type, name, img: 'x', sort: n++ * 100, system: s, isPhysical: type !== 'spell', effects: [],
    get totalWeight() { return Math.round(s.weight * (s.quantity ?? 1) * 100) / 100 }, ...extra }
}
const items = [
  mk('w', 'weapon', 'Меч', { category: 'onehand', phys: 30, mag: 0, hand: 'main', equipped: true, weight: 2.5 }),
  mk('a', 'armor', 'Кольчуга', { slot: 'Кираса', armorClass: 'medium', phys: 20, mag: 0, weight: 8 }),
  mk('p', 'gear', 'Зілля лікування', { consumable: true, restore: { hp: 50 }, quantity: 3, weight: 0.2, location: 'potions', price: { gold: 2 } }),
  mk('r', 'gear', 'Ангельський пил', { quantity: 10, weight: 0.01, isMagic: true }),
  mk('s', 'spell', 'Вогонь', {}),
]
const actor = { items: Object.assign(items, { has: id => items.some(i => i.id === id), get: id => items.find(i => i.id === id) }),
  system: { derived: { belt: { used: 0, slots: 2 } }, stats: { str: { value: 30 }, int: { value: 20 } }, skill: () => 3 } }

const st = newInventoryState()
let inv = buildInventory(actor, st)
assert.equal(st.selected, 'w', 'першим обрано перший предмет')
assert.deepEqual(inv.sections.map(s => s.loc), ['main', 'belt', 'potions'], 'порожні розділи сховано, пояс зі слотами лишається')
assert.equal(inv.total, 4, 'заклинання не в інвентарі')
assert.equal(inv.sections[0].rows.find(r => r.id === 'a').sub, 'Кираса · PR 20')
assert.equal(inv.sections[2].rows[0].sub, 'HP +50')
assert.equal(inv.types.find(t => t.id === 'consumable').count, 1)

st.type = 'consumable'; inv = buildInventory(actor, st)
assert.deepEqual(inv.sections.flatMap(s => s.rows.map(r => r.id)), ['p'], 'фільтр «Розхідне»')
assert.equal(inv.sections.find(s => s.loc === 'main').count, 0, 'основний розділ лишається, хоч і порожній')
st.type = 'all'; st.sort = 'weight'; inv = buildInventory(actor, st)
assert.deepEqual(inv.sections[0].rows.map(r => r.id), ['a', 'w', 'r'], 'найважчі зверху')
st.sort = 'name'; inv = buildInventory(actor, st)
assert.deepEqual(inv.sections[0].rows.map(r => r.name), ['Ангельський пил', 'Кольчуга', 'Меч'], 'за абеткою (укр.)')

const changeLabel = k => k
const enrich = async h => h ?? ''
const pi = await inspectItem(actor, items[2], { enrich, changeLabel })
assert.equal(pi.useLabel, 'Використати'); assert.equal(pi.canSplit, true)
assert.deepEqual(pi.restore.map(r => `${r.abbr} ${r.sign}${r.value}`), ['HP +50'])
assert.ok(pi.stats.some(s => s.value === '0.2 × 3 = 0.6 кг') && pi.stats.some(s => s.label === 'Ціна' && s.value === '2 з'), 'вага стосу й ціна')
const wi = await inspectItem(actor, items[0], { enrich, changeLabel })
assert.equal(wi.stats[0].value, '180 фіз', '100% урону: СИЛ 30×5 + 30')
assert.equal(wi.useLabel, 'Атакувати')
console.log('✓ інвентар: розділи, фільтр, сортування, інспектор')
