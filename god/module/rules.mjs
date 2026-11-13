/**
 * rules.mjs — ядро правил G.O.D. Чисті функції, жодних залежностей від Foundry.
 * Перевіряється звичайним Node (tests/rules.test.mjs).
 */
import { BALANCE, SKILL_COST_TABLE, SCHOOL_DIE, WEAPON_SKILLS } from './config.mjs'

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
  let key, note = '', chance = null

  if (natural === 1) key = 'none'
  else if (natural === 20) { key = 'deadly'; if (master) note = 'Безкоштовна додаткова дія' }
  else {
    const t = Math.max(1, Math.min(20, Math.trunc(num(total))))
    if (t >= 20)      key = master ? 'deadly' : 'crit'
    else if (t === 19) { key = 'crit'; if (master) chance = 'deadly' }
    else if (t === 18) { key = 't100'; chance = 'crit' }
    else if (t >= 15) key = 't100'
    else if (t === 14) { key = 't75'; chance = 't100' }
    else if (t === 13) key = 't75'
    else if (t === 12) { key = 't50'; chance = 't75' }
    else if (t >= 10) key = 't50'
    else if (t === 9)  { key = 't25'; chance = 't50' }
    else if (t >= 6)  key = 't25'
    else if (t === 5)  { key = 't10'; chance = 't25' }
    else if (t >= 2)  key = 't10'
    else key = 'none'
  }
  // v4.5.0 §2.4: без володіння зброєю крит і смертельний замінюються на 100%
  if (!proficient && (key === 'crit' || key === 'deadly')) {
    key = 't100'; note = 'Без володіння: крит/смертельний → 100%'
  }
  if (!proficient && (chance === 'crit' || chance === 'deadly')) chance = null
  if (chance) note = `ШАНС: ${TIER[chance].label}`
  return { tier: key, pct: TIER[key].pct, label: TIER[key].label, note, chance }
}

/** Порядок тирів — щоб брати кращий із двох */
export const TIER_ORDER = ['none', 't10', 't25', 't50', 't75', 't100', 'crit', 'deadly']
export const betterTier = (a, b) => TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b

/** ШАНС: кидок 1d4, спрацьовує лише на 3 */
export const CHANCE_HIT = 3
export const chanceSucceeds = d4 => num(d4) === CHANCE_HIT

/**
 * Сітка попадання (Combat manual): число на кубі попадання важливіше за ШУ.
 * 20 — гарантований критичний урон, 19/18/17 — гарантований урон 100/75/50%,
 * 3 — ШАНС промаху (1d4 = 3), 2 — 50% промаху, 1 — гарантований промах.
 * Інакше — влучання, якщо результат більше за ШУ.
 * → { hit, auto, guaranteed: тир|null, missCheck: 'chance'|'half'|null, reason }
 */
export const hitCheck = ({ total, natural, dodge }) => {
  const n = num(natural)
  if (n === 1) return { hit: false, auto: true, guaranteed: null, missCheck: null, reason: 'Натуральна 1 — гарантований промах' }
  const G = { 20: 'crit', 19: 't100', 18: 't75', 17: 't50' }
  if (G[n]) return { hit: true, auto: true, guaranteed: G[n], missCheck: null, reason: `Натуральна ${n} — гарантований ${TIER[G[n]].label.toLowerCase()}` }
  const hit = num(total) > num(dodge)
  if (!hit) return { hit: false, auto: false, guaranteed: null, missCheck: null, reason: '' }
  if (n === 2) return { hit: true, auto: false, guaranteed: null, missCheck: 'half', reason: 'Натуральна 2 — шанс промаху 50%' }
  if (n === 3) return { hit: true, auto: false, guaranteed: null, missCheck: 'chance', reason: 'Натуральна 3 — ШАНС промаху' }
  return { hit: true, auto: false, guaranteed: null, missCheck: null, reason: '' }
}

/** Найбільший позитивний модифікатор героя — +12 */
export const MAX_MOD = 12
export const capMod = m => Math.min(num(m), MAX_MOD)
/** Найбільший ШУ героя — 15 */
export const MAX_DODGE = 15

/** Прицільність: рівень 0 → МОД−5, інакше +рівень */
export const accuracyMod = lvl => num(lvl) >= 1 ? num(lvl) : -5

/**
 * Модифікатор кидка урону від рівня володіння («Формула ГМ-а» з Combat manual):
 * 0 → −5; 1 +1; 2 +2; 3 +3; 4–5 +3 (здібність зброї); 6 +4; 7 +5; 8 +6; 9 +6; 10 +8
 */
export const PROF_DMG_MOD = [-5, 1, 2, 3, 3, 3, 4, 5, 6, 6, 8]
export const proficiencyDamageMod = skillLvl => PROF_DMG_MOD[Math.max(0, Math.min(10, Math.trunc(num(skillLvl))))]
/** Кулачний бій: плоский бонус до урону на рівнях 4/5/9/10 (+50/+150/+300/+500) */
export const fistFlatBonus = lvl => { const l = num(lvl); return l >= 10 ? 500 : l >= 9 ? 300 : l >= 5 ? 150 : l >= 4 ? 50 : 0 }

/**
 * Клас обладунку → ШУ (Combat manual, «Види обладунків»). Змішаний комплект — штраф
 * найтяжчого елемента, бонуси зникають. Без жодного обладунку — ШУ +1.
 */
export const ARMOR_DODGE = { lightFit: 0, light: 0, mediumFit: 0, medium: -1, heavyFit: -1, heavy: -2 }
const ARMOR_WEIGHT = ['lightFit', 'light', 'mediumFit', 'medium', 'heavyFit', 'heavy']
export const armorClassKey = (cls, fitted) => cls === 'none' || !cls ? null : (fitted ? `${cls}Fit` : cls)
/** Скритність, маскування, акробатика від обладунку (найтяжчий елемент; бонуси лише без змішування) */
export const ARMOR_SKILLS = ['Скритність', 'Маскування', 'Акробатика']
export const ARMOR_SKILL_EFFECT = {
  none: { mod: 1, label: 'без обладунку +1' }, lightFit: { mod: 1, label: 'легкий підігнаний +1' }, light: null,
  mediumFit: { mod: -2, label: 'середній обладунок −2' }, medium: { mod: -2, label: 'середній обладунок −2' },
  heavyFit: { dis: true, label: 'тяжкий обладунок — перешкода' }, heavy: { dis: true, label: 'тяжкий обладунок — перешкода' },
}
export const armorDodgeMod = keys => {
  const list = keys.filter(Boolean)
  if (!list.length) return { mod: 1, worst: null }
  const worst = list.reduce((a, b) => ARMOR_WEIGHT.indexOf(b) > ARMOR_WEIGHT.indexOf(a) ? b : a)
  return { mod: ARMOR_DODGE[worst], worst }
}

/** Розмір створіння → множник ШУ */
export const SIZE_DODGE = { tiny: 1.6, small: 1.3, medium: 1, large: 0.5, huge: 0.2, gargantuan: 0.1 }

/** Витривалість за бій: 10 за кожен раунд, якщо бій дійшов хоча б до 2-го раунду */
export const combatStamina = rounds => num(rounds) >= 2 ? 10 * num(rounds) : 0

/**
 * Що має статися після удару (розділ «Тілобудова»):
 * HP ≤ 300 — перевірка 12+ від Тілобудови (калітство); HP ≤ 100 — 12+ від Витривалості (свідомість);
 * HP ≤ 0 — без свідомості: вище −½max — 1d2 (2 = автоуспіх, 1 = спаскидки), вище −max — спаскидки, −max і нижче — смерть.
 */
export const afterHit = (hp, maxHp) => {
  const v = num(hp), m = num(maxHp), out = { checks: [], state: 'ok' }
  if (v <= -m) return { checks: [], state: 'dead' }
  if (v <= 0) {
    out.state = 'down'
    out.death = v > -m / 2 ? 'coin' : 'saves'
    return out
  }
  if (v <= 300) out.checks.push({ stat: 'con', dc: 12, label: 'Тілобудова 12+ — не отримати калітства' })
  if (v <= 100) out.checks.push({ stat: 'end', dc: 12, label: 'Витривалість 12+ — не втратити свідомість' })
  return out
}

/** Спаскидки: 11+ успіх, 1 — два провали, 20 — два успіхи; до трьох */
export const deathSave = (state, d20) => {
  const s = { ok: num(state?.ok), fail: num(state?.fail) }
  const n = num(d20)
  if (n === 20) s.ok += 2
  else if (n === 1) s.fail += 2
  else if (n >= 11) s.ok += 1
  else s.fail += 1
  s.ok = Math.min(3, s.ok); s.fail = Math.min(3, s.fail)
  s.result = s.ok >= 3 ? 'stable' : s.fail >= 3 ? 'dead' : null
  return s
}

/** Стан свідомості за поточною MT */
export const mentalState = mt => {
  const v = num(mt)
  if (v <= 5) return { key: 'psychosis', label: 'Психоз', note: 'Усі дії МОД−5, ГМ керує більшістю дій', all: -5, dmg: 0 }
  if (v <= 9) return { key: 'paranoia', label: 'Паранойя', note: 'МОД−3 на всі дії, страх 16+ від волі', all: -3, dmg: 0 }
  if (v <= 14) return { key: 'anxiety', label: 'Тривожність', note: 'МОД−1 на дії, −2 на урон, страх 12+ від волі', all: -1, dmg: -2 }
  return null
}

/** Мана ≤ 0 (можна піти в мінус): перевірка 12+ від Тілобудови — не втратити свідомість */
export const afterManaLoss = mp => num(mp) <= 0 ? [{ stat: 'con', dc: 12, label: 'Тілобудова 12+ — не втратити свідомість' }] : []

/**
 * Втрата свідомості (MT): у кожному стані — свої перевірки Волі.
 * Тривожність: галюцинації 8+, страх 12+; паранойя: галюцинації 14+, страх 16+; психоз — шанс нервового зриву.
 */
export const afterMindLoss = mt => {
  const s = mentalState(mt)
  if (!s) return null
  const checks = {
    anxiety: [{ stat: 'will', dc: 8, label: 'Воля 8+ — опанувати галюцинації' }, { stat: 'will', dc: 12, label: 'Воля 12+ — опір страху (при небезпеці)' }],
    paranoia: [{ stat: 'will', dc: 14, label: 'Воля 14+ — опанувати галюцинації' }, { stat: 'will', dc: 16, label: 'Воля 16+ — опір страху (при небезпеці)' }],
    psychosis: [],
  }[s.key]
  return { ...s, checks }
}

/** Що впало: попередні й нові значення ресурсів → список ключів, які зменшились */
export const droppedResources = (prev = {}, next = {}) =>
  Object.keys(next).filter(k => next[k] !== undefined && prev[k] !== undefined && num(next[k]) < num(prev[k]))

export const applyPct = ({ phys, mag }, pct) => ({
  phys: Math.floor(num(phys) * pct / 100),
  mag:  Math.floor(num(mag) * pct / 100),
})

// ── Заклинання v4.5.0 §1.2 ───────────────────────────────────────────────────
export const schoolDie = schoolLvl => SCHOOL_DIE[Math.max(0, Math.min(10, Math.trunc(num(schoolLvl))))]

/** Кількість кубів сотворення = МОДІНТ (мінімум 1) */
/**
 * Володіння для сотворення: герой — рівень школи (з умінь «Сила …»);
 * ворог — якщо заклинання в нього є, то він ним володіє: рівень заклинання (або школа, якщо задана вища).
 */
export const spellMastery = ({ type, schools = {}, school, level = 1 }) =>
  type === 'npc' ? Math.max(num(schools[school]), Math.max(1, num(level))) : num(schools[school])
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
/**
 * Безпечний калькулятор (без eval): числа, + − × ÷, дужки. «x», «х», «×», «*» — множення; «:», «÷», «/» — ділення.
 * Повертає число або null, якщо вираз некоректний.
 */
export function calc(expr) {
  const src = String(expr ?? '').replace(/\s+/g, '').replace(/,/g, '.').replace(/[xх×]/gi, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-')
  if (!src || /[^0-9.+\-*/()]/.test(src)) return null
  let i = 0
  const peek = () => src[i]
  const number = () => {
    const m = src.slice(i).match(/^\d+(?:\.\d+)?|^\.\d+/)
    if (!m) throw new Error('num')
    i += m[0].length
    return Number(m[0])
  }
  const factor = () => {
    if (peek() === '+') { i++; return factor() }
    if (peek() === '-') { i++; return -factor() }
    if (peek() === '(') { i++; const v = expr0(); if (peek() !== ')') throw new Error(')'); i++; return v }
    return number()
  }
  const term = () => {
    let v = factor()
    while (peek() === '*' || peek() === '/') {
      const op = src[i++], r = factor()
      if (op === '/' && r === 0) throw new Error('div0')
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const expr0 = () => {
    let v = term()
    while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r }
    return v
  }
  try {
    const v = expr0()
    if (i !== src.length || !Number.isFinite(v)) return null
    return Math.round(v * 100) / 100
  } catch { return null }
}

/**
 * Поле з математикою:
 *  «150-100», «20*3», «(10+5)/2» — порахувати й записати результат;
 *  «+5», «-3», «*2», «/2» — змінити поточне значення;
 *  «=30» — задати рівно (теж можна з виразом: «=10*3»).
 */
export const parseDelta = (raw, current) => {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('=')) return calc(s.slice(1))
  if (/^[+\-−–*xх×/÷:]/i.test(s)) return calc(`(${num(current)})${s.replace(/^[xх×]/i, '*')}`)
  return calc(s)
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
  // Смертельний постріл ігнорує фіз. захист: PR не знімається, урон іде далі в HP
  if (dmg?.ignorePr) { out.ignorePr = true; out.pr = num(pr) }
  else { out.toPr = Math.min(PR, left); left -= out.toPr; out.pr = PR - out.toPr }
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

/**
 * Володіння школою магії (Combat manual, «Система заклинань»): 7 — МУД +15, 9 — ІНТ +15, 10 — МУД +30.
 * Рахується для кожної школи окремо.
 */
export const schoolStatBonus = schools => {
  const out = { wis: 0, int: 0 }
  for (const l of Object.values(schools ?? {}).map(num)) {
    out.wis += l >= 10 ? 30 : l >= 7 ? 15 : 0
    out.int += l >= 9 ? 15 : 0
  }
  return out
}

/** Щити: ШУ за типом і фіз. захист, що додає вміння «Щити» (рівні 1–10) */
export const SHIELD_DODGE = { small: 0, medium: -1, large: -3 }
export const SHIELD_PR = [0, 20, 40, 70, 100, 120, 150, 200, 300, 400, 500]
export const shieldPrBonus = lvl => SHIELD_PR[Math.max(0, Math.min(10, Math.trunc(num(lvl))))]

// ── Володіння зброєю: що дають рівні (Combat manual, «Бойові уміння») ─────────
/** Фізична зброя, для якої маг. урон зброї рахується лише з «Потоком Одхі» (7 рівень) */
export const FLOW_CATS = new Set(['light', 'onehand', 'heavy1h', 'twohand', 'bow', 'throw'])
export const weaponPerks = (cat, lvl) => {
  const l = num(lvl)
  return {
    flow: FLOW_CATS.has(cat) && l >= 7,                       // Потік Одхі
    strDouble: l >= 10 && (cat === 'twohand' || cat === 'fist'),   // урон від Сили ×2
    offHandStr: l >= 10 && cat === 'light',                    // ліва рука теж з Силою
    autoChance: l >= 10 && cat === 'light',                    // усі шанси урону спрацьовують
    glovesPct: cat === 'fist' && l >= 7 ? 50 : 0,              // половина фіз. захисту рукавиць → урон
  }
}

/**
 * Урон зброї на 100% з урахуванням рівня володіння (лише для персонажів; НІП — як раніше).
 * magic — чи має герой «Магічність»: без неї «Потік Одхі» перетворює маг. урон на фізичний.
 */
export const weaponDamage = ({ str, int, phys, mag, offHand = false, cat, lvl = 0, magic = false, gloves = 0, char = true }) => {
  if (!char) return { ...weaponBaseDamage({ str, int, phys, mag, offHand }), notes: [] }
  const pk = weaponPerks(cat, lvl)
  const notes = []
  const strPart = (offHand && !pk.offHandStr) ? 0 : num(str) * BALANCE.STR_DMG_MULT * (pk.strDouble ? 2 : 1)
  if (pk.strDouble) notes.push('Сила ×2')
  if (offHand && pk.offHandStr) notes.push('ліва рука з Силою')
  let p = Math.floor(strPart + num(phys))
  let m = num(mag) > 0 ? Math.floor(num(int) * BALANCE.STR_DMG_MULT + num(mag)) : 0
  if (m && FLOW_CATS.has(cat)) {
    if (!pk.flow) { m = 0; notes.push('маг. урон зброї — з 7 рівня (Потік Одхі)') }
    else if (!magic) { p += m; m = 0; notes.push('Потік Одхі: маг → фіз') }
    else notes.push('Потік Одхі')
  }
  if (pk.glovesPct && num(gloves) > 0) { const g = Math.floor(num(gloves) * pk.glovesPct / 100); p += g; notes.push(`рукавиці +${g}`) }
  if (cat === 'fist') { const fl = fistFlatBonus(lvl); if (fl) { p += fl; notes.push(`кулачний бій +${fl}`) } }
  return { phys: p, mag: m, notes }
}

/**
 * Здібності зброї (ЗДТН): з якого рівня володіння, витрата витривалості на кожному рівні здібності.
 * Рівень здібності = скільки порогів з `lvls` уже досягнуто.
 */
export const WEAPON_ABILITIES = {
  light:   [{ id: 'shadow', name: 'Тіньовий удар', lvls: [4, 5, 9], ed: [20, 30, 20] }],
  onehand: [{ id: 'feint', name: 'Фінт', lvls: [4, 5, 9], ed: [20, 20, 30] }],
  heavy1h: [{ id: 'forbidden', name: 'Заборонений удар', lvls: [4, 5, 9], ed: [40, 50, 40] }],
  twohand: [{ id: 'heaven', name: 'Небесна кара', lvls: [4, 5, 9], ed: [60, 60, 50] }],
  throw:   [{ id: 'instant', name: 'Миттєвий захист', lvls: [4, 5], ed: [20, 30] }, { id: 'deaththrow', name: 'Кидок смерті', lvls: [9], ed: [30] }],
  bow:     [{ id: 'trauma', name: 'Травматичний постріл', lvls: [4], ed: [40] },
            { id: 'double', name: 'Подвійний постріл', lvls: [5], ed: [100] },
            { id: 'deadshot', name: 'Смертельний постріл', lvls: [9], ed: [50] }],
}
export const availableAbilities = (cat, lvl) => (WEAPON_ABILITIES[cat] ?? [])
  .map(a => { const level = a.lvls.filter(x => num(lvl) >= x).length; return level ? { id: a.id, name: a.name, level, ed: a.ed[level - 1] } : null })
  .filter(Boolean)

/** Тіньовий удар: з якого результату урону й з яким шансом крит/смертельний */
export const SHADOW_STRIKE = {
  1: [{ min: 17, tier: 'crit', odds: 'chance' }],
  2: [{ min: 16, tier: 'crit', odds: 'half' }],
  3: [{ min: 18, tier: 'deadly', odds: 'threeQuarters' }, { min: 14, tier: 'crit', odds: 'threeQuarters' }],
}
/** Заборонений удар: шанс і скільки % фінального урону додати; 3 рівень — і по броньованій цілі */
export const FORBIDDEN_STRIKE = { 1: { odds: 'chance', pct: 25 }, 2: { odds: 'half', pct: 50 }, 3: { odds: 'half', pct: 100, armored: true } }
/** Небесна кара: на скільки менший урон кожної наступної цілі й скільки додаткових цілей */
export const HEAVEN_STRIKE = { 1: { cut: 50, extra: 2 }, 2: { cut: 25, extra: 3 }, 3: { cut: 10, extra: 4 } }
export const heavenSeries = (total, level) => {
  const h = HEAVEN_STRIKE[level]; if (!h) return []
  const out = []; let cur = num(total)
  for (let i = 0; i < h.extra; i++) { cur = Math.floor(cur * (100 - h.cut) / 100); out.push(cur) }
  return out
}
/** Шанси: 'chance' — 1d4 = 3, 'half' — 1d2 = 2, 'threeQuarters' — 1d4 ≤ 3 */
export const ODDS = { chance: { die: '1d4', ok: v => v === 3, label: 'ШАНС (1d4 = 3)' }, half: { die: '1d2', ok: v => v === 2, label: '50% (1d2 = 2)' }, threeQuarters: { die: '1d4', ok: v => v <= 3, label: '75% (1d4 ≤ 3)' } }

/** Оцінка (ближній): +1 попадання і +0.5 урону за кожну, до 4. Прицілювання (дальній): +1 попадання, до 10 */
export const aimBonus = (n, melee) => {
  const k = Math.max(0, Math.min(melee ? 4 : 10, Math.trunc(num(n))))
  return { n: k, hit: k, dmg: melee ? Math.floor(k * 0.5) : 0 }
}

// ── Маневр «Захист» ───────────────────────────────────────────────────────────
/** Чи спрацьовує захист проти N-го ворога за раунд: 1 — завжди, 2 — 1d4 ≥ 2, 3 — ≥ 3, 4 — = 3, 5+ — ні */
export const DEFENSE_GATE = { 1: null, 2: v => v >= 2, 3: v => v >= 3, 4: v => v === 3 }
/** Поріг 1d10, щоб повністю відбити урон */
export const DEFENSE_DC = {
  fist: 6, fistUneven: 9, light: 8, onehand: 7, heavy1h: 6, twohand: 5,
  shield: { small: { melee: 8, ranged: 10 }, medium: { melee: 6, ranged: 6 }, large: { melee: 4, ranged: 2 } },
}
/** Скільки урону проходить, якщо захист не вдався (Бойові рефлекси 4+ — 50%, 2+ — 75%; стріли й магія — 100%) */
export const defenseFailPct = (reflexes, ranged) => ranged ? 100 : num(reflexes) >= 4 ? 50 : num(reflexes) >= 2 ? 75 : 100

// ── Ініціатива: 2 повні ходи ──────────────────────────────────────────────────
/** 2ПХ, якщо середня ініціатива ворожої пачки щонайменше вдвічі менша за власну */
export const doubleTurn = (own, enemies) => {
  const list = (enemies ?? []).map(num)
  if (!list.length || num(own) <= 0) return false
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return avg * 2 <= num(own)
}

/** Урон зброї в руках актора (для листа й інспектора) — з тими самими правилами, що й атака */
export const actorWeaponDamage = (actor, item) => {
  const sys = actor.system, s = item.system
  const ws = WEAPON_SKILLS[s.category] ?? {}
  const gloves = [...(actor.items ?? [])].filter(i => i.type === 'armor' && i.system.equipped && i.system.slot === 'Рукавиці').reduce((a, i) => a + num(i.system.phys), 0)
  return weaponDamage({
    str: sys.stats.str.value, int: sys.stats.int.value, phys: s.phys, mag: s.mag, offHand: s.hand === 'off',
    cat: s.category, lvl: sys.skill?.(ws.prof) ?? 0, magic: (sys.skill?.('Магічність') ?? 0) > 0, gloves, char: actor.type === 'character',
  })
}

/**
 * Перевантаження (Player manual): скільки кг понад максимум →
 * до 5: ШУ −1; до 10: ШУ −3, без бігу; до 29: ШУ −6, МОД −2 на всі дії; 30+: рухатись неможливо.
 */
export const overloadEffect = over => {
  const o = num(over)
  if (o <= 0) return null
  if (o <= 5) return { dodge: -1, all: 0, label: 'Перевантаження до 5 кг: ШУ −1, втома ×1.5' }
  if (o <= 10) return { dodge: -3, all: 0, label: 'Перевантаження до 10 кг: ШУ −3, втома ×2, бігти не можна' }
  if (o < 30) return { dodge: -6, all: -2, label: 'Перевантаження до 29 кг: ШУ −6, МОД −2 на всі дії, втома ×3, бігти не можна' }
  return { dodge: -6, all: -2, immobile: true, label: 'Перевантаження 30+ кг: рухатись неможливо' }
}

/** Відпочинок і сон (Player manual, «Ефекти і відпочинок»): скільки витривалості відновлює */
export const REST = {
  restBad: { label: 'Некомфортний відпочинок (30 хв)', ed: 20 },
  rest: { label: 'Відпочинок (30 хв)', ed: 40 },
  restGood: { label: 'Комфортний відпочинок (30 хв)', ed: 80 },
  sleepBad: { label: 'Некомфортний сон (1 год)', ed: 40 },
  sleep: { label: 'Сон (1 год)', ed: 80 },
  sleepGood: { label: 'Комфортний сон (1 год)', ed: 200 },
}
/** Відновлення броні: підгонка — 50% фіз. і маг. броні (1 год), відновлення — 100% (2 год) */
export const ARMOR_REPAIR = { fit: { label: 'Підгонка броні (1 год) — 50%', pct: 50 }, full: { label: 'Відновлення броні (2 год) — 100%', pct: 100 } }

/** Що можна тримати в другій руці (Combat manual: дві легкі зброї; чакрами — парні) */
export const DUAL_WIELD = new Set(['light', 'chakram'])

/**
 * Кулачний бій за рівнем (Combat manual, «Без зброї»): зміни сітки урону і додаткові шанси.
 * total — результат кидка урону, natural — куб.
 */
export function fistExtras(lvl, total, natural) {
  const l = num(lvl), t = num(total), out = { chanceCrit: false, shock: false, knockout: false, disarmAt: 0 }
  if (l >= 6 && t === 17) out.chanceCrit = true                          // 6: при 17 — шанс криту
  if ((l >= 10 && t >= 17) || (l >= 9 && t >= 19) || (l >= 8 && t >= 20)) out.shock = true   // больовий шок
  if (l >= 10 && natural === 20) out.knockout = true                      // 10: при 20 — шанс вирубити
  out.disarmAt = l >= 10 ? 16 : l >= 9 ? 18 : l >= 8 ? 19 : 0             // окремий чистий d20 на вибивання зброї
  return out
}

/** Луки: шанс, що стріла лишиться цілою (4 — ШАНС, 6 — 50%, 8 — 75%, 9+ — завжди) */
export const arrowSurvival = lvl => { const l = num(lvl); return l >= 9 ? 'always' : l >= 8 ? 'threeQuarters' : l >= 6 ? 'half' : l >= 4 ? 'chance' : null }
