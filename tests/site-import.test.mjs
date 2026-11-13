// Перенесення з сайту: лист сайту → дані Foundry (вигаданий персонаж, без реальних даних)
import assert from 'node:assert/strict'
globalThis.foundry = { data: { fields: {} } }
const M = await import('../god/module/site-import.mjs')
const { GOD } = await import('../god/module/config.mjs')
const R = await import('../god/module/rules.mjs')

const sheet = {
  name_known: 'Тестовий Ведмідь', name_full: 'Ведмідь Ведмедович', race: 'Людина', age: '30',
  appearance: 'Високий\nбородатий', motivation: 'Знайти мед', backstory: 'Перший абзац.\n\nДругий <b>абзац</b>.',
  level: '5', xp_current: '120', skill_pts: '7', stat_pts: '2',
  'stat-str': '30', 'stat-con': '45', 'stat-end': 20, 'stat-int': '15', 'stat-wis': '18', 'stat-will': 25,
  'res-cur-hp': '400', 'res-max-hp': '480', 'res-cur-mp': '100', 'res-max-mp': '180', 'res-cur-mt': '20', 'res-max-mt': 25,
  'res-cur-ed': '150', 'res-max-ed': 200, 'res-cur-pr': '60',
  fame: '3', karma: '-1', infame: '0', status_val: '2', crits: '40', luck: '1',
  copper: 5, silver: '12', gold: '1', platinum: 0, max_weight_override: '35',
  _skillLevels: { 'combat-skills-table::Бойові навички': 1, 'combat-skills-table::Одноручна': 3, 'neutral-skills-table::Пошук скарібв': 2,
    'science-skills-table::Алхімія': 2, 'social-skills-table::Невідоме': 1 },
  _skillFloor: { 'combat-skills-table::Одноручна': 2, 'science-skills-table::Алхімія': 1 },
  _statFloor: { str: '30', con: '40' },
  _customSkills: [{ name: 'Алхімія', cost: 6, max: 10, cat: 'science-skills-table', _id: 'csabc' }],
  '_inv_inv-main': [{ type: 'misc', name: 'Мотузка', amount: '2', weightPerOne: '0.5', price: { silver: 3 } },
    { type: 'weapon', name: 'Стріла звичайна', amount: 20, weightPerOne: 0.05 },
    { type: 'container', name: 'Шкіряна торба', additionalMaxWeight: 10, weightPerOne: 1 }],
  '_inv_inv-belt': [{ type: 'potion', name: 'Зілля', amount: 1, description: 'Лікує', effects: ['+100 HP'], freshness: '90' }],
  '_inv_inv-books': [{ type: 'book', name: 'Книга', hoursNeedToRead: '10', hoursAlreadyRead: '4' }],
  _armor: { Кираса: { name: 'Ельфійська кираса', w: '3', phys: '120', mag: '0' }, Поножі: { name: 'Поножі', phys: '60' },
    Пояс: { name: 'Пояс на 5 слотів', phys: '0' }, Щит: { name: 'Щит башенний', phys: '300' }, Шолом: { name: '' } },
  'wr-name': 'Короткий меч', 'wr-phys': '150', 'wr-weight': '1.5',
  'wl-equipped': { name: 'Кинджал з загартованої сталі', physicalDamage: '80', weightPerOne: '0.5' },
  _spells: [{ kind: 'ability', name: 'Ривок', enduranceCost: '50', coolDown: '3 раунди', timeToCast: '1ПХ', description: 'Швидко.' }],
  _traits_v2: [{ name: 'Боягуз (К)', cost: '7', desc: 'Тікає' }, { name: 'Жадібний', cost: '20', desc: '' }],
  _quirks: [{ name: '', cost: '', desc: '' }, { name: 'Свистить', cost: '', desc: 'Завжди' }],
  _effects: [{ name: '**Середній підігнаний обладунок:** - Неможливо: спати' }, { name: 'Застуда' }],
  _recipes: [{ name: 'Юшка', source: 'Бабця', desc: 'Риба' }],
  _notes: '-10 витр за пробіжку',
  avatar: 'data:image/jpeg;base64,AAAA',
}
const r = M.characterFromSite({ id: 7, slotName: 'Слот', party: 'Банда', sheet })
const a = r.actor, s = a.system

assert.equal(a.name, 'Тестовий Ведмідь')
assert.equal(a.flags.god.siteId, 'char:7')
assert.equal(s.stats.str.value, 30); assert.equal(s.stats.end.value, 20)
assert.deepEqual(s.floors.stats, { str: 30, con: 40 })
assert.equal(s.resources.hp.value, 400); assert.equal(s.resources.pr.value, 60)
assert.deepEqual(r.siteMax, { hp: 480, mp: 180, mt: 25, ed: 200 })
assert.equal(s.progress.xp, R.totalXpForLevel(5) + 120); assert.equal(R.levelFromXp(s.progress.xp), 5)
assert.equal(s.progress.skillPoints, 7); assert.equal(s.progress.statPoints, 2)
assert.deepEqual(s.money, { platinum: 0, gold: 1, silver: 12, copper: 5 })
assert.equal(s.reputation.status, 2); assert.equal(s.reputation.karma, -1)
assert.equal(s.encumbrance.override, 35)
assert.equal(s.details.race, 'Людина')
assert.ok(s.biography.includes("<h3>Повне ім'я</h3>") && s.biography.includes('&lt;b&gt;абзац&lt;/b&gt;') && s.biography.includes('Високий<br>бородатий'), 'біографія екранована, з абзацами')
console.log('✓ основне: характеристики, ресурси, досвід, гроші, слава, біографія')

assert.equal(s.skills.combat[GOD.SKILL_INDEX['Одноручна'] ? 'Одноручна' : ''], 3)
assert.equal(s.skills.neutral['Пошук_скарбів'], 2, 'одрук сайту «Пошук скарібв»')
assert.equal(s.floors.skills['Одноручна'], 2)
assert.equal(s.customSkills.length, 1); assert.equal(s.customSkills[0].name, 'Алхімія')
assert.equal(s.customSkills[0].cat, 'science'); assert.equal(s.customSkills[0].lvl, 2); assert.equal(s.customSkills[0].floor, 1)
assert.equal(s.customSkills[0].id.length, 16)
assert.ok(r.notes.some(n => n.includes('Невідоме')), 'невідоме вміння — у звіт')
console.log('✓ вміння: рівні, фіксація, особливі, одруки')

const by = n => a.items.find(i => i.name === n)
assert.equal(by('Мотузка').system.quantity, 2); assert.equal(by('Мотузка').system.weight, 0.5); assert.equal(by('Мотузка').system.price.silver, 3)
assert.equal(by('Стріла звичайна').type, 'gear'); assert.equal(by('Стріла звичайна').system.category, 'ammo')
assert.equal(by('Шкіряна торба').type, 'armor'); assert.equal(by('Шкіряна торба').system.slot, 'Рюкзак'); assert.equal(by('Шкіряна торба').system.equipped, false)
const potion = by('Зілля')
assert.equal(potion.system.location, 'belt'); assert.equal(potion.system.category, 'potion'); assert.ok(potion.system.consumable)
assert.ok(potion.system.description.includes('+100 HP') && potion.system.description.includes('Свіжість'))
assert.ok(by('Книга').system.description.includes('4 з 10 год'))
console.log('✓ інвентар: розділи, кількість, вага, ціна, категорії, опис')

const cuir = by('Ельфійська кираса'), legs = by('Поножі'), belt = by('Пояс на 5 слотів'), shield = by('Щит башенний')
assert.ok(cuir.system.equipped && cuir.system.slot === 'Кираса' && cuir.system.phys === 120 && cuir.system.weight === 3)
assert.equal(cuir.system.armorClass, 'medium', 'клас з ефекту «Середній підігнаний обладунок»'); assert.ok(cuir.system.fitted)
assert.equal(legs.system.armorClass, 'medium')
assert.equal(belt.system.beltSlots, 5)
assert.equal(shield.system.shieldSize, 'large'); assert.equal(shield.system.armorClass, 'none')
assert.ok(!a.items.some(i => i.system.slot === 'Шолом'), 'порожній слот не створює предмет')
assert.ok(!r.notes.some(n => n.includes('Ельфійська кираса')), 'клас знайдено — примітки немає')
assert.ok(!r.notes.some(n => n.includes('рюкзака')), 'ручна вага — без примітки про рюкзак')
const main = by('Короткий меч'), off = by('Кинджал з загартованої сталі')
assert.ok(main.system.equipped && main.system.hand === 'main' && main.system.category === 'onehand' && main.system.phys === 150)
assert.ok(off.system.equipped && off.system.hand === 'off' && off.system.category === 'light' && off.system.phys === 80)
console.log('✓ одягнене: обладунок по слотах, клас, пояс, щит, зброя в руках')

const ab = by('Ривок')
assert.equal(ab.type, 'ability'); assert.equal(ab.system.staminaCost, 50); assert.equal(ab.system.cooldown, '3 раунди')
assert.ok(ab.system.description.includes('1ПХ'))
const coward = by('Боягуз (К)'), greedy = by('Жадібний')
assert.ok(coward.system.kind === 'debuff' && coward.system.controlled && coward.system.points === 7)
assert.equal(greedy.system.points, GOD.BALANCE.DEBUFF_MAX_EACH, 'дебаф не більше 15')
assert.equal(by('Свистить').system.kind, 'quirk')
assert.equal(a.items.filter(i => i.type === 'trait').length, 3, 'порожній квірк пропущено')
assert.equal(a.effects.length, 0, 'текстові ефекти сайту — не активні ефекти')
assert.ok(s.biography.includes('<h3>Ефекти й позначки з сайту</h3>') && s.biography.includes('<li><b>Середній підігнаний обладунок</b> — - Неможливо: спати</li>') && s.biography.includes('<li>Застуда</li>'), 'ефекти сайту — розділом у біографії')
assert.deepEqual(s.knowledge.recipes, [{ name: 'Юшка', source: 'Бабця', desc: 'Риба' }])
assert.ok(s.biography.includes('пробіжку'))
assert.equal(r.avatar, 'data:image/jpeg;base64,AAAA')
console.log('✓ здібності, дебафи, квірки, ефекти, рецепти, аватар')

// ── вгадування ──
assert.deepEqual(M.guessWeaponCategory('Лук ізальді'), ['bow', true])
assert.deepEqual(M.guessWeaponCategory('Меч тяжкий стальний Бастард'), ['heavy1h', true])
assert.deepEqual(M.guessWeaponCategory('Двуручний Сталевий меч'), ['twohand', true])
assert.deepEqual(M.guessWeaponCategory('Піка'), ['onehand', false])
assert.equal(M.guessArmorSlot('Коричневий капюшон накидка'), 'Плащ_накидка')
assert.equal(M.guessArmorSlot('Срібне кільце'), 'Палець_п')
assert.deepEqual(M.guessArmorClass('Важкі поножі з орчої сталі'), ['heavy', false, true])
assert.equal(M.armorClassFromEffects([{ name: '**Средній підігнаний обладунок:**' }, { name: '**Легкий підігнаний обладунок:**' }]), null, 'два класи — не вгадуємо')
assert.equal(M.xpFromSite(3, 9999), R.totalXpForLevel(3) + R.xpForLevel(3) - 1, 'досвід не перескакує рівень')
assert.equal(M.guessGearCategory('Мотузка пенькова 10м', 'misc'), 'rope')
assert.equal(M.guessGearCategory('Шкіра кабана', 'other'), 'hide', 'межа слова з кирилицею')
assert.equal(M.guessGearCategory('Сушена курятина', 'misc'), 'food')
assert.equal(M.guessGearCategory('Ступа та пестик', 'instrument'), 'alchemy')
assert.equal(M.guessGearCategory('Щось дивне', 'instrument'), 'tool')
assert.equal(by('Мотузка').system.category, 'rope')
assert.ok(a.items.every(i => typeof i.img === 'string' && i.img.startsWith('systems/god/assets/icons/')), 'у кожного предмета іконка системи')
assert.ok(by('Мотузка').img.endsWith('/gear/rope.svg') || by('Мотузка').img.includes('/gear/'), 'іконка за категорією')
console.log('✓ вгадування категорій, слотів, класів')

// ── ворог ──
const foe = M.npcFromSite({ id: 'e1', party: 2, partyName: 'Банда', name: 'Орк', hp: '600', om: '50', mt: '30', pd: '250', md: '20', pr: '100', mr: '0', dc: '11', in: '8', effects: ['25% резист'] })
assert.equal(foe.actor.type, 'npc'); assert.equal(foe.actor.flags.god.siteId, 'enemy:2:e1')
assert.deepEqual(foe.actor.system.resources.hp, { value: 600, max: 600 })
assert.equal(foe.actor.system.attack.phys, 250); assert.equal(foe.actor.system.attack.mag, 20)
assert.equal(foe.actor.system.resources.pr.base, 100); assert.equal(foe.actor.system.dodge, 11); assert.equal(foe.actor.system.initiative, 8)
assert.equal(foe.actor.effects.length, 0); assert.ok(foe.actor.system.notes.includes('<li>25% резист</li>'), 'ефекти ворога — у нотатки')
assert.equal(M.npcFromSite({ name: 'Мрець', hp: '-50' }).notes.length, 1)
console.log('✓ ворог: ресурси, PD/MD, броня, ШУ, ініціатива, ефекти')

// ── зведення для вікна ──
const sum = M.summarizeExport({
  characters: [{ id: 1, party: 'Банда', sheet: { name_known: 'А', level: '3', x: 1 } }, { id: 2, party: 'Test party', sheet: { name_known: 'Б' } },
    { id: 3, archived: true, sheet: { name_known: 'В' } }],
  enemies: [{ id: 'x', party: 1, name: 'Живий', hp: '10' }, { id: 'y', party: 1, name: 'Мертвий', hp: '-1' }],
  gmItems: [{ name: 'Меч' }], storages: [{ id: 5, name: 'Віз', items: [{ name: 'Сіно' }] }, { id: 6, name: 'Порожній', items: [] }], merchants: [],
})
assert.deepEqual(sum.chars.map(c => c.checked), [true, false, false], 'активні — так, тестові й архівні — ні')
assert.deepEqual(sum.enemies.map(e => e.checked), [true, false], 'переможені вороги не позначені')
assert.deepEqual(sum.groups.map(g => g.key), ['gmItems'], 'склади — не теки предметів')
assert.deepEqual(sum.storages.map(x => [x.id, x.checked]), [[5, true], [6, false]], 'склади — сховищами; порожній не позначено')
console.log('✓ зведення: що позначено за замовчуванням')

// ── віз → сховище ──
const wagon = M.storageFromSite({ id: 9, name: 'Віз покритий', partyName: 'Банда', maxW: 200, items: [
  { type: 'ingredient', name: 'Сира шкіра оленя', amount: 8, weightPerOne: 1 }, { type: 'armor', name: 'Поножі', physicalResistance: 40 }, { name: '' }] })
assert.equal(wagon.actor.type, 'storage'); assert.equal(wagon.actor.flags.god.siteId, 'storage:9')
assert.equal(wagon.actor.system.capacity, 200); assert.equal(wagon.actor.system.party, 'Банда')
assert.equal(wagon.actor.items.length, 2, 'порожній рядок пропущено')
assert.equal(wagon.actor.items[0].system.quantity, 8)
assert.ok(wagon.actor.items.every(i => !i.system.equipped), 'у сховищі нічого не одягнено')
console.log('✓ віз із бази → сховище з вмістом і місткістю')
console.log('Імпорт із сайту OK')
