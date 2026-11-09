/**
 * Моделі даних акторів. Схема генерується з config.mjs: кожне вміння — окреме
 * валідоване поле з власним максимумом, тож некоректне значення Foundry відкине сам.
 */
import { GOD } from '../config.mjs'
import * as R from '../rules.mjs'

const f = foundry.data.fields
const int = (initial = 0, opts = {}) => new f.NumberField({ required: true, integer: true, initial, ...opts })
const flt = (initial = 0, opts = {}) => new f.NumberField({ required: true, initial, ...opts })

const resourceField = () => new f.SchemaField({ value: int(0), bonus: int(0) })
const moneyField = () => new f.SchemaField(
  Object.fromEntries(Object.keys(GOD.MONEY).map(k => [k, int(0, { min: 0 })]))
)

/** Спільні похідні від предметів (використовуються і персонажем, і НІП) */
function itemTotals(actor) {
  const t = { equippedWeight: 0, totalWeight: 0, pr: 0, mr: 0, bagBonus: 0, beltSlots: 0, beltUsed: 0, spellStatMult: false, armorKeys: [] }
  for (const it of actor.items) {
    const s = it.system
    const w = (Number(s.weight) || 0) * (Number(s.quantity) || 1)
    t.totalWeight += w
    if (s.location === 'belt') t.beltUsed++
    if (!s.equipped) continue
    if (it.type === 'weapon' || it.type === 'armor') t.equippedWeight += w
    if (it.type === 'armor') {
      t.armorKeys.push(R.armorClassKey(s.armorClass, s.fitted))
      t.pr += Number(s.phys) || 0
      t.mr += Number(s.mag) || 0
      if (s.slot === 'Щит') t.shield = s.shieldSize || 'small'
      if (s.slot === 'Рюкзак') t.bagBonus += Number(s.bagBonus) || 0
      if (s.slot === 'Пояс')   t.beltSlots += Number(s.beltSlots) || 0
    }
    if (s.spellStatMult) t.spellStatMult = true
  }
  t.armor = R.armorDodgeMod(t.armorKeys)
  t.shieldDodge = t.shield ? (R.SHIELD_DODGE[t.shield] ?? 0) : 0
  t.equippedWeight = Math.round(t.equippedWeight * 100) / 100
  t.totalWeight = Math.round(t.totalWeight * 100) / 100
  return t
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const skillCats = {}
    for (const [cat, c] of Object.entries(GOD.SKILL_CATEGORIES)) {
      skillCats[cat] = new f.SchemaField(Object.fromEntries(
        c.skills.map(s => [s.key, int(0, { min: 0, max: s.max })])
      ))
    }
    return {
      stats: new f.SchemaField(Object.fromEntries(
        Object.keys(GOD.STATS).map(k => [k, new f.SchemaField({ value: int(15, { min: 0 }) })])
      )),
      resources: new f.SchemaField({
        ...Object.fromEntries(Object.keys(GOD.RESOURCES).map(k => [k, resourceField()])),
        pr: new f.SchemaField({ value: int(0) }),
        mr: new f.SchemaField({ value: int(0) }),
      }),
      skills: new f.SchemaField(skillCats),
      schools: new f.SchemaField(Object.fromEntries(
        Object.keys(GOD.SPELL_SCHOOLS).map(k => [k, int(0, { min: 0, max: 10 })])
      )),
      progress: new f.SchemaField({
        xp: int(0, { min: 0 }),
        skillPoints: int(GOD.BALANCE.START_SKILL_PTS),
        statPoints: int(0),
      }),
      combat: new f.SchemaField({
        dodgeBonus: int(0),   // ручна правка майстра (±), поверх динамічного ШУ
        hitMod: int(0),       // від стійок/ефектів
        damageMod: int(0),
      }),
      encumbrance: new f.SchemaField({ override: flt(0, { min: 0 }) }),
      money: moneyField(),
      details: new f.SchemaField({
        race: new f.StringField({ initial: '' }),
        origin: new f.StringField({ initial: '' }),
        age: new f.StringField({ initial: '' }),
      }),
      biography: new f.HTMLField({ initial: '' }),

      // Зафіксований розвиток: нижче цих рівнів гравець не опуститься (як «Зберегти» на сайті)
      floors: new f.SchemaField({
        skills: new f.ObjectField({ initial: {} }),
        stats: new f.ObjectField({ initial: {} }),
      }),
      // Особливі вміння, які додає майстер
      customSkills: new f.ArrayField(new f.SchemaField({
        id: new f.StringField({ required: true, initial: () => foundry.utils.randomID() }),
        name: new f.StringField({ initial: 'Особливе вміння' }),
        cat: new f.StringField({ choices: Object.keys(GOD.SKILL_CATEGORIES), initial: 'magic' }),
        cost: int(5, { min: 2, max: 10 }),
        max: int(10, { min: 1, max: 10 }),
        lvl: int(0, { min: 0 }),
        floor: int(0, { min: 0 }),
      })),
      reputation: new f.SchemaField(Object.fromEntries(Object.entries(GOD.REPUTATION).map(([k, r]) => [k, r.max ? int(0, { min: 0, max: r.max }) : int(0)]))),
      knowledge: new f.SchemaField({
        languages: new f.ArrayField(new f.SchemaField({ name: new f.StringField({ initial: '' }), level: new f.StringField({ initial: '' }) })),
        recipes: new f.ArrayField(new f.SchemaField({ name: new f.StringField({ initial: '' }), source: new f.StringField({ initial: '' }), desc: new f.StringField({ initial: '' }) })),
        tech: new f.ArrayField(new f.SchemaField({ name: new f.StringField({ initial: '' }), source: new f.StringField({ initial: '' }), desc: new f.StringField({ initial: '' }) })),
      }),
    }
  }

  /** Міграція джерела: старі записи без нових полів отримують коректні значення */
  static migrateData(source) {
    if (source.reputation?.status_val !== undefined) {           // назва поля з сайту
      source.reputation.status ??= source.reputation.status_val
      delete source.reputation.status_val
    }
    // Крити ≤ 30, вдача ≤ 5
    for (const [k, r] of Object.entries(GOD.REPUTATION)) {
      if (r.max && source.reputation && typeof source.reputation[k] === 'number') source.reputation[k] = Math.max(0, Math.min(r.max, source.reputation[k]))
    }
    // Максимуми вмінь звірено з правилами (напр. Хірургія 10 → 5): зайве повертаємо очками
    for (const [cat, c] of Object.entries(GOD.SKILL_CATEGORIES)) {
      const lv = source.skills?.[cat]
      if (!lv) continue
      for (const s of c.skills) {
        if (!(lv[s.key] > s.max)) continue
        if (source.progress) source.progress.skillPoints = (source.progress.skillPoints ?? 0) + R.skillInvested(s.cost, lv[s.key]) - R.skillInvested(s.cost, s.max)
        lv[s.key] = s.max
        if (source.floors?.skills?.[s.key] > s.max) source.floors.skills[s.key] = s.max
      }
    }
    return super.migrateData(source)
  }

  /** Рівень вміння за ключем (включно з особливими: "custom:<id>") */
  skill(key) {
    if (key?.startsWith?.('custom:')) return this.customSkills.find(s => s.id === key.slice(7))?.lvl ?? 0
    const meta = GOD.SKILL_INDEX[key]
    return meta ? (this.skills[meta.cat]?.[key] ?? 0) : 0
  }

  /** Чи є незафіксований розвиток (вкачано більше, ніж зафіксовано) */
  get hasPendingBuild() {
    for (const [cat, c] of Object.entries(GOD.SKILL_CATEGORIES)) {
      for (const s of c.skills) if ((this.skills[cat][s.key] ?? 0) > (this.floors.skills[s.key] ?? 0)) return true
    }
    for (const k of Object.keys(GOD.STATS)) { const v = this.stats[k].base ?? this.stats[k].value; if (v > (this.floors.stats[k] ?? v)) return true }
    return this.customSkills.some(s => s.lvl > s.floor)
  }

  prepareDerivedData() {
    const actor = this.parent
    const t = itemTotals(actor)

    // Володіння школами — з вмінь «Сила води/повітря/землі/вогню»; інші школи — з особливого вміння майстра
    // з назвою школи в гілці «Магія» (напр. «Сила світла»), інакше — як було збережено раніше
    for (const k of Object.keys(GOD.SPELL_SCHOOLS)) {
      if (GOD.SCHOOL_SKILLS[k]) { this.schools[k] = this.skill(GOD.SCHOOL_SKILLS[k]); continue }
      const stem = GOD.SPELL_SCHOOLS[k].toLowerCase().slice(0, 4)
      const c = this.customSkills.find(x => x.cat === 'magic' && x.name.toLowerCase().includes(stem))
      if (c) this.schools[k] = c.lvl
    }
    // Бонус від шкіл магії додається до значення; base — те, що вкачано
    const school = R.schoolStatBonus(this.schools)
    for (const [k, s] of Object.entries(this.stats)) {
      s.base = s.value
      s.bonus = school[k] ?? 0
      s.value += s.bonus
      s.mod = R.statMod(s.value)
    }

    for (const [k, cfg] of Object.entries(GOD.RESOURCES)) {
      const r = this.resources[k]
      r.auto = Math.round((this.stats[cfg.stat]?.value || 0) * cfg.mult)
      r.max = r.auto + (r.bonus || 0)
    }
    this.resources.pr.max = t.pr + (t.shield ? R.shieldPrBonus(this.skill('Щити')) : 0)
    this.resources.mr.max = t.mr

    const level = R.levelFromXp(this.progress.xp)
    const dodgeAuto = R.calcDodge({
      equippedWeight: t.equippedWeight,
      enduranceCurrent: this.resources.ed.value,
      dodgeSkill: this.skill('Ухиляння'),
    })
    this.derived = {
      level,
      xpNext: R.totalXpForLevel(level + 1),
      equippedWeight: t.equippedWeight,
      totalWeight: t.totalWeight,
      maxWeight: R.calcMaxWeight({ override: this.encumbrance.override, muleLvl: this.skill('Мул'), bagBonus: t.bagBonus }),
      belt: { slots: t.beltSlots, used: t.beltUsed },
      dodgeAuto,
      armorDodge: t.armor.mod, armorWorst: t.armor.worst, shieldDodge: t.shieldDodge, shield: t.shield ?? null,
      dodge: Math.max(0, Math.min(R.MAX_DODGE, dodgeAuto + t.armor.mod + t.shieldDodge + (this.combat.dodgeBonus || 0))),
      dodgeParts: R.dodgeParts({
        equippedWeight: t.equippedWeight, enduranceCurrent: this.resources.ed.value,
        dodgeSkill: this.skill('Ухиляння'), bonus: this.combat.dodgeBonus,
      }),
      speed: R.calcSpeed(this.skill('Спринт')),
      initiative: R.calcInitiative(this.resources.ed.value),
      spellStatMult: t.spellStatMult,
    }
    this.derived.overloaded = this.derived.totalWeight > this.derived.maxWeight
    this.derived.pendingBuild = this.hasPendingBuild
  }
}

/**
 * НІП — повноцінний супротивник: характеристики, школи магії, броня з предметів,
 * інвентар. Здоров'я/мана/витривалість — ручний максимум; PR/MR = власна база + одягнена броня.
 * Влучність і володіння беруться з блоку «Атака» (у НІП немає дерева вмінь).
 */
export class NpcData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      stats: new f.SchemaField(Object.fromEntries(
        Object.keys(GOD.STATS).map(k => [k, new f.SchemaField({ value: int(10, { min: 0 }) })])
      )),
      resources: new f.SchemaField({
        hp: new f.SchemaField({ value: int(100), max: int(100) }),
        mp: new f.SchemaField({ value: int(0), max: int(0) }),
        ed: new f.SchemaField({ value: int(0), max: int(0) }),
        pr: new f.SchemaField({ value: int(0), base: int(0) }),
        mr: new f.SchemaField({ value: int(0), base: int(0) }),
      }),
      schools: new f.SchemaField(Object.fromEntries(
        Object.keys(GOD.SPELL_SCHOOLS).map(k => [k, int(0, { min: 0, max: 10 })])
      )),
      dodge: int(5),
      size: new f.StringField({ required: true, initial: 'medium', choices: () => Object.keys(GOD.CREATURE_SIZES) }),
      rank: new f.StringField({ required: true, initial: 'regular', choices: () => Object.keys(GOD.CREATURE_RANKS) }),
      initiative: int(0),
      speed: int(3),
      attack: new f.SchemaField({
        name: new f.StringField({ initial: 'Природна атака' }),
        hitMod: int(0),
        damageMod: int(0),
        skillLvl: int(1, { min: 0, max: 10 }),
        phys: int(0),
        mag: int(0),
      }),
      combat: new f.SchemaField({ dodgeBonus: int(0), hitMod: int(0), damageMod: int(0) }),
      money: moneyField(),
      notes: new f.HTMLField({ initial: '' }),
    }
  }

  /** Старі НІП: PR/MR зберігали ручний максимум у max → тепер це база */
  static migrateData(source) {
    for (const k of ['pr', 'mr']) {
      const r = source.resources?.[k]
      if (r && r.max !== undefined && r.base === undefined) { r.base = r.max; delete r.max }
    }
    return super.migrateData(source)
  }

  /** Рівень «вміння» для спільних кидків: володіння зброєю → skillLvl, влучність → hitMod */
  skill(key) {
    if (!key) return 0
    if (PROF_KEYS.has(key)) return this.attack.skillLvl
    if (ACC_KEYS.has(key)) return this.attack.hitMod
    return 0
  }

  prepareDerivedData() {
    const t = itemTotals(this.parent)
    for (const s of Object.values(this.stats)) s.mod = R.statMod(s.value)
    this.resources.pr.max = (this.resources.pr.base || 0) + t.pr
    this.resources.mr.max = (this.resources.mr.base || 0) + t.mr
    this.derived = {
      armorDodge: t.armor.worst ? t.armor.mod : 0, shieldDodge: t.shieldDodge, shield: t.shield ?? null,
      // НІП: база + клас обладунку (лише якщо щось одягнено) + щит + ефекти, × розмір
      dodge: Math.max(0, Math.round(((this.dodge || 0) + (t.armor.worst ? t.armor.mod : 0) + t.shieldDodge + (this.combat.dodgeBonus || 0)) * (R.SIZE_DODGE[this.size] ?? 1))),
      initiative: this.initiative,
      speed: this.speed,
      equippedWeight: t.equippedWeight,
      totalWeight: t.totalWeight,
      maxWeight: 0,
      belt: { slots: t.beltSlots, used: t.beltUsed },
      armorPr: t.pr, armorMr: t.mr,
      spellStatMult: t.spellStatMult,
    }
  }
}

const PROF_KEYS = new Set(Object.values(GOD.WEAPON_SKILLS).map(w => w.prof).filter(Boolean))
const ACC_KEYS = new Set([...Object.values(GOD.WEAPON_SKILLS).map(w => w.acc).filter(Boolean), 'Маг_прицільність'])
