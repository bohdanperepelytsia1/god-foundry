/**
 * Анімації — у момент НАНЕСЕННЯ урону (кнопка «Урон» / «Захист»), а не при кидку.
 * Sequencer + JB2A (безкоштовний чи Patreon). Шари: удар/снаряд → вибух на цілі → червоний спалах токена →
 * на криті й смертельному — сильніший вибух і трясіння екрана. Сила ефекту росте з рівнем урону.
 * Без Sequencer нічого не відбувається.
 */
const ON = () => { try { return game.settings.get('god', 'animations') } catch { return 'all' } }
export const fxReady = () => !!globalThis.Sequencer && !!globalThis.Sequence && !!game.modules?.get('sequencer')?.active && ON() !== 'off'

/** Кандидати від найефектніших (кольорові, дворучні) до загальних; береться перший наявний */
const FX = {
  fist: ['jb2a.unarmed_strike.magical.01', 'jb2a.unarmed_strike.physical.02', 'jb2a.unarmed_strike.physical', 'jb2a.flurry_of_blows', 'jb2a.melee_generic.bludgeoning'],
  light: ['jb2a.dagger.melee.fire', 'jb2a.dagger.melee.02.white', 'jb2a.dagger.melee', 'jb2a.melee_generic.piercing', 'jb2a.melee_generic.slash'],
  onehand: ['jb2a.sword.melee.fire', 'jb2a.sword.melee.01.white', 'jb2a.sword.melee', 'jb2a.longsword.melee', 'jb2a.melee_generic.slashing.one_handed', 'jb2a.melee_generic.slash'],
  heavy1h: ['jb2a.warhammer.melee.01.white', 'jb2a.mace.melee.01.white', 'jb2a.mace.melee', 'jb2a.melee_generic.bludgeoning.one_handed', 'jb2a.melee_generic.bludgeoning'],
  twohand: ['jb2a.greatsword.melee.fire', 'jb2a.greataxe.melee.standard.white', 'jb2a.greatsword.melee.standard.white', 'jb2a.greatsword.melee', 'jb2a.melee_generic.slashing.two_handed', 'jb2a.melee_generic.slashing'],
  bow: ['jb2a.arrow.physical.white.01', 'jb2a.arrow.physical', 'jb2a.arrow'],
  throw: ['jb2a.throwing_hammer', 'jb2a.dagger.throw.01.white', 'jb2a.dagger.throw', 'jb2a.javelin', 'jb2a.arrow.physical'],
  staff: ['jb2a.guiding_bolt', 'jb2a.magic_missile', 'jb2a.eldritch_blast'],
  wand: ['jb2a.eldritch_blast', 'jb2a.magic_missile', 'jb2a.guiding_bolt'],
  codex: ['jb2a.guiding_bolt', 'jb2a.magic_missile'],
  trident: ['jb2a.spear.melee.01.white', 'jb2a.spear.melee', 'jb2a.melee_generic.piercing'],
  chakram: ['jb2a.chakram', 'jb2a.boomerang', 'jb2a.dagger.throw'],
  amulet: ['jb2a.magic_missile'],
  // атака ворога — загальний удар без зброї в руках (не кігті: ворог може бути ким завгодно)
  creature: ['jb2a.melee_generic.slash.01.orange', 'jb2a.melee_generic.slashing.one_handed', 'jb2a.melee_generic.slash', 'jb2a.melee_generic.slashing',
    'jb2a.melee_generic.bludgeoning.one_handed', 'jb2a.melee_generic.bludgeoning', 'jb2a.melee_attack.03.trail', 'jb2a.unarmed_strike.physical'],
  // ворог із лише магічним уроном — магічний снаряд
  creatureMag: ['jb2a.magic_missile', 'jb2a.eldritch_blast', 'jb2a.guiding_bolt'],
  // школи: снаряд і вибух на цілі
  fire: ['jb2a.fire_bolt.orange', 'jb2a.fire_bolt', 'jb2a.scorching_ray', 'jb2a.fireball.beam'],
  fireHit: ['jb2a.fireball.explosion.orange', 'jb2a.explosion.01.orange', 'jb2a.fireball.explosion', 'jb2a.explosion'],
  water: ['jb2a.ray_of_frost.blue', 'jb2a.ray_of_frost', 'jb2a.snowball_toss', 'jb2a.magic_missile'],
  waterHit: ['jb2a.impact_themed.ice_shard', 'jb2a.explosion.02.blue', 'jb2a.ice_spikes', 'jb2a.explosion'],
  air: ['jb2a.chain_lightning.primary.blue', 'jb2a.lightning_bolt.narrow.blue', 'jb2a.chain_lightning', 'jb2a.witch_bolt', 'jb2a.magic_missile'],
  airHit: ['jb2a.static_electricity.03.blue', 'jb2a.explosion.04.blue', 'jb2a.static_electricity', 'jb2a.explosion'],
  earth: ['jb2a.boulder.toss', 'jb2a.magic_missile'],
  earthHit: ['jb2a.impact.ground_crack.orange.02', 'jb2a.impact.ground_crack', 'jb2a.explosion'],
  light_school: ['jb2a.guiding_bolt.01.blueyellow', 'jb2a.guiding_bolt', 'jb2a.magic_missile'],
  light_schoolHit: ['jb2a.sacred_flame.target.yellow', 'jb2a.divine_smite.target.yellowwhite', 'jb2a.explosion.01.yellow', 'jb2a.explosion'],
  dark: ['jb2a.eldritch_blast.purple', 'jb2a.eldritch_blast', 'jb2a.magic_missile'],
  darkHit: ['jb2a.explosion.03.purple', 'jb2a.explosion.02.purple', 'jb2a.eldritch_blast.purple', 'jb2a.explosion'],
  spell: ['jb2a.magic_missile', 'jb2a.eldritch_blast', 'jb2a.guiding_bolt'],
  spellHit: ['jb2a.explosion.02.blue', 'jb2a.explosion.01', 'jb2a.explosion'],
  // удари по цілі
  impact: ['jb2a.impact.ground_crack.orange.02', 'jb2a.impact.ground_crack', 'jb2a.impact.004', 'jb2a.impact.001', 'jb2a.impact'],
  crit: ['jb2a.explosion.01.orange', 'jb2a.impact.ground_crack.orange.02', 'jb2a.explosion', 'jb2a.impact.ground_crack'],
  deadly: ['jb2a.divine_smite.target.reddark', 'jb2a.divine_smite.target', 'jb2a.explosion.07.orange', 'jb2a.explosion.01.orange', 'jb2a.explosion'],
  // інше
  heal: ['jb2a.healing_generic.200px.green', 'jb2a.healing_generic', 'jb2a.cure_wounds', 'jb2a.markers.light'],
  mana: ['jb2a.healing_generic.200px.blue', 'jb2a.healing_generic', 'jb2a.markers.light'],
  shield: ['jb2a.shield.01.complete.blue', 'jb2a.shield.01.intro.blue', 'jb2a.shield.01', 'jb2a.shield'],
  // смерть: бризки крові (без дзвону й диму); якщо в паку немає — малюємо калюжу самі
  death: ['jb2a.liquid.splash.red', 'jb2a.liquid.splash_side.red', 'jb2a.liquid.blob.red', 'jb2a.liquid.splash', 'jb2a.blood_splatter', 'jb2a.impact.blood'],
}
const SCHOOL_FX = { fire: 'fire', water: 'water', air: 'air', earth: 'earth', light: 'light_school', dark: 'dark', necro: 'dark', chaos: 'dark', psionic: 'spell', summon: 'spell', odhi: 'spell' }
const RANGED = new Set(['bow', 'throw', 'wand', 'staff', 'codex', 'amulet', 'chakram'])
/** Сила за рівнем урону: масштаб вибуху й трясіння */
const POWER = { none: 0, t10: .7, t25: .8, t50: 1, t75: 1.15, t100: 1.3, crit: 1.8, deadly: 2.4 }

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
const tokenOf = doc => {
  if (!doc || !globalThis.canvas?.ready) return null
  if (doc.documentName === 'Token') return doc.object
  if (doc.object) return doc.object
  return doc.getActiveTokens?.()?.[0] ?? null
}

/** Червоний спалах і поштовх токена цілі */
function hurt(seq, tgt, power) {
  try { seq.effect().copySprite(tgt).atLocation(tgt).tint('#ff2a2a').opacity(.75).fadeIn(60).fadeOut(320).duration(420).belowTokens(false) } catch { }
}

/**
 * Урон завдано: fx — дані з картки урону ({ attacker, kind: 'weapon'|'spell', cat, school, tier, natural }),
 * target — документ цілі (токен чи актор). amount — скільки HP реально знято (0 — броня все поглинула).
 */
export function playDamage(fx, target, { hpLoss = 1 } = {}) {
  if (!fx || !fxReady()) return
  const tgt = tokenOf(target)
  if (!tgt) return
  const src = fx.attacker ? tokenOf(fromUuidSync(fx.attacker)) : null
  const power = POWER[fx.tier] ?? 1
  const isSpell = fx.kind === 'spell'
  const key = isSpell ? (SCHOOL_FX[fx.school] ?? 'spell') : (fx.natural ? (fx.magic ? 'creatureMag' : 'creature') : (FX[fx.cat] ? fx.cat : 'onehand'))
  const ranged = RANGED.has(fx.cat) || key === 'creatureMag'
  const strike = resolve(key)
  const boom = resolve(fx.tier === 'deadly' ? 'deadly' : fx.tier === 'crit' ? 'crit' : isSpell ? `${key}Hit` : 'impact') ?? resolve('impact')
  try {
    const seq = new Sequence()
    // 1. удар / снаряд
    if (strike && src && src !== tgt) {
      const e = seq.effect().file(strike).atLocation(src).stretchTo(tgt)
      if (!isSpell && !ranged) e.scale(Math.max(1, power * .9))
      e.waitUntilFinished(isSpell || ranged ? -350 : -650)
    }
    // 2. вибух на цілі — тим більший, чим сильніший урон
    if (boom) seq.effect().file(boom).atLocation(tgt).scaleToObject(1.1 + power * .9).randomRotation().fadeOut(350)
    // 3. спалах токена, якщо пробито до HP
    if (hpLoss > 0) hurt(seq, tgt, power)
    // 4. крит і смертельний — трясіння екрана
    if (power >= 1.8) { try { seq.canvasPan().shake({ duration: power >= 2.4 ? 900 : 500, strength: power >= 2.4 ? 14 : 7, rotation: false }) } catch { } }
    seq.play()
  } catch (e) { console.warn('G.O.D. | анімація урону', e) }
}

/** Смерть: бризки крові, калюжа під токеном (згасає за ~10 с) і червоний спалах */
function playDeath(tgt) {
  const seq = new Sequence()
  const splash = resolve('death')
  if (splash) seq.effect().file(splash).atLocation(tgt).scaleToObject(1.9).randomRotation().belowTokens(false)
  try {
    const r = Math.max(tgt.w, tgt.h) * 0.42
    seq.effect().shape('circle', { radius: r, fillColor: '#5e0000', fillAlpha: 0.78, lineSize: 0 })
      .atLocation(tgt).belowTokens().randomOffset(0.15).fadeIn(400).duration(10000).fadeOut(2500)
    seq.effect().shape('circle', { radius: r * 0.55, fillColor: '#8a0b0b', fillAlpha: 0.6, lineSize: 0 })
      .atLocation(tgt, { offset: { x: r * 0.5, y: r * 0.3 } }).belowTokens().fadeIn(600).duration(9000).fadeOut(2500)
  } catch { /* стара версія Sequencer без shape() */ }
  hurt(seq, tgt, 2)
  seq.play()
}

/** Лікування / мана / захист / смерть — на токені актора */
export function playOn(actor, kind) {
  if (!fxReady()) return
  if (kind === 'death') { const t = tokenOf(actor); if (t) try { playDeath(t) } catch (e) { console.warn('G.O.D. | анімація смерті', e) } ; return }
  const tgt = tokenOf(actor), file = resolve(kind)
  if (!tgt || !file) return
  try { new Sequence().effect().file(file).atLocation(tgt).scaleToObject(kind === 'death' ? 1.8 : 2).fadeOut(400).play() } catch (e) { console.warn('G.O.D. | анімація', e) }
}
