/**
 * rules.mjs — ядро правил G.O.D. Чисті функції, жодних залежностей від Foundry.
 * Перевіряється звичайним Node (tests/rules.test.mjs).
 */
import { BALANCE, SKILL_COST_TABLE, SCHOOL_DIE } from './config.mjs'

const num = v => Number(v) || 0

// ── Характеристики і рівень ──────────────────────────────────────────────────
export const statMod = v => {
  const n = Math.trunc(num(v))
  return n < BALANCE.STAT_DIVISOR ? 0 : Math.floor(n / BALANCE.STAT_DIVISOR)
}
export const xpForLevel = lvl => (lvl + 1) * BALANCE.XP_PER_LEVEL
export const totalXpForLevel = lvl => { let t = 0; for (let i = 0; i < lvl; i++) t += xpForLevel(i); return t }
export const levelFromXp = xp => { let l = 0; while (num(xp) >= totalXpForLevel(l + 1)) l++; return l }

// ── Вміння: вартість рівнів ──────────────────────────────────────────────────
/** Ціна підняття з рівня `lvl` на `lvl+1`; null — якщо досягнуто максимуму */
export const skillNextCost = (baseCost, lvl, max) => {
  if (lvl >= max) return null
  return SKILL_COST_TABLE[baseCost]?.[lvl] ?? null
}
/** Скільки повертається при пониженні з рівня `lvl` */
export const skillRefund = (baseCost, lvl) => lvl <= 0 ? 0 : (SKILL_COST_TABLE[baseCost]?.[lvl - 1] ?? 0)

// ── Вага, швидкість, ініціатива ──────────────────────────────────────────────
export const calcInitiative = enduranceCurrent => Math.floor(num(enduranceCurrent) / 100)
export const calcSpeed = sprintLvl => BALANCE.BASE_SPEED + num(sprintLvl)
export const calcMaxWeight = ({ override, muleLvl = 0, bagBonus = 0 }) => {
  const o = num(override)
  if (o > 0) return o + num(bagBonus)
  return BALANCE.BASE_MAX_WEIGHT + num(muleLvl) * BALANCE.MULE_WEIGHT_PER_LVL + num(bagBonus)
}

// ── ШУ (шанс ухилення) — точна копія формули сайту ───────────────────────────
// База = поточна витривалість / 10; ступінь за навантаженням ЛИШЕ вдягненого.
export const dodgeFromLoad = (equippedWeight, enduranceCurrent) => {
  const base = num(enduranceCurrent) / 10
  if (base <= 0) return 0
  const load = num(equippedWeight)
  if (load <= base * 0.25) return 8
  if (load <= base * 0.50) return 6
  if (load <= base * 0.75) return 3
  if (load <  base * 1.00) return 2
  return 0
}
export const calcDodge = ({ equippedWeight, enduranceCurrent, dodgeSkill = 0, bonus = 0 }) =>
  dodgeFromLoad(equippedWeight, enduranceCurrent) + num(dodgeSkill) + num(bonus)

// ── Урон зброї на 100% ───────────────────────────────────────────────────────
// Права (основна) рука: фіз = СИЛ·5 + фіз зброї; ліва — лише фіз зброї (як на сайті).
// Магічна частина (v4.5.0 §1.1) — лише якщо зброя має маг. урон: ІНТ·5 + маг зброї.
export const weaponBaseDamage = ({ str, int, phys, mag, offHand = false }) => {
  const p = Math.floor((offHand ? 0 : num(str) * BALANCE.STR_DMG_MULT) + num(phys))
  const m = num(mag) > 0 ? Math.floor(num(int) * BALANCE.STR_DMG_MULT + num(mag)) : 0
  return { phys: p, mag: m }
}

// ── Сітка урону v4.5.0 §2.6 ──────────────────────────────────────────────────
export const TIER = {
  none:   { pct: 0,   label: 'Немає урону' },
  t10:    { pct: 10,  label: '10% урону' },
  t25:    { pct: 25,  label: '25% урону' },
  t50:    { pct: 50,  label: '50% урону' },
  t75:    { pct: 75,  label: '75% урону' },
  t100:   { pct: 100, label: '100% урону' },
  crit:   { pct: 150, label: 'Критичний урон' },
  deadly: { pct: 300, label: 'Смертельний урон' },
}

/**
 * @param total     результат кидка урону (d20 + модифікатори)
 * @param natural   число на кубі
 * @param skillLvl  рівень володіння зброєю
 * @returns {{tier, pct, label, note}}
 */
export const damageTier = ({ total, natural, skillLvl = 0 }) => {
  const lvl = num(skillLvl)
  const master = lvl >= 5
  const proficient = lvl >= 1
  let key, note = ''

  if (natural === 1) key = 'none'
  else if (natural === 20) { key = 'deadly'; if (master) note = 'Безкоштовна додаткова дія' }
  else {
    const t = Math.max(1, Math.min(20, Math.trunc(num(total))))
    if (t >= 20)      key = master ? 'deadly' : 'crit'
    else if (t === 19) { key = 'crit'; if (master) note = 'Шанс смертельного урону' }
    else if (t === 18) { key = 't100'; note = 'Шанс критичного урону' }
    else if (t >= 15) key = 't100'
    else if (t === 14) { key = 't75'; note = 'Шанс 100% урону' }
    else if (t === 13) key = 't75'
    else if (t === 12) { key = 't50'; note = 'Шанс 75% урону' }
    else if (t >= 10) key = 't50'
    else if (t === 9)  { key = 't25'; note = 'Шанс 50% урону' }
    else if (t >= 6)  key = 't25'
    else if (t === 5)  { key = 't10'; note = 'Шанс 25% урону' }
    else if (t >= 2)  key = 't10'
    else key = 'none'
  }
  // v4.5.0 §2.4: без володіння зброєю крит і смертельний замінюються на 100%
  if (!proficient && (key === 'crit' || key === 'deadly')) {
    key = 't100'; note = 'Без володіння: крит/смертельний → 100%'
  }
  return { tier: key, pct: TIER[key].pct, label: TIER[key].label, note }
}

/** v4.5.0 §2.4: модифікатор кидка урону від володіння (рівень 0 → −5, інакше +1) */
export const proficiencyDamageMod = skillLvl => num(skillLvl) >= 1 ? 1 : -5

export const applyPct = ({ phys, mag }, pct) => ({
  phys: Math.floor(num(phys) * pct / 100),
  mag:  Math.floor(num(mag) * pct / 100),
})

// ── Заклинання v4.5.0 §1.2 ───────────────────────────────────────────────────
export const schoolDie = schoolLvl => SCHOOL_DIE[Math.max(0, Math.min(10, Math.trunc(num(schoolLvl))))]

/** Кількість кубів сотворення = МОДІНТ (мінімум 1) */
export const castDiceCount = int => Math.max(1, statMod(int))

/** Успіх, якщо ХОЧ ОДИН куб ≥ порогу. Куби не сумуються. */
export const evaluateCast = (faces, threshold) => {
  const th = num(threshold)
  const hits = faces.map(f => f >= th)
  return { success: hits.some(Boolean), hits }
}

/** Фінальний урон заклинання: база × рівень школи, або × (школа + МОДІНТ + МОДМУД) з Кодексом */
export const spellDamage = ({ base, schoolLvl, int, wis, statMult = false }) => {
  const mult = num(schoolLvl) + (statMult ? statMod(int) + statMod(wis) : 0)
  return Math.floor(num(base) * mult)
}

/** Попадання: d20 + мод має бути БІЛЬШЕ за ШУ цілі */
export const isHit = (total, targetDodge) => num(total) > num(targetDodge)

// ── Дельта-ввід у полях ресурсів: "+5", "-25", "=30" або просто "30" ─────────
// Застосовується лише на подію change (реальна зміна тексту) — повторний
// фокус/блюр нічого не подвоює.
export const parseDelta = (raw, current) => {
  const s = String(raw ?? '').trim().replace(',', '.')
  if (!s) return null
  const m = s.match(/^([+\-=])?\s*(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const n = Number(m[2])
  if (m[1] === '+') return num(current) + n
  if (m[1] === '-') return num(current) - n
  return n
}

// ── Урон по цілі: спершу броня (PR/MR), залишок — у здоров'я ────────────────
/**
 * Урон G.O.D.: тип і походження не мають значення — уся сума йде послідовно
 * магічна броня (MR) → фізична броня (PR) → HP.
 * Якщо урон не пробив MR повністю (урон < MR), він зникає: MR не зменшується, далі нічого не йде.
 * Пробив (урон ≥ MR) — MR падає до 0, залишок знімає PR, а що не вмістилось у PR — HP.
 * Приймає число або { phys, mag } (сумуються).
 * → { hp, pr, mr, total, toMr, toPr, toHp, blocked }
 */
export const applyDamage = ({ hp, pr, mr }, dmg) => {
  const total = Math.max(0, typeof dmg === 'object' && dmg ? num(dmg.phys) + num(dmg.mag) + num(dmg.amount) : num(dmg))
  const MR = Math.max(0, num(mr)), PR = Math.max(0, num(pr))
  const out = { hp: num(hp), pr: num(pr), mr: num(mr), total, toMr: 0, toPr: 0, toHp: 0, blocked: false }
  if (!total) return out
  if (MR > 0 && total < MR) { out.blocked = true; return out }   // щит не пробито — урон у нікуди
  let left = total
  out.toMr = Math.min(MR, left); left -= out.toMr; out.mr = MR - out.toMr
  out.toPr = Math.min(PR, left); left -= out.toPr; out.pr = PR - out.toPr
  out.toHp = left; out.hp = num(hp) - left
  return out
}

/** Розбивка ШУ для підказки */
export const dodgeParts = ({ equippedWeight, enduranceCurrent, dodgeSkill = 0, bonus = 0 }) => ({
  base: Math.round(num(enduranceCurrent) / 10 * 100) / 100,
  load: num(equippedWeight),
  fromLoad: dodgeFromLoad(equippedWeight, enduranceCurrent),
  skill: num(dodgeSkill),
  bonus: num(bonus),
})

// ── Ключі гілок вмінь і фіксація розвитку ────────────────────────────────────
/**
 * Чи можна змінити рівень вміння.
 * @param skill   { key, cost, max, isGate }
 * @param cat     { gate } — ключ гілки
 * @param levels  { key: lvl } поточні рівні гілки
 * @param floor   зафіксований рівень (гравець не може опуститись нижче)
 * @param free    дія майстра — без витрат і фіксації
 * @returns {{ ok: boolean, reason?: string, cost?: number, refund?: number }}
 */
export const canChangeSkill = ({ skill, cat, levels, delta, points, floor = 0, free = false, gateName = '' }) => {
  const lvl = num(levels[skill.key])
  if (delta > 0) {
    if (lvl >= skill.max) return { ok: false, reason: 'Вже максимальний рівень' }
    if (!skill.isGate && cat.gate && num(levels[cat.gate]) <= 0) return { ok: false, reason: `Гілка закрита: спершу вкачай «${gateName}»` }
    const cost = skillNextCost(skill.cost, lvl, skill.max)
    if (!free && num(points) < cost) return { ok: false, reason: `Потрібно ${cost} очок, є ${num(points)}` }
    return { ok: true, cost: free ? 0 : cost }
  }
  if (lvl <= 0) return { ok: false, reason: 'Рівень уже 0' }
  if (!free && lvl <= num(floor)) return { ok: false, reason: 'Рівень зафіксовано — знизити може лише майстер' }
  if (skill.isGate && lvl === 1) {
    const others = Object.entries(levels).some(([k, v]) => k !== skill.key && num(v) > 0)
    if (others) return { ok: false, reason: 'Спершу скинь інші вміння гілки — ключ тримає всю гілку' }
  }
  return { ok: true, refund: free ? 0 : skillRefund(skill.cost, lvl) }
}

/** Таблиця урону зброї на всіх рівнях сітки */
export const damageTable = base => ['t10', 't25', 't50', 't75', 't100', 'crit', 'deadly'].map(t => ({
  tier: t, label: TIER[t].label, pct: TIER[t].pct, ...applyPct(base, TIER[t].pct),
}))

/** Скільки очок вкладено у вміння до рівня lvl */
export const skillInvested = (baseCost, lvl) => (SKILL_COST_TABLE[baseCost] ?? []).slice(0, Math.max(0, num(lvl))).reduce((a, b) => a + b, 0)

// ── Швидка зміна ресурсів ────────────────────────────────────────────────────
/** Крок кліку: звичайний 1, Shift ×10, Ctrl/Cmd ×100 */
export const stepSize = ({ shiftKey, ctrlKey, metaKey } = {}) => (ctrlKey || metaKey) ? 100 : shiftKey ? 10 : 1

/** Нове значення ресурсу: лікування не піднімає вище максимуму (але й не зрізає, якщо вже вище) */
export const adjustValue = (value, delta, max) => {
  const v = num(value) + num(delta)
  if (delta > 0 && max !== undefined && max !== null) return Math.max(num(value), Math.min(v, num(max)))
  return v
}

/**
 * Зміна максимуму → поточне значення рухається на ту саму різницю.
 * Симетрично: зняв шолом +10 PR і вдягнув назад — повернувся туди ж, де був.
 * Якщо падіння впирається в нуль, «недостача» запам'ятовується (debt) і гаситься
 * при наступному зростанні — щоб зняти й вдягнути розбиту броню не було безкоштовним ремонтом.
 */
export const followMax = (value, prevMax, newMax, debt = 0) => {
  const v = num(value), d = num(newMax) - num(prevMax)
  let dbt = Math.max(0, num(debt))
  if (d > 0) {
    const used = Math.min(dbt, d)
    return { value: v + d - used, debt: dbt - used }
  }
  if (d < 0) {
    const floor = Math.min(v, 0)        // від'ємне HP не підтягуємо до нуля
    let nv = v + d
    if (nv < floor) { dbt += floor - nv; nv = floor }
    return { value: nv, debt: dbt }
  }
  return { value: v, debt: dbt }
}

// ── Розхідні предмети ────────────────────────────────────────────────────────
export const RESTORE_KEYS = ['hp', 'mp', 'ed', 'mt', 'pr', 'mr']

/** Що дає розхідний предмет: лише ненульові поля */
export const restoreList = (restore = {}) => RESTORE_KEYS.filter(k => num(restore[k])).map(k => ({ key: k, value: num(restore[k]) }))

/**
 * Застосувати розхідний предмет до ресурсів: відновлення не вище максимуму
 * (те, що вже вище, не зрізаємо), шкода (від'ємне) — як урон, ресурси крім HP не нижче 0.
 * → { changes: {key: newValue}, applied: [{key, from, to, gained}] }
 */
export const applyRestore = (resources, restore) => {
  const changes = {}, applied = []
  for (const { key, value } of restoreList(restore)) {
    const r = resources[key]
    if (!r) continue
    let to = adjustValue(r.value, value, r.max)
    if (key !== 'hp') to = Math.max(0, to)
    applied.push({ key, from: num(r.value), to, gained: to - num(r.value) })
    if (to !== num(r.value)) changes[key] = to
  }
  return { changes, applied }
}

/** Ціна в монетах → «1 з 5 ср» */
export const formatPrice = (price = {}, money = {}) =>
  Object.entries(money).filter(([k]) => num(price[k])).map(([k, m]) => `${num(price[k])} ${m.abbr}`).join(' ') || ''
