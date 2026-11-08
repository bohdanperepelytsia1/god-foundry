/**
 * config.mjs — усі дані системи G.O.D. в одному місці.
 * Чистий JS без залежностей від Foundry: імпортується і системою, і тестами.
 * Значення перенесені з сайту (src/data/gameData.js, gameBalance.js) один-в-один.
 */

export const BALANCE = {
  STAT_DIVISOR: 15,          // МОД = ⌊стат / 15⌋
  XP_PER_LEVEL: 50,          // перехід N→N+1 коштує (N+1)·50 XP
  LEVEL_UP_SKILL_PTS: 8,
  LEVEL_UP_STAT_PTS: 6,
  START_SKILL_PTS: 60,       // створення: 60 очок умінь + до 50 за дебафи
  DEBUFF_MAX_TOTAL: 50,
  DEBUFF_MAX_EACH: 15,
  STR_DMG_MULT: 5,           // 100% урону = стат·5 + урон зброї
  BASE_SPEED: 3,
  BASE_MAX_WEIGHT: 20,
  MULE_WEIGHT_PER_LVL: 5,
}

// Ключ вміння = назва без крапок/пробілів/лапок — безпечний для шляхів оновлення Foundry
export const skillKey = name => name.replace(/[.\s'"’]+/g, '_').replace(/_+$/, '')

export const SKILL_COST_TABLE = {
  2:  [2, 2, 3, 3, 4, 4, 4, 5, 5, 6],
  3:  [3, 4, 4, 5, 6, 6, 6, 8, 8, 9],
  4:  [4, 5, 6, 6, 8, 8, 8, 10, 10, 12],
  5:  [5, 6, 7, 8, 10, 10, 10, 13, 13, 15],
  6:  [6, 7, 8, 9, 12, 12, 12, 15, 15, 18],
  7:  [7, 8, 10, 11, 14, 14, 14, 18, 18, 21],
  8:  [8, 10, 11, 12, 16, 16, 16, 20, 20, 24],
  9:  [9, 11, 13, 14, 18, 18, 18, 23, 23, 27],
  10: [10, 12, 14, 15, 20, 20, 20, 25, 25, 30],
}

const S = (name, cost, max) => ({ name, key: skillKey(name), cost, max })

export const SKILL_CATEGORIES = {
  social: { gate: skillKey('Говорливість'), label: 'Соціальні', skills: [
    S('Говорливість', 4, 1), S('Азартні ігри', 4, 10), S('Алкоголь', 3, 10), S('Дипломатія', 3, 10),
    S('Допит', 3, 10), S('Музикальний інструмент', 2, 10), S('Емпатія', 4, 10), S('Спів', 2, 10),
    S('Публічний виступ', 4, 10), S('Танці', 2, 10), S('Торгівля', 4, 10), S('Переконання', 6, 10),
    S('Флірт', 3, 10), S('Манери', 4, 10), S('Обман', 5, 10),
  ]},
  neutral: { gate: skillKey('Інстинкти'), label: 'Нейтральні', skills: [
    S('Інстинкти', 3, 1), S('Акробатика', 4, 10), S('Верхова їзда', 4, 3), S('Уважність', 4, 10),
    S('Виживання', 3, 10), S('Зір', 2, 10), S('Мул', 2, 10), S('Нюх', 4, 10),
    S('Поводження з тваринами', 2, 10), S('Полювання', 3, 10), S("Пам'ять", 2, 10), S('Перша допомога', 6, 5),
    S('Плавання', 2, 10), S('Рибатство', 3, 10), S('Слух', 3, 10), S('Стійкість', 5, 10),
    S('Слідопитство', 4, 10), S('Залізні нерви', 7, 5), S('Майстер на всі руки', 4, 10),
    S('Грамота (рідна мова)', 6, 5), S('Скритність', 5, 10), S('Маскування', 3, 10), S('Кулінарія', 3, 10),
    S('Пошук скарбів', 5, 10), S('Мореплавство', 7, 3),
  ]},
  combat: { gate: skillKey('Бойові навички'), label: 'Бойові', skills: [
    S('Бойові навички', 5, 1), S('Бойові рефлекси', 6, 5), S('Боротьба', 4, 10), S('Двуручна', 6, 10),
    S('Кулачний бій', 3, 10), S('Легка', 3, 10), S('Луки', 6, 10), S('Метальна', 4, 10),
    S('Одноручна', 4, 10), S('Тяжка одноручна', 6, 10), S('Щити', 3, 10),
    S('Прицільність легка та одноручна', 6, 10), S('Прицільність тяжка та двуручна', 5, 10),
    S('Прицільність луки та метальна', 6, 10), S('Прицільність кулачний бій та боротьба', 4, 10),
    S('Ухиляння', 10, 6), S('Спринт', 8, 2), S('Розвідка', 4, 10),
  ]},
  science: { gate: skillKey('Розуміння'), label: 'Наука', skills: [
    S('Розуміння', 8, 1), S('Аналіз', 5, 10), S('Грамота (друга мова)', 3, 5), S('Історія', 3, 10),
    S('Картографія', 3, 10), S('Медицина', 4, 10), S('Натуралізм', 2, 10), S('Окультизм', 4, 10),
    S('Реанімація', 4, 10), S('Теологія', 4, 10), S('Травництво', 3, 10), S('Хірургія', 5, 10),
    S('Мова жестів', 3, 5), S('Зіллєварство', 4, 10),
  ]},
  magic: { gate: skillKey('Магічність'), label: 'Магія', skills: [
    S('Магічність', 10, 1), S('Маг прицільність', 6, 10), S('Медитація', 6, 5),
    S('Розпізнання маг предметів', 5, 10), S('Сила води', 3, 10), S('Сила повітря', 3, 10),
    S('Сила землі', 3, 10), S('Сила вогню', 5, 10), S('Сновидіння', 3, 10), S('Відчуття магії', 6, 5),
    S('Посохи', 5, 10), S('Жезли', 7, 10), S('Кодекс мага', 8, 10), S('Тризуб', 7, 10),
    S('Чакрами', 10, 10), S('Оберіг', 6, 10), S('П. Посохи та жезли', 6, 10),
    S('П. Тризубці та чакрами', 7, 10),
  ]},
  crime: { gate: skillKey('Злочинність'), label: 'Поза законом', skills: [
    S('Злочинність', 6, 1), S('Взлом', 3, 10), S('Залякування', 5, 10), S('Знання замків', 4, 6),
    S('Контрабанда', 3, 10), S('Крадіжка', 4, 10), S("Злочинні зв'язки", 4, 10),
    S('Наслідування', 4, 10), S('Хабар', 4, 10),
  ]},
}

// Плаский індекс: key → { cat, ...skill, isGate }
export const SKILL_INDEX = Object.fromEntries(
  Object.entries(SKILL_CATEGORIES).flatMap(([cat, c]) => c.skills.map(s => [s.key, { ...s, cat, isGate: s.key === c.gate }]))
)

export const STATS = {
  str:  { label: 'Сила',         abbr: 'СИЛ', hint: 'фізичний урон' },
  con:  { label: 'Тілобудова',   abbr: 'ТІЛ', hint: 'HP' },
  end:  { label: 'Витривалість', abbr: 'ВИТ', hint: 'ED' },
  int:  { label: 'Інтелект',     abbr: 'ІНТ', hint: 'маг. урон, сотворення' },
  wis:  { label: 'Мудрість',     abbr: 'МУД', hint: 'мана' },
  will: { label: 'Воля',         abbr: 'ВОЛ', hint: 'ментальне' },
}

// Ресурси з авто-максимумом від характеристики (як на сайті)
export const RESOURCES = {
  hp: { label: "Здоров'я",     abbr: 'HP', stat: 'con',  mult: 10 },
  mp: { label: 'Мана / Одхі',  abbr: 'OM', stat: 'wis',  mult: 10 },
  mt: { label: 'Ментальне',    abbr: 'MT', stat: 'will', mult: 1 },
  ed: { label: 'Витривалість', abbr: 'ED', stat: 'end',  mult: 10 },
}

export const ARMOR_SLOTS = {
  'Шолом': 'Шолом', 'Кираса': 'Кираса', 'Поножі': 'Поножі', 'Рукавиці': 'Рукавиці', 'Чоботи': 'Чоботи',
  'Одяг': 'Одяг', 'Плащ_накидка': 'Плащ / накидка', 'Шия': 'Шия', 'Щит': 'Щит',
  'Палець_л': 'Палець (л)', 'Палець_п': 'Палець (п)', 'Кисть_л': 'Кисть (л)', 'Кисть_п': 'Кисть (п)',
  'Пояс': 'Пояс', 'Рюкзак': 'Рюкзак',
}

export const ARMOR_CLASSES = {
  none: 'Не обладунок', light: 'Легкий', medium: 'Середній', heavy: 'Тяжкий',
}

/** Розміри створінь (Combat manual): клітини, швидкість, множник ШУ */
export const CREATURE_SIZES = {
  tiny: 'Крихітне (ШУ ×1.6)', small: 'Маленьке (ШУ ×1.3)', medium: 'Середнє', large: 'Велике (ШУ ×0.5)',
  huge: 'Величезне (ШУ ×0.2)', gargantuan: 'Гігантське (ШУ ×0.1)',
}
export const CREATURE_RANKS = { weak: 'Слабкий', junior: 'Молодший', regular: 'Рядовий', senior: 'Старший', elite: 'Елітний', legendary: 'Легендарний' }

export const INVENTORY_LOCATIONS = {
  main: 'Загальне', belt: 'Пояс', quest: 'Квестові', tools: 'Інструменти',
  books: 'Книги', ingredients: 'Інгредієнти', potions: 'Зілля',
}

/**
 * Категорії звичайних предметів: що це таке. Визначають іконку, типовий розділ інвентаря
 * і чи предмет розхідний. Розділ потім можна змінити — категорія лишиться.
 */
export const GEAR_CATEGORIES = {
  item:       { label: 'Звичайний',      icon: 'item',     loc: 'main' },
  potion:     { label: 'Зілля',          icon: 'potion',   loc: 'potions',     consumable: true },
  food:       { label: 'Їжа й питво',    icon: 'food',     loc: 'main',        consumable: true },
  medicine:   { label: 'Ліки, бинти',    icon: 'flask',    loc: 'potions',     consumable: true },
  ingredient: { label: 'Інгредієнт',     icon: 'herb',     loc: 'ingredients' },
  tool:       { label: 'Інструмент',     icon: 'tools',    loc: 'tools' },
  lockpick:   { label: 'Відмички',       icon: 'lockpick', loc: 'tools' },
  book:       { label: 'Книга',          icon: 'book',     loc: 'books' },
  scroll:     { label: 'Сувій, лист',    icon: 'scroll',   loc: 'books' },
  quest:      { label: 'Квестовий',      icon: 'map',      loc: 'quest' },
  key:        { label: 'Ключ',           icon: 'key',      loc: 'quest' },
  light:      { label: 'Світло',         icon: 'torch',    loc: 'main' },
  camp:       { label: 'Похідне',        icon: 'camp',     loc: 'main' },
  rope:       { label: 'Мотузка, кріплення', icon: 'rope', loc: 'main' },
  valuable:   { label: 'Цінність',       icon: 'coins',    loc: 'main' },
}
/** Розділ інвентаря → типова категорія (для кнопки «+» у розділі) */
export const LOCATION_CATEGORY = { main: 'item', belt: 'item', quest: 'quest', tools: 'tool', books: 'book', ingredients: 'ingredient', potions: 'potion' }

export const WEAPON_CATEGORIES = {
  fist: 'Кулачна', light: 'Легка', onehand: 'Одноручна', heavy1h: 'Тяжка одноручна',
  twohand: 'Дворучна', bow: 'Лук', throw: 'Метальна',
  staff: 'Посох', wand: 'Жезл', codex: 'Кодекс мага', trident: 'Тризуб', chakram: 'Чакрами', amulet: 'Оберіг',
}

// Яке вміння — володіння, а яке — прицільність для кожної категорії зброї
export const WEAPON_SKILLS = {
  fist:    { prof: 'Кулачний_бій',     acc: 'Прицільність_кулачний_бій_та_боротьба' },
  light:   { prof: 'Легка',            acc: 'Прицільність_легка_та_одноручна' },
  onehand: { prof: 'Одноручна',        acc: 'Прицільність_легка_та_одноручна' },
  heavy1h: { prof: 'Тяжка_одноручна',  acc: 'Прицільність_тяжка_та_двуручна' },
  twohand: { prof: 'Двуручна',         acc: 'Прицільність_тяжка_та_двуручна' },
  bow:     { prof: 'Луки',             acc: 'Прицільність_луки_та_метальна' },
  throw:   { prof: 'Метальна',         acc: 'Прицільність_луки_та_метальна' },
  staff:   { prof: 'Посохи',           acc: 'П_Посохи_та_жезли' },
  wand:    { prof: 'Жезли',            acc: 'П_Посохи_та_жезли' },
  codex:   { prof: 'Кодекс_мага',      acc: 'Маг_прицільність' },
  trident: { prof: 'Тризуб',           acc: 'П_Тризубці_та_чакрами' },
  chakram: { prof: 'Чакрами',          acc: 'П_Тризубці_та_чакрами' },
  amulet:  { prof: 'Оберіг',           acc: 'Маг_прицільність' },
}

export const SPELL_SCHOOLS = {
  air: 'Повітря', earth: 'Земля', water: 'Вода', fire: 'Вогонь', summon: 'Призив',
  light: 'Світло', dark: 'Пітьма', psionic: 'Псионіка', chaos: 'Хаотика', necro: 'Некротика', odhi: 'Одхі',
}

// v4.5.0: рівень володіння школою → кістка перевірки сотворення (індекс = рівень)
export const SCHOOL_DIE = [0, 2, 4, 6, 8, 10, 12, 12, 20, 20, 20]

export const ATTACK_TYPES = { self: 'На себе', target: 'На ціль', touch: 'Дотик', area: 'По площі' }

// v4.5.0: стійки як готові активні ефекти
export const STANCES = {
  attack:   { label: 'Атакуюча стійка',     icon: 'systems/god/assets/icons/stances/attack.svg',  changes: { 'system.combat.damageMod': 2, 'system.combat.dodgeBonus': -4 } },
  defense:  { label: 'Захисна стійка',      icon: 'systems/god/assets/icons/stances/defense.svg', changes: { 'system.combat.dodgeBonus': 2, 'system.combat.damageMod': -4 } },
  nonlethal:{ label: 'Несмертельна стійка', icon: 'systems/god/assets/icons/stances/nonlethal.svg',   changes: { 'system.combat.damageMod': -3, 'system.combat.hitMod': 1 } },
}

export const REPUTATION = {
  fame:   { label: 'Слава',      color: '#8cb377' },
  karma:  { label: 'Карма',      color: '#e9dcc0' },
  infame: { label: 'Безслава',   color: '#c0574b' },
  status: { label: 'Статус',     color: '#e9dcc0' },
  crits:  { label: 'Крити',      color: '#b99be0' },
  luck:   { label: 'Удача',      color: '#8fb0d8' },
}

export const MONEY = {
  platinum: { label: 'Платина', abbr: 'пл' },
  gold:     { label: 'Золото',  abbr: 'з' },
  silver:   { label: 'Срібло',  abbr: 'ср' },
  copper:   { label: 'Мідь',    abbr: 'м' },
}

export const GOD = {
  BALANCE, SKILL_COST_TABLE, SKILL_CATEGORIES, SKILL_INDEX, STATS, RESOURCES, ARMOR_SLOTS, ARMOR_CLASSES,
  INVENTORY_LOCATIONS, CREATURE_SIZES, CREATURE_RANKS, GEAR_CATEGORIES, LOCATION_CATEGORY, REPUTATION, WEAPON_CATEGORIES, WEAPON_SKILLS, SPELL_SCHOOLS, SCHOOL_DIE, ATTACK_TYPES, STANCES, MONEY,
}

// ── Іконки системи (assets/icons) ────────────────────────────────────────────
const I = (group, key) => `systems/god/assets/icons/${group}/${key}.svg`
export const ICON_ROOT = 'systems/god/assets/icons/'
const SLOT_ICON = {
  'Шолом': 'helmet', 'Кираса': 'cuirass', 'Поножі': 'greaves', 'Рукавиці': 'gloves', 'Чоботи': 'boots', 'Одяг': 'clothes',
  'Плащ_накидка': 'cloak', 'Шия': 'neck', 'Щит': 'shield', 'Палець_л': 'ring', 'Палець_п': 'ring',
  'Кисть_л': 'wrist', 'Кисть_п': 'wrist', 'Пояс': 'belt', 'Рюкзак': 'backpack',
}
/** Типова іконка для предмета за типом і ключовим полем (категорія/слот/школа) */
export function defaultIcon(type, system = {}) {
  if (type === 'weapon') return I('weapons', system.category ?? 'onehand')
  if (type === 'armor') return I('armor', SLOT_ICON[system.slot] ?? 'cuirass')
  if (type === 'spell') return I('schools', system.school ?? 'fire')
  if (type === 'ability') return I('misc', 'ability')
  if (type === 'trait') return system.kind === 'debuff' ? I('status', 'cursed') : I('misc', system.kind === 'quirk' ? 'quirk' : 'trait')
  if (type === 'gear') return I('gear', GEAR_CATEGORIES[system.category]?.icon ?? 'item')
  return I('gear', 'item')
}
export const ACTOR_ICONS = { character: I('misc', 'character'), npc: I('misc', 'npc') }
export const STANCE_ICONS = { attack: I('stances', 'attack'), defense: I('stances', 'defense'), nonlethal: I('stances', 'nonlethal') }

/** Стани для HUD токена */
export const STATUS_EFFECTS = [
  ['dead', 'Мертвий'], ['unconscious', 'Без свідомості'], ['stunned', 'Оглушений'], ['prone', 'Лежить'],
  ['restrained', 'Скутий'], ['bleeding', 'Кровотеча'], ['poisoned', 'Отруєний'], ['burning', 'Горить'],
  ['frozen', 'Заморожений'], ['blind', 'Осліплений'], ['deaf', 'Оглушений звуком'], ['silenced', 'Німий'],
  ['frightened', 'Наляканий'], ['fatigued', 'Втома'], ['overloaded', 'Перевантажений'], ['invisible', 'Невидимий'],
  ['blessed', 'Благословенний'], ['cursed', 'Проклятий'],
].map(([id, name]) => ({ id, name, img: I('status', id) }))
