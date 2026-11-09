/**
 * Інвентар персонажа: списки за місцем зберігання, фільтр за типом, сортування
 * і панель-інспектор обраного предмета. Чиста підготовка даних для gear.hbs —
 * лист лише зберігає стан (_inv) і викликає ці функції.
 */
import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'

export const INV_TYPES = [
  { id: 'all', label: 'Усе', icon: 'fa-layer-group', test: () => true },
  { id: 'weapon', label: 'Зброя', icon: 'fa-khanda', test: i => i.type === 'weapon' },
  { id: 'armor', label: 'Броня', icon: 'fa-shield-halved', test: i => i.type === 'armor' },
  { id: 'consumable', label: 'Розхідне', icon: 'fa-flask', test: i => i.type === 'gear' && i.system.consumable },
  { id: 'gear', label: 'Речі', icon: 'fa-box', test: i => i.type === 'gear' && !i.system.consumable },
  { id: 'magic', label: 'Магічне', icon: 'fa-sparkles', test: i => i.system.isMagic },
]
export const INV_SORTS = { manual: 'Свій порядок', name: 'За назвою', weight: 'Найважчі', qty: 'Найбільше штук', type: 'За типом' }
const LOC_ICONS = { main: 'fa-sack', belt: 'fa-grip-lines', quest: 'fa-scroll', tools: 'fa-screwdriver-wrench', books: 'fa-book', ingredients: 'fa-leaf', potions: 'fa-flask', materials: 'fa-cubes', valuables: 'fa-gem' }
const TYPE_ORDER = { weapon: 0, armor: 1, gear: 2 }
const abbr = k => GOD.RESOURCES[k]?.abbr ?? k.toUpperCase()
const round = n => Math.round(n * 100) / 100

export const newInventoryState = () => ({ type: 'all', sort: 'manual', collapsed: new Set(), selected: null })

/** Короткий підпис рядка: суть предмета без відкриття */
export function itemSub(item) {
  const s = item.system
  if (item.type === 'weapon') return [GOD.WEAPON_CATEGORIES[s.category], s.phys && `${s.phys} фіз`, s.mag && `${s.mag} маг`].filter(Boolean).join(' · ')
  if (item.type === 'armor') return [GOD.ARMOR_SLOTS[s.slot], s.phys && `PR ${s.phys}`, s.mag && `MR ${s.mag}`].filter(Boolean).join(' · ')
  const cat = item.type === 'gear' && s.category && s.category !== 'item' ? GOD.GEAR_CATEGORIES[s.category]?.label : ''
  if (item.type === 'gear' && s.consumable) {
    const r = R.restoreList(s.restore).map(x => `${abbr(x.key)} ${x.value > 0 ? '+' : ''}${x.value}`)
    return [cat, ...r].filter(Boolean).join(' · ') || 'розхідне'
  }
  return cat
}

function tagsOf(s) {
  const t = []
  if (s.isMagic) t.push({ icon: 'fa-sparkles', cls: 'magic', tip: 'Магічний' })
  if (s.isBlessed) t.push({ icon: 'fa-sun', cls: 'blessed', tip: 'Благословенний' })
  if (s.isCursed) t.push({ icon: 'fa-skull', cls: 'cursed', tip: 'Проклятий' })
  return t
}

const sorters = {
  manual: (a, b) => (a.sort || 0) - (b.sort || 0),
  name: (a, b) => a.name.localeCompare(b.name, 'uk'),
  weight: (a, b) => b.totalWeight - a.totalWeight || a.name.localeCompare(b.name, 'uk'),
  qty: (a, b) => (b.system.quantity ?? 0) - (a.system.quantity ?? 0) || a.name.localeCompare(b.name, 'uk'),
  type: (a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || (!!b.system.consumable - !!a.system.consumable) || a.name.localeCompare(b.name, 'uk'),
}

/** Списки за місцями зберігання з урахуванням фільтра й сортування */
export function buildInventory(actor, state) {
  const physical = actor.items.filter(i => i.isPhysical)
  const filter = INV_TYPES.find(t => t.id === state.type) ?? INV_TYPES[0]
  const shown = physical.filter(filter.test).sort(sorters[state.sort] ?? sorters.manual)
  if (!state.selected || !actor.items.has(state.selected)) state.selected = shown[0]?.id ?? null
  const belt = actor.system.derived?.belt

  const sections = Object.entries(GOD.INVENTORY_LOCATIONS).map(([loc, label]) => {
    const list = shown.filter(i => i.system.location === loc)
    const all = physical.filter(i => i.system.location === loc)
    return {
      loc, label, icon: LOC_ICONS[loc] ?? 'fa-box', collapsed: state.collapsed.has(loc),
      count: list.length, weight: round(all.reduce((s, i) => s + i.totalWeight, 0)),
      slots: loc === 'belt' && belt ? `${belt.used}/${belt.slots}` : '', slotsOver: loc === 'belt' && belt && belt.used > belt.slots,
      rows: list.map(i => ({
        id: i.id, name: i.name, img: i.img, type: i.type === 'gear' && i.system.consumable ? 'consumable' : i.type, sub: itemSub(i), tags: tagsOf(i.system),
        qty: i.system.quantity ?? 1, showQty: i.type === 'gear' || (i.system.quantity ?? 1) !== 1,
        weight: i.totalWeight, equipped: !!i.system.equipped, equippable: ['weapon', 'armor'].includes(i.type),
        usable: i.type === 'weapon' || (i.type === 'gear' && i.system.consumable),
        empty: (i.system.quantity ?? 1) === 0, selected: i.id === state.selected,
        search: `${i.name} ${itemSub(i)}`.toLowerCase(),
      })),
    }
  }).filter(s => s.count || s.loc === 'main' || (s.loc === 'belt' && belt?.slots))

  return {
    sections,
    types: INV_TYPES.map(t => ({ id: t.id, label: t.label, icon: t.icon, active: t.id === filter.id, count: physical.filter(t.test).length }))
      .filter(t => t.count || t.id === 'all' || t.active),
    sorts: INV_SORTS, sort: state.sort, total: physical.length,
  }
}

/** Панель-інспектор: усе про обраний предмет одним поглядом */
export async function inspectItem(actor, item, { enrich, changeLabel }) {
  if (!item) return null
  const s = item.system, st = actor.system.stats
  const stats = []
  const add = (label, value, cls = '', tip = '') => { if (value !== '' && value !== null && value !== undefined && value !== false) stats.push({ label, value, cls, tip }) }

  if (item.type === 'weapon') {
    const base = R.actorWeaponDamage(actor, item)
    const ws = GOD.WEAPON_SKILLS[s.category] ?? {}
    add('100% урону', [base.phys && `${base.phys} фіз`, base.mag && `${base.mag} маг`].filter(Boolean).join(' + ') || '0', 'big',
      (s.hand === 'off' ? 'Друга рука — без бонусу Сили' : `СИЛ ${st.str.value}×5 + ${s.phys}${base.mag ? ` · ІНТ ${st.int.value}×5 + ${s.mag}` : ''}`) + (base.notes?.length ? ` · ${base.notes.join(', ')}` : ''))
    const abil = actor.type === 'character' ? R.availableAbilities(s.category, actor.system.skill(ws.prof)) : []
    if (abil.length) add('Здібності', abil.map(a => `${a.name}${a.level > 1 ? ` ${a.level}` : ''} (${a.ed} ВС)`).join(', '), '', 'Вибираються у вікні атаки')
    add('Зброя', `${s.phys} фіз${s.mag ? ` · ${s.mag} маг` : ''}`)
    add('Рука', s.hand === 'off' ? 'Друга' : 'Основна')
    add('Радіус', s.range)
    if (s.twoHanded) add('Хват', 'Дворучна')
    if (ws.prof) add('Володіння', actor.system.skill?.(ws.prof) ?? 0, '', ws.prof.replaceAll('_', ' '))
  }
  if (item.type === 'armor') {
    add('Слот', GOD.ARMOR_SLOTS[s.slot])
    if (s.armorClass !== 'none') add('Клас', GOD.ARMOR_CLASSES[s.armorClass])
    if (s.phys) add('PR', s.phys, 'phys')
    if (s.mag) add('MR', s.mag, 'mag')
    if (s.beltSlots) add('Слотів пояса', s.beltSlots)
    if (s.bagBonus) add('+ до ваги', `${s.bagBonus} кг`)
  }
  const qty = s.quantity ?? 1
  add('Вага', qty > 1 ? `${s.weight} × ${qty} = ${item.totalWeight} кг` : `${s.weight} кг`)
  const price = R.formatPrice(s.price, GOD.MONEY)
  if (price) add('Ціна', price)

  const effects = item.effects.map(e => ({
    name: e.name, img: e.img, off: e.disabled || e.isSuppressed,
    note: e.isSuppressed ? 'діє, коли одягнено' : e.disabled ? 'вимкнено' : '',
    changes: e.changes.map(c => `${changeLabel(c.key)} ${Number(c.value) >= 0 ? '+' : ''}${c.value}`).join(' · '),
  }))
  const restore = item.type === 'gear' && s.consumable
    ? R.restoreList(s.restore).map(r => ({ ...r, abbr: abbr(r.key), sign: r.value > 0 ? '+' : '' }))
    : []

  return {
    id: item.id, name: item.name, img: item.img, type: item.type,
    typeLabel: item.type === 'gear' ? `${GOD.GEAR_CATEGORIES[s.category]?.label ?? 'Предмет'}${s.consumable ? ' · розхідне' : ''}` : game.i18n.localize(`TYPES.Item.${item.type}`),
    kicker: itemSub(item), tags: tagsOf(s),
    qty, location: s.location, equipped: !!s.equipped,
    equippable: ['weapon', 'armor'].includes(item.type),
    consumable: item.type === 'gear' && !!s.consumable,
    useLabel: item.type === 'weapon' ? 'Атакувати' : (item.type === 'gear' && s.consumable) ? 'Використати' : 'Показати в чаті',
    useIcon: item.type === 'weapon' ? 'fa-dice-d20' : (item.type === 'gear' && s.consumable) ? 'fa-flask' : 'fa-comment',
    canSplit: qty > 1,
    stats, restore, effects,
    description: await enrich(s.description, item),
  }
}
