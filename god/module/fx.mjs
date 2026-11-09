/**
 * Анімації ударів і магії через модуль Sequencer + ассети JB2A (безкоштовний чи Patreon).
 * Якщо Sequencer не ввімкнено або потрібної анімації немає — тихо нічого не робимо.
 * Шляхи шукаємо за списком кандидатів: беремо перший, що є в базі Sequencer.
 */
const ON = () => {
  try { return game.settings.get('god', 'animations') } catch { return 'all' }
}
export const fxReady = () => !!globalThis.Sequencer && !!globalThis.Sequence && game.modules.get('sequencer')?.active && ON() !== 'off'

/** Кандидати за типом: від конкретного до загального */
const FX = {
  fist: ['jb2a.unarmed_strike.physical.01', 'jb2a.unarmed_strike.physical', 'jb2a.melee_generic.creature_attack.fist', 'jb2a.impact.001'],
  light: ['jb2a.dagger.melee.02.white', 'jb2a.dagger.melee', 'jb2a.shortsword.melee', 'jb2a.melee_generic.slash'],
  onehand: ['jb2a.sword.melee.01.white', 'jb2a.sword.melee', 'jb2a.longsword.melee', 'jb2a.scimitar.melee', 'jb2a.melee_generic.slash'],
  heavy1h: ['jb2a.mace.melee.01.white', 'jb2a.mace.melee', 'jb2a.warhammer.melee', 'jb2a.club.melee', 'jb2a.melee_generic.bludgeoning'],
  twohand: ['jb2a.greatsword.melee.standard.white', 'jb2a.greatsword.melee', 'jb2a.greataxe.melee', 'jb2a.glaive.melee', 'jb2a.melee_generic.slashing'],
  bow: ['jb2a.arrow.physical.white.01', 'jb2a.arrow.physical', 'jb2a.arrow'],
  throw: ['jb2a.dagger.throw.01.white', 'jb2a.dagger.throw', 'jb2a.throwing_hammer', 'jb2a.javelin', 'jb2a.arrow.physical'],
  staff: ['jb2a.quarterstaff.melee', 'jb2a.magic_missile', 'jb2a.guiding_bolt'],
  wand: ['jb2a.magic_missile', 'jb2a.eldritch_blast', 'jb2a.guiding_bolt'],
  codex: ['jb2a.magic_missile', 'jb2a.guiding_bolt'],
  trident: ['jb2a.spear.melee', 'jb2a.melee_generic.piercing'],
  chakram: ['jb2a.chakram', 'jb2a.boomerang', 'jb2a.dagger.throw'],
  amulet: ['jb2a.magic_missile'],
  creature: ['jb2a.claws.400px', 'jb2a.claws', 'jb2a.melee_generic.creature_attack', 'jb2a.bite', 'jb2a.melee_generic.slash'],
  // школи магії
  fire: ['jb2a.fire_bolt.orange', 'jb2a.fire_bolt', 'jb2a.scorching_ray', 'jb2a.fireball.beam'],
  water: ['jb2a.ray_of_frost.blue', 'jb2a.ray_of_frost', 'jb2a.snowball_toss', 'jb2a.magic_missile'],
  air: ['jb2a.lightning_bolt.narrow.blue', 'jb2a.chain_lightning.primary', 'jb2a.witch_bolt', 'jb2a.magic_missile'],
  earth: ['jb2a.boulder.toss', 'jb2a.ice_spikes', 'jb2a.magic_missile'],
  light_school: ['jb2a.guiding_bolt.01.blueyellow', 'jb2a.guiding_bolt', 'jb2a.magic_missile'],
  dark: ['jb2a.eldritch_blast.purple', 'jb2a.eldritch_blast', 'jb2a.toll_the_dead', 'jb2a.magic_missile'],
  spell: ['jb2a.magic_missile', 'jb2a.eldritch_blast', 'jb2a.guiding_bolt'],
  // попадання, криты, лікування, захист
  impact: ['jb2a.impact.ground_crack.orange.02', 'jb2a.impact.ground_crack', 'jb2a.impact.001', 'jb2a.impact'],
  crit: ['jb2a.impact.ground_crack.orange.02', 'jb2a.explosion.01.orange', 'jb2a.impact.ground_crack', 'jb2a.impact'],
  heal: ['jb2a.healing_generic.200px.green', 'jb2a.healing_generic', 'jb2a.cure_wounds', 'jb2a.markers.light'],
  mana: ['jb2a.healing_generic.200px.blue', 'jb2a.healing_generic', 'jb2a.markers.light'],
  shield: ['jb2a.shield.01.intro.blue', 'jb2a.shield.01', 'jb2a.shield', 'jb2a.markers.shield'],
  death: ['jb2a.toll_the_dead.purple.skull_smoke', 'jb2a.toll_the_dead', 'jb2a.markers.skull', 'jb2a.impact'],
}
/** Школа → набір */
const SCHOOL_FX = { fire: 'fire', water: 'water', air: 'air', earth: 'earth', light: 'light_school', dark: 'dark', necro: 'dark', chaos: 'dark', psionic: 'spell', summon: 'spell', odhi: 'spell' }
const RANGED = new Set(['bow', 'throw', 'wand', 'staff', 'codex', 'amulet', 'chakram'])

const cache = new Map()
function resolve(kind) {
  if (cache.has(kind)) return cache.get(kind)
  const db = globalThis.Sequencer?.Database
  let found = null
  for (const c of FX[kind] ?? []) {
    try {
      if (db?.entryExists?.(c)) { found = c; break }
      const hits = db?.searchFor?.(c) ?? []
      if (hits.length) { found = hits.find(h => h.startsWith(c)) ?? hits[0]; break }
    } catch { /* немає в базі */ }
  }
  cache.set(kind, found)
  return found
}
const tokenOf = (doc) => {
  if (!doc || !globalThis.canvas?.ready) return null
  if (doc.object) return doc.object                     // TokenDocument
  if (doc.documentName === 'Token') return doc.object
  return doc.getActiveTokens?.()?.[0] ?? null           // Actor
}

/** Атака зброєю: від нападника до цілі; промах — повз ціль */
export function playAttack(actor, targetDoc, category, { hit = true, natural = false } = {}) {
  if (!fxReady() || (!hit && ON() === 'hits')) return
  const src = tokenOf(actor), tgt = tokenOf(targetDoc)
  const file = resolve(natural ? 'creature' : (FX[category] ? category : 'onehand'))
  if (!src || !tgt || !file) return
  try {
    const seq = new Sequence().effect().file(file).atLocation(src).stretchTo(tgt)
    if (!hit) seq.missed()
    if (hit && !RANGED.has(category)) seq.effect().file(resolve('impact')).atLocation(tgt).scaleToObject(1.2).delay(350).fadeOut(300)
    seq.play()
  } catch (e) { console.warn('G.O.D. | анімація атаки', e) }
}

/** Урон за сіткою: крит і смертельний — помітний ефект на цілі */
export function playDamageTier(targetDoc, tier) {
  if (!fxReady() || !['crit', 'deadly'].includes(tier)) return
  const tgt = tokenOf(targetDoc), file = resolve('crit')
  if (!tgt || !file) return
  try { new Sequence().effect().file(file).atLocation(tgt).scaleToObject(tier === 'deadly' ? 2.2 : 1.6).play() } catch (e) { console.warn('G.O.D. | анімація криту', e) }
}

/** Заклинання: снаряд школи від мага до цілі (або на самого мага, якщо цілі немає) */
export function playSpell(actor, targetDoc, school, { hit = true } = {}) {
  if (!fxReady() || (!hit && ON() === 'hits')) return
  const src = tokenOf(actor), tgt = tokenOf(targetDoc)
  const file = resolve(SCHOOL_FX[school] ?? 'spell') ?? resolve('spell')
  if (!src || !file) return
  try {
    const seq = new Sequence().effect().file(file).atLocation(src)
    if (tgt && tgt !== src) { seq.stretchTo(tgt); if (!hit) seq.missed() } else seq.scaleToObject(2)
    seq.play()
  } catch (e) { console.warn('G.O.D. | анімація заклинання', e) }
}

/** Лікування / відновлення / захист / смерть — на токені актора */
export function playOn(actor, kind) {
  if (!fxReady()) return
  const tgt = tokenOf(actor), file = resolve(kind)
  if (!tgt || !file) return
  try { new Sequence().effect().file(file).atLocation(tgt).scaleToObject(kind === 'death' ? 1.6 : 1.8).fadeOut(400).play() } catch (e) { console.warn('G.O.D. | анімація', e) }
}
