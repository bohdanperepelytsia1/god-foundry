/**
 * З чого складається модифікатор кидка: база (характеристика / рівень вміння / прицільність) +
 * ефекти (гілка, вміння, перевірка характеристики), «на всі дії», обладунок. Плюс — чи кидок з недоліком.
 * Результат показується і в діалозі, і в картці чату.
 */
import { GOD } from './config.mjs'
import * as R from './rules.mjs'

const sgn = n => (n >= 0 ? `+${n}` : `${n}`)
const part = (label, value) => (value ? { label, value } : null)

/** «Усі дії»: ефекти, перевантаження, свідомість — окремими рядками */
function allParts(actor) {
  const d = actor?.system?.derived ?? {}, c = actor?.system?.combat ?? {}
  const out = []
  if (c.allMod) out.push(part('ефекти: усі дії', c.allMod))
  if (d.overload?.all) out.push(part('перевантаження', d.overload.all))
  const mind = actor?.type === 'character' ? R.mentalState(actor.system.resources?.mt?.value) : null
  if (mind?.all) out.push(part(mind.label.toLowerCase(), mind.all))
  return out.filter(Boolean)
}

/** Обладунок → скритність, маскування, акробатика */
function armorSkill(actor, key) {
  if (actor?.type !== 'character') return null
  const name = GOD.SKILL_INDEX[key]?.name
  if (!R.ARMOR_SKILLS.includes(name)) return null
  return R.ARMOR_SKILL_EFFECT[actor.system.derived?.armorWorst ?? 'none'] ?? null
}

/** Перевірка вміння */
export function skillMods(actor, key) {
  const sys = actor.system, meta = GOD.SKILL_INDEX[key]
  const lvl = sys.skill?.(key) ?? 0
  const parts = [{ label: `рівень ${lvl}`, value: lvl, base: true }]
  const cat = meta?.cat
  if (cat && sys.rollMods?.cat?.[cat]) parts.push(part(`ефекти: ${GOD.SKILL_CATEGORIES[cat].label.toLowerCase()}`, sys.rollMods.cat[cat]))
  if (sys.rollMods?.skill?.[key]) parts.push(part(`ефекти: ${meta?.name ?? key}`, sys.rollMods.skill[key]))
  const arm = armorSkill(actor, key)
  if (arm?.mod) parts.push(part(arm.label, arm.mod))
  parts.push(...allParts(actor))
  const dis = []
  if (sys.rollDis?.skill?.[key] > 0) dis.push('ефект')
  if (arm?.dis) dis.push(arm.label)
  return finish(parts.filter(Boolean), dis)
}

/** Перевірка характеристики */
export function statMods(actor, key) {
  const sys = actor.system
  const parts = [{ label: `МОД ${GOD.STATS[key]?.abbr ?? key}`, value: sys.stats?.[key]?.mod ?? 0, base: true }]
  if (sys.rollMods?.stat?.[key]) parts.push(part(`ефекти: ${GOD.STATS[key]?.label ?? key}`, sys.rollMods.stat[key]))
  parts.push(...allParts(actor))
  return finish(parts.filter(Boolean), [])
}

/** Попадання зброєю/магією: база (прицільність), ефекти й стійки, «усі дії» */
export function hitMods(actor, base, baseLabel) {
  const c = actor.system?.combat ?? {}
  const parts = [{ label: baseLabel, value: base, base: true }, part('ефекти й стійка', c.hitMod), ...allParts(actor)]
  const dis = actor.system?.rollDis?.hit > 0 ? ['ефект'] : []
  return finish(parts.filter(Boolean), dis)
}

/** Урон: база (володіння), ефекти й стійки, свідомість */
export function damageMods(actor, base, baseLabel) {
  const c = actor.system?.combat ?? {}, d = actor.system?.derived ?? {}
  const parts = [{ label: baseLabel, value: base, base: true }, part('ефекти й стійка', c.damageMod), part('свідомість', d.mindDmg)]
  return finish(parts.filter(Boolean), [])
}

function finish(parts, dis) {
  const total = parts.reduce((a, p) => a + (Number(p.value) || 0), 0)
  return { total, parts, dis, text: describe(parts, dis) }
}
/** «рівень 3 · ефекти: соціальні +1 · тривожність −1 · з недоліком (тяжкий обладунок)» */
export function describe(parts, dis = []) {
  const p = parts.map(x => x.base ? `${x.label}` : `${x.label} ${sgn(x.value)}`)
  if (dis.length) p.push(`недолік: ${dis.join(', ')}`)
  return p.join(' · ')
}
