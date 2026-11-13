/**
 * Smoke-тест без Foundry: мінімальні моки API, щоб прогнати схеми, похідні дані
 * персонажа і рендер усіх шаблонів реальним Handlebars.
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(process.env.HBS_DIR ? process.env.HBS_DIR + '/' : import.meta.url)
const Handlebars = require('handlebars')

// ── моки Foundry ──
class Field { constructor(o = {}) { this.o = o } }
class SchemaField extends Field { constructor(fields) { super(); this.fields = fields } }
class ObjectField extends Field {}
class ArrayField extends Field { constructor(el, o) { super(o) } }
globalThis.foundry = {
  data: { fields: { NumberField: Field, StringField: Field, BooleanField: Field, HTMLField: Field, SchemaField, ObjectField, ArrayField } },
  abstract: { TypeDataModel: class { static migrateData(s) { return s } } },
  applications: { api: { HandlebarsApplicationMixin: B => B, DialogV2: {} }, sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} } },
}
globalThis.Actor = class {}; globalThis.Item = class {}

const { CharacterData } = await import('../god/module/data/actor.mjs')
const { WeaponData, ArmorData, SpellData, TraitData } = await import('../god/module/data/item.mjs')
const { GOD } = await import('../god/module/config.mjs')

// Будуємо джерело з initial-значень схеми
const build = schema => Object.fromEntries(Object.entries(schema).map(([k, f]) =>
  [k, f instanceof SchemaField ? build(f.fields) : f instanceof ArrayField ? [] : f instanceof ObjectField ? {} : f.o.initial]))

const sch = CharacterData.defineSchema()
assert.equal(sch.skills.fields.combat.fields['Ухиляння'].o.max, 6, 'max вміння в схемі')
const sys = Object.assign(Object.create(CharacterData.prototype), build(sch))
sys.stats.str.value = 30; sys.stats.int.value = 45; sys.stats.wis.value = 60; sys.stats.end.value = 20
sys.resources.ed.value = 200
sys.skills.combat['Ухиляння'] = 2
sys.skills.combat['Спринт'] = 1
sys.skills.neutral['Мул'] = 2
sys.combat.dodgeBonus = -1
const item = (type, s) => ({ type, system: { quantity: 1, location: 'main', ...s } })
sys.parent = { items: [
  item('armor', { equipped: true, slot: 'Кираса', phys: 40, mag: 10, weight: 3 }),
  item('armor', { equipped: true, slot: 'Рюкзак', bagBonus: 15, weight: 1 }),
  item('weapon', { equipped: true, weight: 1, spellStatMult: true }),
  item('gear', { weight: 0.5, quantity: 4, location: 'belt' }),
] }
sys.prepareDerivedData()
const d = sys.derived
assert.equal(sys.stats.int.mod, 3)
assert.equal(sys.resources.ed.max, 200, 'ED = ВИТ·10')
assert.equal(sys.resources.pr.max, 40)
assert.equal(d.equippedWeight, 5); assert.equal(d.totalWeight, 7)
assert.equal(d.dodgeAuto, 8 + 2, 'навантаження 5 ≤ 25% бази 20 → 8, +Ухиляння 2')

assert.equal(d.dodge, 10, 'без класу обладунку +1 ШУ, правка майстра −1')
assert.equal(d.speed, 4); assert.equal(d.initiative, 2)
assert.equal(d.maxWeight, 20 + 2 * 5 + 15, 'база + Мул + рюкзак')
assert.equal(d.belt.used, 1); assert.equal(d.spellStatMult, true)
assert.equal(sys.skill('Ухиляння'), 2); assert.equal(sys.skill('нема'), 0)
// фіксація: вкачане понад зафіксоване — незафіксований розвиток
sys.floors.skills = { 'Ухиляння': 2, 'Спринт': 1, 'Мул': 2 }
sys.floors.stats = Object.fromEntries(Object.entries(sys.stats).map(([k, s]) => [k, s.value]))
assert.equal(sys.hasPendingBuild, false, 'усе зафіксовано')
sys.skills.combat['Легка'] = 1
assert.equal(sys.hasPendingBuild, true, 'нове вміння — не зафіксоване')
sys.skills.combat['Легка'] = 0
sys.customSkills = [{ id: 'x1', name: 'Кров', cat: 'magic', cost: 5, max: 10, lvl: 2, floor: 1 }]
assert.equal(sys.skill('custom:x1'), 2); assert.equal(sys.hasPendingBuild, true)
assert.equal((CharacterData.migrateData ?? (s=>s))({ reputation: { status_val: 7 } }).reputation.status, 7, 'міграція status_val')
console.log('✓ похідні дані, фіксація, особливі вміння, міграція')

for (const M of [WeaponData, ArmorData, SpellData, TraitData]) M.defineSchema()
console.log('✓ схеми предметів')

// ── рендер усіх шаблонів ──
Handlebars.registerHelper('god-signed', n => (Number(n) >= 0 ? `+${n}` : `${n}`))
Handlebars.registerHelper('god-eq', (a, b) => a === b)
Handlebars.registerHelper('god-or', (...a) => a.slice(0, -1).some(Boolean))
Handlebars.registerHelper('checked', v => v ? 'checked' : '')
Handlebars.registerHelper('selectOptions', (choices, o) => new Handlebars.SafeString(
  Object.entries(choices || {}).map(([k, v]) => `<option value="${k}" ${k === o.hash.selected ? 'selected' : ''}>${v}</option>`).join('')))
Handlebars.registerPartial('god-row', readFileSync('god/templates/partials/row.hbs', 'utf8'))
Handlebars.registerPartial('god-skill-controls', readFileSync('god/templates/partials/skill-controls.hbs', 'utf8'))
Handlebars.registerPartial('god-res', readFileSync('god/templates/partials/res.hbs', 'utf8'))
Handlebars.registerPartial('god-weapon-card', readFileSync('god/templates/partials/weapon-card.hbs', 'utf8'))
Handlebars.registerPartial('god-effect-card', readFileSync('god/templates/partials/effect-card.hbs', 'utf8'))
Handlebars.registerHelper('and', (...a) => a.slice(0, -1).every(Boolean))
Handlebars.registerHelper('or', (...a) => a.slice(0, -1).some(Boolean))
Handlebars.registerHelper('god-array', (...a) => { const r = a.slice(0, -1), o = []; for (let i = 0; i < r.length; i += 3) o.push({ key: r[i], label: r[i + 1], icon: r[i + 2] }); return o })

sys.details = { race: 'Людина', origin: 'Північ', age: '30' }
sys.progress = { xp: 120, skillPoints: 4, statPoints: 2 }
const row = (type, system, extra = {}) => ({ id: 'i' + type, name: 'Тест ' + type, img: 'x.svg', type, weight: 1, search: 'тест',
  tags: [{ icon: 'fa-sparkles', cls: 'magic', tip: 'Магічний' }], equippable: ['weapon', 'armor'].includes(type),
  system: { description: '', price: {}, location: 'main', quantity: 1, ...system }, ...extra })
const sword = row('weapon', { equipped: true, phys: 20, hand: 'main' }, { base: { phys: 170, mag: 15 }, category: 'Одноручна', dmgTip: 't', rollTip: 'r', table: [{ tier: 'crit', label: 'Крит', pct: 150, phys: 255, mag: 22 }] })
const base = {
  actor: { name: 'Герой', img: 'a.png' }, system: sys, config: GOD, isGM: true, editable: true, tabActive: true,
  expandedDesc: { iweapon: '<p>опис меча</p>' },
  tabs: [{ id: 'overview', label: 'Огляд', icon: 'x', active: true }],
  resources: [{ key: 'hp', label: 'HP', abbr: 'HP', value: 5, max: 10, bonus: 0, pct: 50, tip: 't' }],
  armorRes: [{ key: 'pr', abbr: 'PR', value: 3, max: 40, pct: 7, tip: 't' }],
  dodgeTip: 'ШУ', xpPct: 40,
  money: Object.entries(GOD.MONEY).map(([key, m]) => ({ key, ...m, value: 3 })),
  stances: [{ id: 'neutral', label: 'Нейтр.', title: 't', active: true }, { id: 'attack', label: 'Атака', title: 't', active: false }],
  stats: Object.entries(GOD.STATS).map(([key, cfg]) => ({ key, ...cfg, value: 15, mod: 1 })),
  equippedWeapons: [sword],
  readySpells: [row('spell', {}, { school: 'Вогонь', castable: true })],
  effectsActive: [{ id: 'e1', name: 'Атакуюча стійка', img: 'x', disabled: false, isStance: true, changes: 'урон +2' }],
  effectsOff: [{ id: 'e2', name: 'Отрута', img: 'x', disabled: true, changes: 'HP −5' }],
  onlyLearned: false,
  pendingBuild: true, customCats: { magic: 'Магія' },
  skillCats: [
    { cat: 'combat', label: 'Бойові', open: true, learned: 2, total: 3, invested: 13, collapsed: false, gateName: 'Бойові навички',
      gate: { key: 'Бойові_навички', name: 'Бойові навички', lvl: 1, max: 1, maxed: true, search: 'бой', pips: [{ on: true, fixed: true }], fixed: true, upTip: 'u', downTip: 'd' },
      skills: [
        { key: 'Спринт', name: 'Спринт', info: 'Кожен рівень — +1 клітинка', lvl: 1, max: 2, next: 10, maxed: false, search: 'спринт', pips: [{ on: true, fixed: false }, { on: false }], upTip: 'u', downTip: 'd' },
        { key: 'custom:x1', id: 'x1', custom: true, name: 'Кров', cost: 5, max: 10, lvl: 0, next: 5, search: 'кров', pips: [], upTip: 'u', downTip: '' }] },
    { cat: 'social', label: 'Соціальні', open: false, learned: 0, total: 15, invested: 0, collapsed: false, gateName: 'Говорливість',
      gate: { key: 'Говорливість', name: 'Говорливість', lvl: 0, max: 1, next: 4, search: 'гов', pips: [{ on: false }], upTip: 'u', downTip: '' },
      skills: [{ key: 'Флірт', name: 'Флірт', lvl: 0, max: 10, next: 3, locked: true, search: 'флірт', pips: [], upTip: 'u', downTip: '' }] }],
  traits: [row('trait', { cost: '+3', kind: 'trait' })], quirks: [row('trait', { cost: '−2', kind: 'quirk' })],
  knowledge: { languages: [{ name: 'Загальна', level: 'рідна', index: 0 }], recipes: [{ name: 'Еліксир', source: 'книга', desc: 'опис', index: 0 }], tech: [] },
  reputation: Object.entries(GOD.REPUTATION).map(([key, r]) => ({ key, ...r, value: 2 })),
  slots: [{ slot: 'Кираса', label: 'Кираса', item: row('armor', { phys: 40, mag: 0, equipped: true }) }, { slot: 'Шолом', label: 'Шолом', item: null }],
  sections: [
    { loc: 'main', label: 'Загальне', icon: 'fa-sack', count: 2, weight: 2, rows: [
      { id: 'iweapon', name: 'Меч', img: 'x', type: 'weapon', sub: 'Одноручна · 20 фіз', tags: [], qty: 1, showQty: false, weight: 1, equipped: true, equippable: true, usable: true, selected: true, search: 'меч' },
      { id: 'igear', name: 'Зілля', img: 'x', type: 'gear', sub: 'HP +50', tags: [], qty: 3, showQty: true, weight: 0.6, usable: true, search: 'зілля' }] },
    { loc: 'belt', label: 'Пояс', icon: 'fa-grip-lines', count: 0, weight: 0, slots: '0/3', rows: [], collapsed: true }],
  types: [{ id: 'all', label: 'Усе', icon: 'x', active: true, count: 2 }, { id: 'consumable', label: 'Розхідне', icon: 'x', count: 1 }],
  sorts: { manual: 'Свій порядок', name: 'За назвою' }, sort: 'manual', total: 2, equipOpen: true,
  inspect: { id: 'igear', name: 'Зілля', img: 'x', typeLabel: 'Предмет', kicker: 'HP +50', tags: [], qty: 3, location: 'potions', consumable: true,
    useLabel: 'Використати', useIcon: 'fa-flask', canSplit: true, stats: [{ label: 'Вага', value: '0.2 × 3 = 0.6 кг' }],
    restore: [{ key: 'hp', abbr: 'HP', value: 50, sign: '+' }], effects: [{ name: 'Тепло', img: 'x', changes: 'ШУ +1', off: true, note: 'вимкнено' }], description: '<p>Червона рідина</p>' },
  locationOptions: GOD.INVENTORY_LOCATIONS, weightPct: 20, beltOver: false,
  castDice: 3, learnedSchools: [{ key: 'fire', label: 'Вогонь', lvl: 4, die: 8 }],
  schools: [{ key: 'fire', label: 'Вогонь', lvl: 4, die: 8 }, { key: 'air', label: 'Повітря', lvl: 0, die: 0 }],
  spells: [row('spell', { threshold: 6, manaCost: 100, staminaCost: 0 }, { school: 'Вогонь', castable: true, castDice: '3d8', expectDmg: 400 })],
  abilities: [row('ability', { manaCost: 5, cooldown: '1 хід' })],
  biography: '<p>bio</p>', notes: '<p>notes</p>',
  items: [sword, row('gear', {})],
}
const dir = 'god/templates/actor'
for (const editMode of [false, true]) {
  for (const f of readdirSync(dir)) {
    const ctx = { ...base, editMode }
    if (f.startsWith('npc')) { ctx.system = { ...sys, dodge: 5, speed: 3, initiative: 1, attack: { name: 'Укус', hitMod: 2, damageMod: 1, skillLvl: 3, phys: 40, mag: 0 } };
      ctx.isNpc = true
      ctx.resources = [{ key: 'hp', abbr: 'HP', value: 50, max: 100, pct: 50 }]
      ctx.armorRes = [{ key: 'pr', abbr: 'PR', value: 30, max: 40, base: 10, pct: 75 }, { key: 'mr', abbr: 'MR', value: 0, max: 0, base: 0, pct: 0 }]
      ctx.foeStats = [{ label: 'PD', path: 'system.attack.phys', value: 40, min: true, cls: 'phys', tip: 't' }, { label: 'ШУ', path: 'system.dodge', value: 5, shown: 6, shownTip: 't' }]
      ctx.hitTotal = 2
      ctx.dmgCols = [10, 25, 50, 75, 100, 150].map(pct => ({ pct, tip: 't' }))
      ctx.dmgRows = [{ label: 'PD', cls: 'phys', tip: 't', values: [4, 10, 20, 30, 40, 60] }] }
    const html = Handlebars.compile(readFileSync(`${dir}/${f}`, 'utf8'), { strict: false })(ctx)
    assert.ok(/^<(\w[\w-]*)/.test(html.trim()), `${f}: порожній вивід`)
    const roots = html.trim().match(/^<(\w+)/)[1]
    assert.ok(html.trim().endsWith(`</${roots}>`), `${f}: має бути один кореневий елемент`)
    if (f === 'gear.hbs') {
      assert.equal((html.match(/class="god-inv-row /g) || []).length, 2, 'рядки інвентаря')
      assert.ok(html.includes('god-inv-row god-inv-weapon selected equipped'), 'обраний і одягнений рядок')
      assert.ok(html.includes('data-drop-location="belt"') && html.includes('0/3 сл.'), 'розділ пояса зі слотами')
      assert.ok(html.includes('god-inv-sec collapsed'), 'згорнутий розділ')
      assert.ok(html.includes('data-action="invType" data-type="consumable"'), 'фільтр за типом')
      assert.ok(html.includes('data-inv-sort'), 'сортування')
      assert.ok(html.includes('class="god-inv-detail" data-item-id="igear"'), 'інспектор прив\'язаний до предмета')
      assert.ok(html.includes('HP <b>+50</b>') && html.includes('Червона рідина') && html.includes('Розділити'), 'відновлення, опис, розділення')
      assert.equal((html.match(/<option/g) || []).length, 2 + 9, 'сортування + місце в інспекторі')
    }
    if (f === 'skills.hbs') {
      assert.equal(html.includes('data-action="skillUp"'), editMode, '± лише в режимі редагування')
      assert.ok(html.includes('fa-key'), 'ключ гілки позначено')
      assert.ok(html.includes('закрита'), 'закрита гілка позначена')
      assert.ok(html.includes('data-action="commitBuild"'), 'кнопка фіксації')
      assert.equal(html.includes('data-custom-field="name"'), editMode, 'редагування особливих вмінь — майстру в режимі редагування')
    }
    if (f === 'traits.hbs') {
      assert.ok(html.includes('Еліксир') && html.includes('Загальна'), 'рецепти й мови')
      assert.equal(html.includes('data-know-field'), editMode, 'поля знань лише в редагуванні')
    }
    if (f === 'sidebar.hbs' || f === 'npc-sidebar.hbs') {
      assert.ok(html.includes('data-res-step="-1"') && html.includes('data-res-step="1"'), `${f}: кнопки ± на смугах`)
      assert.ok(html.includes('data-res-damage'), `${f}: кнопка урону біля HP`)
      assert.equal(html.includes('god-res-bonus'), editMode, `${f}: бонус/максимум лише в редагуванні`)
    }
    if (f === 'overview.hbs') assert.ok(html.includes('god-dmg-table') && html.includes('data-delta="system.reputation.fame"'), 'таблиця урону й репутація')
    if (f === 'overview.hbs') assert.equal(html.includes('data-delta="system.stats.str.value"'), editMode, 'поля стат (з дельтою) лише в редагуванні')
    if (f === 'npc-sidebar.hbs') {
      assert.ok(html.includes('god-res-pr') && html.includes('god-res-mr'), 'НІП: смуги PR/MR')
      assert.equal(html.includes('data-delta="system.resources.pr.base"'), editMode, 'НІП: природна броня редагується')
      assert.equal(html.includes('name="system.size"'), editMode, 'НІП: розмір — у режимі редагування')
    }
    if (f === 'npc-overview.hbs') {
      assert.ok(html.includes('data-action="npcAttack"'), 'НІП: кнопка атаки')
      assert.ok(html.includes('data-delta="system.attack.phys"'), 'НІП: PD редагується одразу, з формулою')
      assert.ok(html.includes('<td>60</td>') && html.includes('150%'), 'НІП: таблиця уражень 10–150%')
      assert.ok(html.includes('→ 6'), 'НІП: підсумкове ШУ поруч із базою')
      assert.ok(!html.includes('system.stats.str.value'), 'НІП: без характеристик')
    }
    if (f === 'gear.hbs') assert.equal(html.includes('god-enc-bar'), !ctx.isNpc, 'смуга ваги лише в персонажа')
  }
  console.log(`✓ усі шаблони актора — режим ${editMode ? 'редагування' : 'гри'}`)
}
for (const [type, flags] of [['weapon', { isWeapon: true, isPhysical: true }], ['armor', { isArmor: true, isPhysical: true }], ['gear', { isGear: true, isPhysical: true }], ['spell', { isSpell: true }], ['ability', { isAbility: true }]]) {
  const it = row(type, { slot: 'Пояс', school: 'fire', attackType: 'target', damageKind: 'mag', category: 'onehand', hand: 'main', armorClass: 'none' })
  const html = Handlebars.compile(readFileSync('god/templates/item/item-sheet.hbs', 'utf8'))({
    item: it, system: it.system, config: GOD, ...flags, typeLabel: type, description: '', upgrades: '', editable: true,
    facts: [{ label: 'ПППС 6' }, { label: '100 OM', cls: 'mag' }], handOptions: { main: 'a', off: 'b' }, damageKinds: { mag: 'm', phys: 'p', none: 'n' } })
  assert.ok(html.includes('god-item-sheet'))
  if (type === 'armor') assert.ok(html.includes('system.beltSlots'), 'поле слотів для пояса')
}
console.log('✓ лист предмета — 5 типів')

// ── описи вмінь: є для кожного вміння з правил ──
const { SKILL_INFO } = await import('../god/module/skill-info.mjs')
const noInfo = Object.keys(GOD.SKILL_INDEX).filter(k => !SKILL_INFO[k])
assert.deepEqual(noInfo, [], 'вміння без опису')
assert.ok(GOD.SKILL_INDEX['Зібраність'], 'Зібраність у бойових')
console.log('✓ описи всіх вмінь')

// ── панель бою ──
const cbT = Handlebars.compile(readFileSync('god/templates/apps/combat-panel.hbs', 'utf8'))
assert.ok(cbT({ none: true, gm: true, selected: 0, onScene: 4 }).includes('усі на сцені (4)'), 'бою немає: старт з усіма')
assert.ok(!cbT({ none: true, gm: false }).includes('data-action="start"'), 'гравець не починає бій')
const cbRows = [{ id: 'a', num: 1, name: 'Герой', img: 'x', ini: 12, side: 'friendly', active: true, hp: { value: 5, max: 10, pct: 50 } },
  { id: 'b', num: 2, name: 'Орк', img: 'y', ini: 8, side: 'hostile', defeated: true }]
const cbGm = cbT({ gm: true, started: true, round: 3, rows: cbRows, current: { name: 'Герой' }, selected: 0 })
assert.ok(cbGm.includes('<b>3</b>') && cbGm.includes('god-cb-row side-friendly active') && cbGm.includes('data-ini') && cbGm.includes('data-action="nextRound"'), 'майстер: раунд, хід, ініціатива')
const cbPl = cbT({ gm: false, started: true, round: 3, rows: cbRows, myTurn: true })
assert.ok(cbPl.includes('Завершити хід') && !cbPl.includes('data-ini') && !cbPl.includes('nextRound'), 'гравець: лише свій хід')
console.log('✓ панель бою')

// ── вікно імпорту з сайту ──
const impT = Handlebars.compile(readFileSync('god/templates/apps/site-importer.hbs', 'utf8'))
assert.ok(impT({ step: 'file' }).includes('type="file"'), 'імпорт: вибір файлу')
const impHtml = impT({ step: 'pick', users: [{ id: 'u1', name: 'Оля' }], exportedAt: 'сьогодні', anyExists: true,
  chars: [{ id: 1, name: 'Ейла', level: 19, party: 'Кіт', checked: true, owner: 'u1' }, { id: 2, name: 'Тест', level: 0, test: true }],
  enemies: [{ id: '2:e', name: 'Орк', hp: 600, checked: true }], groups: [{ key: 'gmItems', label: 'Предмети майстра', count: 38, checked: true }] })
assert.ok(impHtml.includes('name="char" value="1" checked') && impHtml.includes('<option value="u1" selected>Оля</option>'), 'імпорт: персонаж і власник')
assert.ok(impHtml.includes('name="enemy" value="2:e" checked') && impHtml.includes('name="group" value="gmItems" checked') && impHtml.includes('name="overwrite"'), 'імпорт: вороги, предмети, оновлення')
console.log('✓ вікно імпорту з сайту')

// ── панелі: персонаж і швидка панель ──
const bar = (key, extra = {}) => ({ key, abbr: key.toUpperCase(), value: 5, max: 10, pct: 50, ...extra })
const hud = Handlebars.compile(readFileSync('god/templates/apps/hud.hbs', 'utf8'))({ actor: base.actor, bars: [bar('hp'), bar('mp')], armor: [bar('pr')], stances: base.stances, weapons: [], spells: [] })
assert.ok(hud.includes('data-res-step') && hud.includes('data-res-damage'), 'панель персонажа: ± і урон')
const qbT = Handlebars.compile(readFileSync('god/templates/apps/quickbar.hbs', 'utf8'))
const slots = [{ key: 'a', num: '1', img: 'x', tip: 't', group: 'atk', gap: false }, { key: 'b', num: '2', img: 'y', tip: 't', group: 'mag', gap: true, badge: '100', dim: true }]
const qb = qbT({ actor: base.actor, bars: [bar('hp'), bar('mp')], armor: [bar('pr')], dodge: 9, stances: base.stances, slots, custom: true })
assert.equal((qb.match(/data-slot /g) || []).length, 2, 'слоти швидкої панелі')
assert.ok(qb.includes('god-qb-gap') && qb.includes('god-qb-reset') && qb.includes('class="god-qb-slot god-qb-mag dim"'), 'роздільник групи, скидання, тьмяний слот')
assert.ok(qb.includes('data-key="a"') && qb.includes('<u>1</u>'), 'ключі й номери слотів')
assert.ok(qbT({ missing: true }).includes('Обери токен'), 'порожня панель — підказка')
const um = qbT({ missing: true, userMode: true, slots: [{ key: 'Macro.x', hotSlot: 3, num: '1', img: 'm', tip: 'Макрос', group: 'macro' }] })
assert.ok(um.includes('data-hot-slot="3"') && !um.includes('Обери токен') && !um.includes('god-res'), 'без персонажа — макроси користувача')
assert.ok(!qbT({ actor: base.actor, bars: [], armor: [], stances: [], slots, collapsed: true }).includes('data-slot'), 'згорнута — без слотів')
for (const html of [hud, qb]) { const r = html.trim().match(/^<(\w+)/)[1]; assert.ok(html.trim().endsWith(`</${r}>`), 'один корінь') }
console.log('✓ панель персонажа і швидка панель')
console.log('\nSmoke OK')
