/** Лист ворога (НІП): картка як на сайті — показники, таблиця уражень, атака */
import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'
import * as M from '../roll-mods.mjs'
import { weaponAttack } from '../dice/rolls.mjs'
import { GodActorSheetBase, TPL, enrich } from './sheet-base.mjs'

// ═════════════════════════════════════════════════════════════════════════════
const NPC_TABS = [
  { id: 'overview', label: 'Ворог',       icon: 'fa-solid fa-skull-crossbones' },
  { id: 'gear',     label: 'Інвентар',    icon: 'fa-solid fa-sack' },
  { id: 'magic',    label: 'Магія',       icon: 'fa-solid fa-wand-sparkles' },
  { id: 'effects',  label: 'Ефекти',      icon: 'fa-solid fa-bolt' },
  { id: 'notes',    label: 'Нотатки',     icon: 'fa-solid fa-feather' },
]

/** «Чим б'є» ворог: порожньо — природна атака (загальний удар; лише MD — магічний снаряд) */
export const NPC_LOOKS = { '': 'Природна атака', ...GOD.WEAPON_CATEGORIES }

/** Опис удару ворога для кидка: урон PD/MD, категорія — для анімації й дальності */
export function npcStrike(actor) {
  const look = GOD.WEAPON_CATEGORIES[actor.system.attack.look] ? actor.system.attack.look : ''
  return { name: look ? GOD.WEAPON_CATEGORIES[look] : 'Атака', img: actor.img, natural: true, look,
    system: { category: look || 'onehand', phys: 0, mag: 0, hand: 'main' } }
}

/** НІП: той самий набір, що й у персонажа (броня, інвентар, магія, ефекти), без розвитку */
export class GodNpcSheet extends GodActorSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ['god', 'sheet', 'actor', 'npc'],
    position: { width: 780, height: 700 },
    actions: { npcAttack: GodNpcSheet.#npcAttack, rollStat: GodNpcSheet.#rollStat },
  }
  static PARTS = {
    sidebar:  { template: `${TPL}/npc-sidebar.hbs` },
    tabs:     { template: `${TPL}/tabs.hbs` },
    overview: { template: `${TPL}/npc-overview.hbs`, scrollable: [''] },
    gear:     { template: `${TPL}/gear.hbs`, scrollable: ['.god-inv-main', '.god-inv-detail'] },
    magic:    { template: `${TPL}/magic.hbs`, scrollable: [''] },
    effects:  { template: `${TPL}/effects.hbs`, scrollable: [''] },
    notes:    { template: `${TPL}/npc-notes.hbs`, scrollable: [''] },
  }
  _tab = 'overview'

  /** Атака ворога: урон завжди PD/MD, «Чим б'є» — лише вигляд (анімація, ближній/дальній бій) */
  static #npcAttack() { weaponAttack(this.document, npcStrike(this.document)) }
  static #rollStat(ev, target) { this.document.rollStat(target.dataset.stat) }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const actor = this.document, sys = actor.system
    const items = actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))
    const pct = r => r.max > 0 ? Math.max(0, Math.min(100, r.value / r.max * 100)) : 0
    context.tabs = NPC_TABS.map(t => ({ ...t, active: t.id === this._tab }))
    // HP завжди; OM, MT, ВС — якщо задано максимум (або в режимі редагування, щоб задати)
    const edit = context.editMode
    context.resources = ['hp', 'mp', 'mt', 'ed'].filter(key => key === 'hp' || edit || (sys.resources[key]?.max ?? 0) > 0).map(key => {
      const r = sys.resources[key]
      return { key, abbr: key === 'ed' ? 'ВС' : (GOD.RESOURCES[key]?.abbr ?? key.toUpperCase()), value: r.value, max: r.max, pct: pct(r),
        tip: { hp: "Здоров'я", mp: 'Одхі (мана)', mt: 'Ментальне', ed: 'Витривалість — для здібностей' }[key] }
    })
    // PR/MR у смугах — лише поточне (скільки лишилось); сам захист задається в «Показниках»
    const armorTip = key => `${key === 'pr' ? 'Фізичний' : 'Магічний'} захист: власний ${sys.resources[key].base} + броня з інвентаря ${key === 'pr' ? sys.derived.armorPr : sys.derived.armorMr}`
    for (const key of ['pr', 'mr']) {
      const r = sys.resources[key]
      if (r.max > 0) context.resources.push({ key, abbr: key.toUpperCase(), value: r.value, max: r.max, pct: pct(r), tip: armorTip(key), armor: true })
    }
    // Картка ворога як на сайті: показники з формулами і таблиця уражень 10–150% від PD/MD
    const d = sys.derived
    const dodgeTip = `База ${sys.dodge}${d.armorDodge ? `, обладунок ${d.armorDodge > 0 ? '+' : ''}${d.armorDodge}` : ''}${d.shieldDodge ? `, щит +${d.shieldDodge}` : ''}${sys.combat.dodgeBonus ? `, ефекти ${sys.combat.dodgeBonus > 0 ? '+' : ''}${sys.combat.dodgeBonus}` : ''}${sys.size !== 'medium' ? `, ${GOD.CREATURE_SIZES[sys.size]}` : ''}`
    context.foeStats = [
      { label: 'PD', path: 'system.attack.phys', value: sys.attack.phys, min: true, cls: 'phys', tip: 'Фізичний урон на 100% — база таблиці уражень' },
      { label: 'MD', path: 'system.attack.mag', value: sys.attack.mag, min: true, cls: 'mag', tip: 'Магічний урон на 100% — база таблиці уражень' },
      { label: 'PR', path: 'system.resources.pr.base', value: sys.resources.pr.base, min: true, cls: 'armor', tip: `${armorTip('pr')}. Поточний PR — у смузі ліворуч`,
        shown: sys.resources.pr.max !== sys.resources.pr.base ? sys.resources.pr.max : null, shownTip: `Разом з бронею: ${sys.resources.pr.max}` },
      { label: 'MR', path: 'system.resources.mr.base', value: sys.resources.mr.base, min: true, cls: 'armor', tip: `${armorTip('mr')}. Поточний MR — у смузі ліворуч`,
        shown: sys.resources.mr.max !== sys.resources.mr.base ? sys.resources.mr.max : null, shownTip: `Разом з бронею: ${sys.resources.mr.max}` },
      { label: 'ШУ', path: 'system.dodge', value: sys.dodge, min: true, cls: 'dodge', tip: `Шанс ухилення: попадання по ворогу має бути більше. ${dodgeTip}`,
        shown: d.dodge !== sys.dodge ? d.dodge : null, shownTip: `Підсумкове ШУ: ${dodgeTip}` },
      { label: 'Влучність', path: 'system.attack.hitMod', value: sys.attack.hitMod, tip: 'Додається до кидка попадання' },
      { label: 'Ініціатива', path: 'system.initiative', value: sys.initiative, tip: 'Порядок ходу в бою: більше — раніше' },
      { label: 'Швидкість', path: 'system.speed', value: sys.speed, min: true, tip: 'Клітинок за хід' },
    ]
    const hm = M.hitMods(actor, sys.attack.hitMod, 'влучність')
    context.hitTotal = hm.total
    context.looks = NPC_LOOKS
    const MULTS = [[10, 'Дотик'], [25, 'Слабке'], [50, 'Половина'], [75, 'Сильне'], [100, 'Повне'], [150, 'Крит']]
    const pd = sys.attack.phys || 0, md = sys.attack.mag || 0
    const r1 = n => Math.round(n * 10) / 10
    context.dmgCols = MULTS.map(([pct, tip]) => ({ pct, tip }))
    context.dmgRows = [
      pd && { label: 'PD', cls: 'phys', tip: 'Фізичний урон', values: MULTS.map(([p]) => r1(pd * p / 100)) },
      md && { label: 'MD', cls: 'mag', tip: 'Магічний урон', values: MULTS.map(([p]) => r1(md * p / 100)) },
      pd && md && { label: 'Σ', cls: 'sum', tip: 'Разом: фізичний + магічний', values: MULTS.map(([p]) => r1((pd + md) * p / 100)) },
    ].filter(Boolean)
    context.readySpells = items.filter(i => i.type === 'spell').map(i => GodActorSheetBase.itemRow(i, {
      school: GOD.SPELL_SCHOOLS[i.system.school], castable: R.spellMastery({ type: actor.type, schools: sys.schools, school: i.system.school, level: i.system.level }) > 0,
    }))
    context.abilities = items.filter(i => i.type === 'ability').map(i => GodActorSheetBase.itemRow(i))
    await this._gearContext(context, items)
    this._magicContext(context, items)
    context.notes = await enrich(sys.notes, actor)
    return context
  }
}
