/**
 * Перенесення з сайту G.O.D. (база charsheet.db → tools/site-export.py → JSON).
 * Тут лише перетворення даних: лист сайту → дані актора й предметів Foundry.
 * Без звертань до Foundry API, тож модуль тестується в Node (tests/site-import.test.mjs).
 * Створення документів, аватари й доплату до максимумів ресурсів робить apps/site-importer.mjs.
 */
import { GOD, skillKey, defaultIcon } from './config.mjs'
import * as R from './rules.mjs'

// ── дрібні помічники ───────────────────────────────────────────────────────
const num = v => { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) ? n : 0 }
const int = v => Math.round(num(v))
const pos = v => Math.max(0, int(v))
const str = v => (v === null || v === undefined) ? '' : String(v).trim()
const esc = s => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Текст сайту (з переносами рядків) → абзаци HTML */
export const textToHtml = s => {
  const t = str(s)
  if (!t) return ''
  return t.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
}
const low = s => str(s).toLowerCase()
const has = (s, re) => re.test(low(s))

/** Категорії вмінь на сайті → гілки системи */
export const SITE_CATS = {
  'social-skills-table': 'social', 'neutral-skills-table': 'neutral', 'combat-skills-table': 'combat',
  'science-skills-table': 'science', 'magic-skills-table': 'magic', 'crime-skills-table': 'crime',
}
/** Назви, що на сайті записані інакше */
const SKILL_ALIASES = { 'Пошук скарібв': 'Пошук скарбів' }

/** Розділи інвентаря сайту → розділи системи */
export const SITE_SECTIONS = {
  '_inv_inv-main': 'main', '_inv_inv-belt': 'belt', '_inv_inv-potions': 'potions', '_inv_inv-tools': 'tools',
  '_inv_inv-books': 'books', '_inv_inv-ingredients': 'ingredients', '_inv_inv-quest': 'quest', '_inv_inv-horse': 'main',
}

/** Тип предмета сайту → категорія спорядження системи (для типу gear) */
const GEAR_BY_TYPE = {
  scroll: 'scroll', misc: 'item', other: 'item', food: 'food', instrument: 'tool', book: 'book', potion: 'potion',
  jewellery: 'jewelry', ingredient: 'ingredient', container: 'container', quest: 'quest',
}

/** Категорія спорядження за назвою (на сайті більшість речей — «misc/other») */
const GEAR_RULES = [
  [/свідчен|паспорт|перепустк|папір|паперу|чорнил|перо(?![а-яіїєґ'’])/, 'document'], [/змійовик|екстрактор|спирт/, 'alchemy'],
  [/з водою|бочк\S* вод/, 'water'], [/курят|сушен\S* м|сол[іь](?![а-яіїєґ'’])/, 'food'], [/спальн|спальік|подушк/, 'camp'],
  [/шкір\S* (кабан|олен|вовк|ведмед)|оленяча шкір|шкура/, 'hide'], [/цвях/, 'material'], [/кувалд|баліст/, 'tool'], [/бочк/, 'container'],
  [/стріл|болт|набо[їй]|кул[яі](?![а-яіїєґ'’])/, 'ammo'], [/відмичк/, 'lockpick'], [/ключ/, 'key'],
  [/хірург/, 'surgery'], [/перш\S* допомог|аптечк/, 'medkit'], [/бинт|мазь|ліки|пігулк|настоянк/, 'medicine'],
  [/отрут|яд(?![а-яіїєґ'’])/, 'poison'], [/зілл|еліксир|відвар/, 'potion'],
  [/ступ|пестик|колб|реторт|алхім|казанок/, 'alchemy'],
  [/вин[оа]|пиво|ель(?![а-яіїєґ'’])|горілк|самогон|ром(?![а-яіїєґ'’])|медовух|настій/, 'drink'], [/фляг|бурдюк|вод[аи](?![а-яіїєґ'’])/, 'water'],
  [/хліб|м['’]?ясо|сир(?![а-яіїєґ'’])|сухар|ковбас|риб[аи](?![а-яіїєґ'’])|яблук|їж[аі]|сало|юшк|пайок|раціон|бульйон|солонин|галет/, 'food'],
  [/смолоскип|факел|свічк|свічі/, 'light'], [/ліхтар|лампа/, 'lantern'],
  [/намет|спальн|ковдр|казан|кресал|огнив|трут/, 'camp'], [/мотуз|канат|ланцюг|кошк/, 'rope'],
  [/компас|підзорн|секстант/, 'navigation'], [/голк|нитк|латк/, 'sewing'],
  [/кост[іи] гральн|гральн|карти(?![а-яіїєґ'’])|колод[аи] карт|кубик/, 'game'],
  [/пастк|капкан/, 'trap'], [/вудк|гачк|сітк|наживк/, 'fishing'],
  [/лютн|флейт|барабан|арф|скрипк|сопілк|ліра|бандур|губн/, 'instrument'],
  [/книг|том(?![а-яіїєґ'’])|фоліант|щоденник|журнал/, 'book'], [/мап[аи]|карта(?![а-яіїєґ'’])/, 'map'], [/сувій|лист(?![а-яіїєґ'’])|записк|пергамент/, 'scroll'],
  [/документ|грамот|печатк|дозвіл|контракт|розписк/, 'document'],
  [/самоцвіт|рубін|смарагд|сапфір|алмаз|діамант|аметист|перлин/, 'gem'], [/злит|золот\S* монет|скарб/, 'valuable'],
  [/кільц|перстен|намист|кулон|браслет|сережк|брошк|прикрас|амулет/, 'jewelry'],
  [/руд[аи]|залізо(?![а-яіїєґ'’])|метал|сталь(?![а-яіїєґ'’])|ірид|мідь(?![а-яіїєґ'’])/, 'ore'], [/шкур|шкір[аи](?![а-яіїєґ'’])/, 'hide'],
  [/кіготь|кігті|зуб|ікл|ріг(?![а-яіїєґ'’])|роги|кістк|череп|луск|пір['’]?я|трофей/, 'trophy'],
  [/трав|корін|корен|лист[яь]|квіт|гриб|брунь|ягід|насінн|пелюст|мох/, 'ingredient'],
  [/дошк|дерев|тканин|полотн|нитки|мішковин/, 'material'],
  [/скрин|ящик|коробк|шкатулк|мішок|торб/, 'container'],
  [/кайл|лопат|сокирк|пилк|молоток|ніж для|долото|клещ|кліщ|набір|інструмент/, 'tool'],
  [/свят|оберіг|ікон|чотки|реліквія/, 'holy'], [/артефакт/, 'artifact'],
]
export function guessGearCategory(name, siteType = '') {
  const n = low(name)
  for (const [re, cat] of GEAR_RULES) if (re.test(n)) return cat
  return GEAR_BY_TYPE[siteType] ?? 'item'
}

/** Категорія зброї за назвою. Повертає [категорія, певність] */
export function guessWeaponCategory(name) {
  const n = low(name)
  const rules = [
    [/кодекс/, 'codex'], [/посох/, 'staff'], [/жезл/, 'wand'], [/тризуб/, 'trident'], [/чакрам/, 'chakram'], [/оберіг/, 'amulet'],
    [/лук|арбалет/, 'bow'], [/метальн|дротик|сюрікен/, 'throw'], [/кастет|кулач/, 'fist'],
    [/дворуч|двуруч|алебард|глефа/, 'twohand'],
    [/кинджал|кинжал|ніж|стилет|батіг|кортик/, 'light'],
    [/тяжк|важк|бастард|молот|булав|клевец/, 'heavy1h'],
    [/меч|сокир|спис|шабл|рапір/, 'onehand'],
  ]
  for (const [re, cat] of rules) if (re.test(n)) return [cat, true]
  return ['onehand', false]
}
const TWO_HANDED = new Set(['twohand', 'bow', 'staff', 'trident'])
/** Боєприпаси, що на сайті лежать як «зброя» */
const isAmmo = name => has(name, /стріл|болт|сагайдак|колчан/)

/** Слот обладунку за назвою предмета */
export function guessArmorSlot(name, type = '') {
  if (type === 'belt') return 'Пояс'
  if (type === 'bag') return 'Рюкзак'
  if (type === 'shield') return 'Щит'
  const n = low(name)
  const rules = [
    [/шолом|бацинет|діадем|капелюх|шапк/, 'Шолом'], [/понож/, 'Поножі'], [/рукавиц|перчат/, 'Рукавиці'], [/чобіт|чобот|черевик/, 'Чоботи'],
    [/накидк|плащ|капюшон/, 'Плащ_накидка'], [/щит/, 'Щит'], [/пояс/, 'Пояс'], [/рюкзак|сумк/, 'Рюкзак'],
    [/амулет|намист|кулон|мішочок/, 'Шия'], [/кільц|перстен|каблуч/, 'Палець_п'], [/браслет/, 'Кисть_л'],
    [/одяг|сорочк|мантія|роба/, 'Одяг'], [/кирас|броня|обладун|сет|кольчуг/, 'Кираса'],
  ]
  for (const [re, slot] of rules) if (re.test(n)) return slot
  return type === 'clothes' ? 'Одяг' : 'Кираса'
}
/** Клас обладунку за назвою: [клас, підігнаний, певність] */
export function guessArmorClass(name) {
  const n = low(name)
  const fitted = /підігн/.test(n)
  if (/тяжк|важк|орч|ірід|латн/.test(n)) return ['heavy', fitted, true]
  if (/середн|средн/.test(n)) return ['medium', fitted, true]
  if (/легк/.test(n)) return ['light', fitted, true]
  return ['none', fitted, false]
}
const shieldSize = name => has(name, /башен|баштов|ростов/) ? 'large' : has(name, /кулач|баклер|малий/) ? 'small' : 'medium'
const beltSlotsFrom = (name, raw) => {
  const m = low(name).match(/(\d+)\s*слот/)
  return m ? Number(m[1]) : pos(raw?.slotAmount)
}
const priceOf = p => Object.fromEntries(Object.keys(GOD.MONEY).map(k => [k, pos(p?.[k])]))

/** Опис предмета: опис + ефекти + свіжість/читання — у HTML */
function itemDescription(raw) {
  const parts = [textToHtml(raw.description)]
  const eff = [].concat(raw.effects ?? []).map(e => typeof e === 'string' ? e : (e?.name ?? e?.text ?? '')).filter(Boolean)
  if (raw.activeEffect && typeof raw.activeEffect === 'string') eff.unshift(raw.activeEffect)
  if (eff.length) parts.push(`<p><b>Ефекти:</b> ${eff.map(esc).join('; ')}</p>`)
  if (str(raw.freshness)) parts.push(`<p><b>Свіжість:</b> ${esc(raw.freshness)}</p>`)
  if (num(raw.hoursNeedToRead)) parts.push(`<p><b>Читання:</b> ${num(raw.hoursAlreadyRead)} з ${num(raw.hoursNeedToRead)} год</p>`)
  return parts.filter(Boolean).join('')
}

/**
 * Предмет сайту → дані Item. opts.location — розділ інвентаря, opts.equipped / opts.hand / opts.slot — для одягненого.
 * Повертає { item, notes[] } — нотатки для звіту («категорію вгадано»).
 */
export function itemFromSite(raw, opts = {}) {
  const r = itemFromSiteRaw(raw, opts)
  r.item.img = defaultIcon(r.item.type, r.item.system)
  return r
}
function itemFromSiteRaw(raw, opts = {}) {
  const notes = []
  const name = str(raw?.name) || 'Предмет'
  const type = str(raw?.type) || 'misc'
  const base = {
    description: itemDescription(raw ?? {}),
    quantity: Math.max(1, int(raw?.amount ?? 1) || 1),
    weight: Math.max(0, Math.round(num(raw?.weightPerOne ?? raw?.weight) * 100) / 100),
    price: priceOf(raw?.price),
    location: opts.location ?? 'main',
    equipped: !!opts.equipped,
    isMagic: !!raw?.isMagic, isCursed: !!raw?.isCursed, isBlessed: !!raw?.isBlessed,
  }
  const flags = { god: { site: { type } } }

  if ((type === 'weapon' || opts.hand) && !isAmmo(name)) {
    const [category, sure] = guessWeaponCategory(name)
    if (!sure) notes.push(`«${name}»: категорію зброї не впізнано, поставлено «${GOD.WEAPON_CATEGORIES[category]}»`)
    if (/кодекс/.test(low(name))) base.spellStatMult = true
    return { notes, item: { name, type: 'weapon', flags, system: {
      ...base, category, phys: int(raw?.physicalDamage), mag: int(raw?.magicalDamage),
      hand: opts.hand === 'off' ? 'off' : 'main', twoHanded: TWO_HANDED.has(category),
    } } }
  }

  const bag = num(raw?.additionalMaxWeight)
  const armorTypes = ['armor', 'clothes', 'belt', 'shield', 'bag']
  if (armorTypes.includes(type) || opts.slot || (type === 'container' && bag > 0)) {
    const slot = opts.slot ?? (type === 'container' ? 'Рюкзак' : guessArmorSlot(name, type))
    if (slot === 'Щит' && has(name, /сагайдак|колчан/)) {
      return { notes, item: { name, type: 'gear', flags, system: { ...base, equipped: false, category: 'ammo' } } }
    }
    const [armorClass, fitted, sure] = BODY_SLOTS.includes(slot) ? guessArmorClass(name) : ['none', false, true]
    const phys = int(opts.phys ?? raw?.physicalResistance), mag = int(opts.mag ?? raw?.magicalResistance)
    if (!sure && phys > 0) notes.push(`«${name}» (${GOD.ARMOR_SLOTS[slot]}): клас обладунку не вказано — став легкий/середній/тяжкий, від нього залежить ШУ`)
    const system = { ...base, slot, armorClass, fitted, phys, mag }
    if (slot === 'Щит') system.shieldSize = shieldSize(name)
    if (slot === 'Пояс') { system.beltSlots = beltSlotsFrom(name, raw); if (!system.beltSlots) notes.push(`«${name}»: кількість слотів пояса невідома — вкажи в предметі`) }
    if (slot === 'Рюкзак') { system.bagBonus = Math.max(0, bag); if (!bag) notes.push(`«${name}»: бонус ваги рюкзака невідомий — вкажи в предметі`) }
    return { notes, item: { name, type: 'armor', flags, system } }
  }

  // Тип сайту точний для зілль, їжі, книг, інгредієнтів; для «misc/other/instrument» — вгадуємо за назвою
  const exact = ['potion', 'food', 'book', 'ingredient', 'scroll', 'jewellery'].includes(type)
  let category = exact ? GEAR_BY_TYPE[type] : guessGearCategory(name, type)
  if (isAmmo(name)) category = 'ammo'
  if (category === 'item' && opts.location && GOD.LOCATION_CATEGORY[opts.location]) category = GOD.LOCATION_CATEGORY[opts.location]
  const consumable = ['potion', 'food', 'drink', 'medicine'].includes(category)
  return { notes, item: { name, type: 'gear', flags, system: { ...base, category, consumable } } }
}

const BODY_SLOTS = ['Кираса', 'Поножі', 'Шолом', 'Рукавиці', 'Чоботи']
/** «Легкий / Середній / Тяжкий (підігнаний) обладунок» в ефектах — лише якщо клас один */
export function armorClassFromEffects(list = []) {
  const found = new Map()
  for (const e of list ?? []) {
    const t = low(typeof e === 'string' ? e : e?.name).replace(/\*/g, '')
    const m = t.match(/(легк|середн|средн|тяжк|важк)\S*\s+(підігнан\S*\s+)?обладун/)
    if (!m) continue
    const cls = m[1].startsWith('легк') ? 'light' : /^(середн|средн)/.test(m[1]) ? 'medium' : 'heavy'
    found.set(cls, (found.get(cls) ?? false) || !!m[2])
  }
  if (found.size !== 1) return null
  const [[cls, fitted]] = found
  return { cls, fitted }
}

/** Слоти обладунку на сайті (_armor) → одягнені предмети */
function armorFromSite(armor = {}) {
  const out = [], notes = []
  for (const [slot, v] of Object.entries(armor ?? {})) {
    const name = str(v?.name)
    if (!name || !GOD.ARMOR_SLOTS[slot]) continue
    const raw = { ...(v.equipped && typeof v.equipped === 'object' ? v.equipped : {}), name }
    if (raw.weightPerOne === undefined) raw.weightPerOne = v.w
    const r = itemFromSite(raw, { slot, equipped: true, phys: v.phys ?? raw.physicalResistance, mag: v.mag ?? raw.magicalResistance })
    out.push(r.item); notes.push(...r.notes)
  }
  return { items: out, notes }
}

/** Зброя в руках (wr-/wl-) → одягнені предмети */
function handsFromSite(sd) {
  const out = [], notes = []
  for (const [p, hand] of [['wr', 'main'], ['wl', 'off']]) {
    const eq = sd[`${p}-equipped`]
    const name = str(eq?.name ?? sd[`${p}-name`])
    if (!name) continue
    const raw = { ...(eq && typeof eq === 'object' ? eq : {}), name, type: 'weapon' }
    raw.physicalDamage ??= sd[`${p}-phys`]; raw.magicalDamage ??= sd[`${p}-mag`]; raw.weightPerOne ??= sd[`${p}-weight`]
    const r = itemFromSite(raw, { hand, equipped: true })
    out.push(r.item); notes.push(...r.notes)
  }
  return { items: out, notes }
}

/** Здібності й заклинання сайту (_spells) → здібності (на сайті всі вони «ability») */
function abilitiesFromSite(list = []) {
  return (list ?? []).filter(s => str(s?.name)).map(s => {
    const facts = [
      ['Рівень', s.level], ['Час', s.timeToCast], ['Тип', s.attackType], ['Радіус', s.radiusCast], ['Сила', s.power],
      ['Школа', s.school],
    ].filter(([, v]) => str(v)).map(([k, v]) => `<b>${k}:</b> ${esc(v)}`)
    const description = (facts.length ? `<p>${facts.join(' · ')}</p>` : '') + textToHtml(s.description)
      + (str(s.upgrades) ? `<h4>Покращення</h4>${textToHtml(s.upgrades)}` : '')
    return { name: str(s.name), type: 'ability', img: defaultIcon('ability'), system: {
      description, manaCost: pos(s.manaCost), staminaCost: pos(s.enduranceCost), cooldown: str(s.coolDown),
    } }
  })
}

/** Дебафи (_traits_v2) і квірки (_quirks) → риси */
function traitsFromSite(sd) {
  const out = []
  for (const t of sd._traits_v2 ?? []) {
    const name = str(t?.name); if (!name) continue
    out.push({ name, type: 'trait', img: defaultIcon('trait', { kind: 'debuff' }), system: {
      kind: 'debuff', cost: str(t.cost), points: Math.min(GOD.BALANCE.DEBUFF_MAX_EACH, pos(t.cost)),
      controlled: /\((к|k)\)/i.test(name), description: textToHtml(t.desc),
    } })
  }
  for (const t of sd._quirks ?? []) {
    const name = str(t?.name); if (!name) continue
    out.push({ name, type: 'trait', img: defaultIcon('trait', { kind: 'quirk' }), system: { kind: 'quirk', cost: str(t.cost), description: textToHtml(t.desc) } })
  }
  return out
}

/**
 * Текстові «ефекти» сайту — це позначки й нотатки (слава в місті, правила обладунку, старі дебафи),
 * а не механіка. Тому вони йдуть розділом у біографію / нотатки, а не в активні ефекти.
 */
const siteEffectTexts = list => (list ?? []).map(e => (typeof e === 'string' ? e : e?.name)).map(str).filter(Boolean)
export const SITE_EFFECTS_TITLE = 'Ефекти й позначки з сайту'
export function siteEffectsHtml(list) {
  const texts = siteEffectTexts(list)
  if (!texts.length) return ''
  const li = t => {
    const m = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(t)
    return m ? `<li><b>${esc(m[1].replace(/:$/, ''))}</b>${m[2] ? ` — ${esc(m[2]).replace(/\n/g, '<br>')}` : ''}</li>` : `<li>${esc(t.replace(/\*\*/g, '')).replace(/\n/g, '<br>')}</li>`
  }
  return `<h3>${SITE_EFFECTS_TITLE}</h3><ul>${texts.map(li).join('')}</ul>`
}

/** Вміння: _skillLevels / _skillFloor ("cat-table::Назва") → skills, floors, особливі вміння */
function skillsFromSite(sd, notes) {
  const skills = Object.fromEntries(Object.keys(GOD.SKILL_CATEGORIES).map(c => [c, {}]))
  const floors = {}
  const custom = (sd._customSkills ?? []).filter(c => str(c?.name)).map(c => ({
    id: str(c._id).replace(/[^A-Za-z0-9]/g, '').slice(0, 16).padEnd(16, '0'),
    name: str(c.name), cat: SITE_CATS[c.cat] ?? 'magic',
    cost: Math.min(10, Math.max(2, int(c.cost) || 5)), max: Math.min(10, Math.max(1, int(c.max) || 10)), lvl: 0, floor: 0,
  }))
  const read = (src, apply) => {
    for (const [k, v] of Object.entries(src ?? {})) {
      const [, rawName = k] = k.split('::')
      const name = SKILL_ALIASES[rawName] ?? rawName
      const key = skillKey(name), meta = GOD.SKILL_INDEX[key]
      if (meta) { apply(meta.cat, key, int(v)); continue }
      const c = custom.find(x => x.name === rawName)
      if (c) { apply(null, c, int(v)); continue }
      if (int(v) > 0 && apply === setLvl) notes.push(`Вміння «${rawName}» (${int(v)}) не знайдено в системі — не перенесено`)
    }
  }
  const setLvl = (cat, key, v) => { if (cat) skills[cat][key] = Math.max(0, v); else key.lvl = Math.max(0, Math.min(key.max, v)) }
  const setFloor = (cat, key, v) => { if (cat) floors[key] = Math.max(0, v); else key.floor = Math.max(0, Math.min(key.max, v)) }
  read(sd._skillLevels, setLvl)
  read(sd._skillFloor, setFloor)
  return { skills, floors, custom }
}

/** XP: сайт тримає рівень і досвід у межах рівня; система — загальний досвід */
export function xpFromSite(level, current) {
  const L = pos(level), into = pos(current)
  return R.totalXpForLevel(L) + Math.min(into, R.xpForLevel(L) - 1)
}

/** Біографія: повне ім'я, зовнішність, мотивація, передісторія, нотатки */
function biographyFromSite(sd) {
  const sec = (title, html) => html ? `<h3>${title}</h3>${html}` : ''
  return [
    sec("Повне ім'я", textToHtml(sd.name_full)), sec('Зовнішність', textToHtml(sd.appearance)),
    sec('Мотивація', textToHtml(sd.motivation)), sec('Передісторія', textToHtml(sd.backstory)), sec('Нотатки', textToHtml(sd._notes)),
    siteEffectsHtml(sd._effects),
  ].join('')
}

/**
 * Лист персонажа сайту → { actor, avatar, resources, notes }.
 * resources — максимуми з сайту: доплату (bonus) до них рахує імпортер на тимчасовому акторі,
 * бо авто-максимум залежить від характеристик і шкіл.
 */
export function characterFromSite(entry) {
  const sd = entry?.sheet ?? {}
  const notes = []
  const name = str(sd.name_known) || str(entry?.slotName) || 'Персонаж з сайту'
  const { skills, floors, custom } = skillsFromSite(sd, notes)
  const stats = Object.fromEntries(Object.keys(GOD.STATS).map(k => [k, { value: pos(sd[`stat-${k}`] ?? 15) }]))
  const statFloors = Object.fromEntries(Object.entries(sd._statFloor ?? {}).filter(([k]) => GOD.STATS[k]).map(([k, v]) => [k, pos(v)]))
  const resources = Object.fromEntries(Object.keys(GOD.RESOURCES).map(k => [k, { value: int(sd[`res-cur-${k}`]), bonus: 0 }]))
  resources.pr = { value: pos(sd['res-cur-pr']) }
  resources.mr = { value: pos(sd['res-cur-mr']) }
  const siteMax = Object.fromEntries(Object.keys(GOD.RESOURCES).map(k => [k, sd[`res-max-${k}`]]).filter(([, v]) => str(v) !== '').map(([k, v]) => [k, int(v)]))

  const items = [], itemNotes = []
  for (const [sec, loc] of Object.entries(SITE_SECTIONS)) {
    for (const raw of sd[sec] ?? []) {
      if (!str(raw?.name)) continue
      const r = itemFromSite(raw, { location: loc })
      items.push(r.item); itemNotes.push(...r.notes)
    }
  }
  const arm = armorFromSite(sd._armor), hands = handsFromSite(sd)
  items.push(...arm.items, ...hands.items, ...abilitiesFromSite(sd._spells), ...traitsFromSite(sd))
  let allNotes = [...arm.notes, ...hands.notes, ...itemNotes]

  // Клас обладунку часто записаний ефектом персонажа («Середній підігнаний обладунок»).
  // Якщо там рівно один клас — ставимо його всім частинам обладунку без класу.
  const fromEffects = armorClassFromEffects(sd._effects)
  if (fromEffects) {
    for (const it of items) {
      if (it.type !== 'armor' || it.system.armorClass !== 'none' || !(it.system.phys > 0) || !BODY_SLOTS.includes(it.system.slot)) continue
      it.system.armorClass = fromEffects.cls
      it.system.fitted ||= fromEffects.fitted
      allNotes = allNotes.filter(n => !n.startsWith(`«${it.name}» (`))
    }
    notes.push(`Клас обладунку взято з ефекту персонажа: ${GOD.ARMOR_CLASSES[fromEffects.cls].toLowerCase()}${fromEffects.fitted ? ', підігнаний' : ''}`)
  }
  // Ручна максимальна вага на сайті — уже підсумок, бонус рюкзака до неї не потрібен
  if (num(sd.max_weight_override) > 0) allNotes = allNotes.filter(n => !n.includes('бонус ваги рюкзака'))
  notes.push(...allNotes)

  const recipes = (sd._recipes ?? []).filter(r => str(r?.name)).map(r => ({ name: str(r.name), source: str(r.source), desc: str(r.desc) }))
  const level = pos(sd.level)
  const actor = {
    name, type: 'character',
    system: {
      stats, resources, skills, customSkills: custom,
      floors: { skills: floors, stats: statFloors },
      progress: { xp: xpFromSite(level, sd.xp_current), skillPoints: int(sd.skill_pts), statPoints: int(sd.stat_pts) },
      money: Object.fromEntries(Object.keys(GOD.MONEY).map(k => [k, pos(sd[k])])),
      reputation: { fame: int(sd.fame), karma: int(sd.karma), infame: int(sd.infame), status: int(sd.status_val), crits: pos(sd.crits), luck: pos(sd.luck) },
      encumbrance: { override: Math.max(0, num(sd.max_weight_override)) },
      details: { race: str(sd.race), age: str(sd.age), origin: '' },
      biography: biographyFromSite(sd),
      knowledge: { languages: [], recipes, tech: [] },
    },
    items, effects: [],
    flags: { god: { siteId: `char:${entry?.id}`, siteParty: str(entry?.party) } },
  }
  const avatar = typeof sd.avatar === 'string' && sd.avatar.startsWith('data:image/') ? sd.avatar : null
  return { actor, avatar, siteMax, notes }
}

/** Ворог з «Бою майстра» → НІП на картці ворога */
export function npcFromSite(e) {
  const hp = int(e?.hp), om = pos(e?.om), mt = pos(e?.mt)
  const actor = {
    name: str(e?.name) || 'Ворог', type: 'npc',
    system: {
      resources: {
        hp: { value: hp, max: Math.max(hp, 1) }, mp: { value: om, max: om }, mt: { value: mt, max: mt }, ed: { value: 0, max: 0 },
        pr: { value: pos(e?.pr), base: pos(e?.pr) }, mr: { value: pos(e?.mr), base: pos(e?.mr) },
      },
      dodge: pos(e?.dc), initiative: int(e?.in),
      attack: { name: 'Атака', phys: pos(e?.pd), mag: pos(e?.md) },
      notes: siteEffectsHtml(e?.effects),
    },
    items: [], effects: [],
    flags: { god: { siteId: `enemy:${e?.party ?? ''}:${e?.id}`, siteParty: str(e?.partyName) } },
  }
  return { actor, notes: hp <= 0 ? [`${actor.name}: HP ${hp} — на сайті вже переможений`] : [] }
}

/** Віз / склад пачки з сайту → візок світу (вкладка «Візки» у гравців) */
export function wagonFromSite(st) {
  const notes = []
  const items = (st?.items ?? []).filter(i => str(i?.name)).map(raw => { const r = itemFromSite(raw, { location: 'main' }); notes.push(...r.notes); return r.item })
  for (const it of items) if ('equipped' in it.system) it.system.equipped = false
  return { wagon: { name: str(st?.name) || 'Візок', party: str(st?.partyName), capacity: Math.max(0, num(st?.maxW)), siteId: `storage:${st?.id}`, items }, notes }
}

/** Зведення файлу експорту для вікна імпорту: що є і що позначити за замовчуванням */
export function summarizeExport(data) {
  const chars = (data?.characters ?? []).map(c => {
    const sd = c.sheet ?? {}
    const name = str(sd.name_known) || str(c.slotName) || '(без імені)'
    const test = /test|тест/i.test(str(c.party)) || /^тест/i.test(name) || (!c.party && Object.keys(sd).length < 30)
    return { id: c.id, name, level: pos(sd.level), party: str(c.party), archived: !!c.archived, test, checked: !c.archived && !test && !!c.party }
  })
  const enemies = (data?.enemies ?? []).map(e => ({ id: `${e.party}:${e.id}`, name: str(e.name) || 'Ворог', party: str(e.partyName), hp: int(e.hp), checked: int(e.hp) > 0 }))
  const groups = [
    { key: 'gmItems', label: 'Предмети майстра', count: (data?.gmItems ?? []).length },
    ...(data?.merchants ?? []).map(m => ({ key: `merchant:${m.id}`, label: `Торговець: ${str(m.name)}${str(m.location) ? ` (${str(m.location)})` : ''}`, count: (m.items ?? []).length })),
  ].filter(g => g.count > 0)
  const storages = (data?.storages ?? []).map(s => {
    const n = (s.items ?? []).length
    return { id: s.id, name: str(s.name) || 'Сховище', party: str(s.partyName), count: n, capacity: num(s.maxW), checked: n > 0 && !/test|тест/i.test(str(s.partyName)) }
  })
  return { chars, enemies, groups, storages }
}
