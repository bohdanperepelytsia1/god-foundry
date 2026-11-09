import assert from 'node:assert/strict'
import * as R from '../god/module/rules.mjs'
import { SKILL_INDEX, WEAPON_SKILLS, SKILL_CATEGORIES } from '../god/module/config.mjs'

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name) }

t('МОД = ⌊стат/15⌋', () => { assert.equal(R.statMod(45), 3); assert.equal(R.statMod(60), 4); assert.equal(R.statMod(14), 0) })
t('рівень з досвіду', () => { assert.equal(R.levelFromXp(49), 0); assert.equal(R.levelFromXp(50), 1); assert.equal(R.levelFromXp(150), 2) })
t('ШУ як на сайті', () => {
  assert.equal(R.dodgeFromLoad(5, 200), 8)      // база 20, 25%
  assert.equal(R.dodgeFromLoad(10, 200), 6)
  assert.equal(R.dodgeFromLoad(19.9, 200), 2)
  assert.equal(R.dodgeFromLoad(20, 200), 0)
  assert.equal(R.calcDodge({ equippedWeight: 5, enduranceCurrent: 200, dodgeSkill: 2, bonus: -4 }), 6)
})
t('вартість вмінь', () => {
  assert.equal(R.skillNextCost(10, 0, 6), 10); assert.equal(R.skillNextCost(10, 6, 6), null)
  assert.equal(R.skillRefund(10, 2), 12)
})
t('сітка урону: майстер (5+)', () => {
  assert.equal(R.damageTier({ total: 20, natural: 20, skillLvl: 5 }).tier, 'deadly')
  assert.equal(R.damageTier({ total: 20, natural: 20, skillLvl: 5 }).note, 'Безкоштовна додаткова дія')
  assert.equal(R.damageTier({ total: 20, natural: 17, skillLvl: 5 }).tier, 'deadly')
  assert.equal(R.damageTier({ total: 13, natural: 12, skillLvl: 5 }).pct, 75)
})
t('сітка урону: ≤4', () => {
  assert.equal(R.damageTier({ total: 20, natural: 17, skillLvl: 3 }).tier, 'crit')
  assert.equal(R.damageTier({ total: 20, natural: 20, skillLvl: 3 }).tier, 'deadly')
  assert.equal(R.damageTier({ total: 9, natural: 9, skillLvl: 3 }).pct, 25)
  assert.equal(R.damageTier({ total: 15, natural: 1, skillLvl: 3 }).pct, 0)   // натуральна 1
})
t('без володіння: крит → 100%', () => {
  assert.equal(R.damageTier({ total: 20, natural: 20, skillLvl: 0 }).pct, 100)
  assert.equal(R.proficiencyDamageMod(0), -5)
})
t('урон зброї (v4.5 §1.1)', () => {
  assert.deepEqual(R.weaponBaseDamage({ str: 30, int: 45, phys: 20, mag: 0 }), { phys: 170, mag: 0 })
  assert.deepEqual(R.weaponBaseDamage({ str: 30, int: 45, phys: 20, mag: 10 }), { phys: 170, mag: 235 })
  assert.deepEqual(R.weaponBaseDamage({ str: 30, int: 45, phys: 20, mag: 0, offHand: true }), { phys: 20, mag: 0 })
})
t('приклад з v4.5: Вогняний джавелін = 1100', () => {
  assert.equal(R.castDiceCount(45), 3); assert.equal(R.schoolDie(4), 8)
  assert.equal(R.evaluateCast([2, 4, 5], 6).success, false)
  assert.equal(R.evaluateCast([4, 7, 1], 6).success, true)
  assert.equal(R.spellDamage({ base: 100, schoolLvl: 4, int: 45, wis: 60, statMult: true }), 1100)
  assert.equal(R.spellDamage({ base: 100, schoolLvl: 4, int: 45, wis: 60 }), 400)
  assert.equal(R.isHit(9, 7), true); assert.equal(R.isHit(7, 7), false)
})
t('кожна категорія зброї посилається на існуюче вміння', () => {
  for (const [cat, s] of Object.entries(WEAPON_SKILLS)) {
    assert.ok(SKILL_INDEX[s.prof], `${cat}.prof=${s.prof}`)
    assert.ok(SKILL_INDEX[s.acc], `${cat}.acc=${s.acc}`)
  }
})
t('ключі вмінь унікальні і без крапок', () => {
  const keys = Object.keys(SKILL_INDEX)
  assert.equal(new Set(keys).size, keys.length)
  for (const k of keys) assert.ok(!/[.\s]/.test(k), k)
})
t('дельта-ввід', () => {
  assert.equal(R.parseDelta('-25', 100), 75); assert.equal(R.parseDelta('+10', 100), 110)
  assert.equal(R.parseDelta('=30', 100), 30); assert.equal(R.parseDelta('42', 100), 42)
  assert.equal(R.parseDelta('abc', 100), null); assert.equal(R.parseDelta('', 100), null)
  assert.equal(R.parseDelta('150-100', 150), 50); assert.equal(R.parseDelta('*2', 7), 14); assert.equal(R.parseDelta('20x3', 0), 60)
  assert.equal(R.parseDelta('(10+5)/2', 0), 7.5); assert.equal(R.parseDelta('5/0', 1), null); assert.equal(R.parseDelta('=10*3', 1), 30)
})
t('урон: MR → PR → HP, тип не важливий', () => {
  const pick = o => ({ hp: o.hp, pr: o.pr, mr: o.mr, toHp: o.toHp, blocked: o.blocked })
  // 30 по MR 50 — не пробив: нічого не змінилось
  assert.deepEqual(pick(R.applyDamage({ hp: 100, pr: 40, mr: 50 }, 30)), { hp: 100, pr: 40, mr: 50, toHp: 0, blocked: true })
  // фіз і маг сумуються: 50 + 30 = 80 → MR 50 → 0, PR 40 → 10, HP не зачеплено
  assert.deepEqual(pick(R.applyDamage({ hp: 100, pr: 40, mr: 50 }, { phys: 50, mag: 30 })), { hp: 100, pr: 10, mr: 0, toHp: 0, blocked: false })
  // 120: MR 50 + PR 40 + HP 30
  const o = R.applyDamage({ hp: 100, pr: 40, mr: 50 }, 120)
  assert.deepEqual([o.toMr, o.toPr, o.toHp, o.hp], [50, 40, 30, 70])
  // рівно в MR — пробив до нуля, далі нічого
  assert.deepEqual(pick(R.applyDamage({ hp: 100, pr: 40, mr: 50 }, 50)), { hp: 100, pr: 40, mr: 0, toHp: 0, blocked: false })
  // без MR — одразу в PR, потім HP (HP може піти в мінус)
  assert.deepEqual(pick(R.applyDamage({ hp: 10, pr: 5, mr: 0 }, 40)), { hp: -25, pr: 0, mr: 0, toHp: 35, blocked: false })
  assert.equal(R.applyDamage({ hp: 10, pr: 5, mr: 3 }, 0).blocked, false, 'нуль — не блок, просто нічого')
})
t('ключі гілок: кожна категорія має ключ, і він є у списку', () => {
  for (const [cat, c] of Object.entries(SKILL_CATEGORIES)) assert.ok(SKILL_INDEX[c.gate]?.isGate && SKILL_INDEX[c.gate].cat === cat, cat)
  assert.equal(SKILL_CATEGORIES.social.gate, 'Говорливість')
})
t('ключі гілок: без ключа гілка закрита', () => {
  const cat = SKILL_CATEGORIES.social, flirt = SKILL_INDEX['Флірт'], gate = SKILL_INDEX['Говорливість']
  const r = R.canChangeSkill({ skill: flirt, cat, levels: {}, delta: 1, points: 50, gateName: 'Говорливість' })
  assert.equal(r.ok, false); assert.match(r.reason, /Говорливість/)
  assert.equal(R.canChangeSkill({ skill: gate, cat, levels: {}, delta: 1, points: 50 }).ok, true)
  assert.equal(R.canChangeSkill({ skill: flirt, cat, levels: { 'Говорливість': 1 }, delta: 1, points: 50 }).cost, 3)
})
t('ключ не можна скинути, поки гілка вкачана', () => {
  const cat = SKILL_CATEGORIES.social, gate = SKILL_INDEX['Говорливість']
  assert.equal(R.canChangeSkill({ skill: gate, cat, levels: { 'Говорливість': 1, 'Флірт': 2 }, delta: -1 }).ok, false)
  assert.equal(R.canChangeSkill({ skill: gate, cat, levels: { 'Говорливість': 1 }, delta: -1 }).refund, 4)
})
t('фіксація: гравець не знижує нижче зафіксованого, майстер — може', () => {
  const cat = SKILL_CATEGORIES.combat, sk = SKILL_INDEX['Легка'], lv = { 'Бойові_навички': 1, 'Легка': 3 }
  assert.equal(R.canChangeSkill({ skill: sk, cat, levels: lv, delta: -1, floor: 3 }).ok, false)
  assert.equal(R.canChangeSkill({ skill: sk, cat, levels: lv, delta: -1, floor: 2 }).refund, 4)
  assert.equal(R.canChangeSkill({ skill: sk, cat, levels: lv, delta: -1, floor: 3, free: true }).ok, true)
  assert.equal(R.canChangeSkill({ skill: sk, cat, levels: lv, delta: 1, points: 0, free: true }).ok, true)
})
t('таблиця урону', () => {
  const tab = R.damageTable({ phys: 200, mag: 0 })
  assert.deepEqual(tab.map(r => r.phys), [20, 50, 100, 150, 200, 300, 600])
})
t('крок кліку по ресурсу', () => {
  assert.equal(R.stepSize({}), 1); assert.equal(R.stepSize({ shiftKey: true }), 10); assert.equal(R.stepSize({ ctrlKey: true }), 100)
})
t('лікування не вище максимуму', () => {
  assert.equal(R.adjustValue(95, 10, 100), 100); assert.equal(R.adjustValue(40, -10, 100), 30)
  assert.equal(R.adjustValue(120, 5, 100), 120, 'вже вище максимуму — не зрізаємо')
})
t('поточне йде за максимумом', () => {
  assert.deepEqual(R.followMax(150, 300, 315), { value: 165, debt: 0 }, 'стат +1.5 → макс +15 → поточне +15')
  assert.deepEqual(R.followMax(280, 300, 250), { value: 230, debt: 0 }, 'макс упав на 50 — поточне теж')
  assert.deepEqual(R.followMax(0, 0, 40), { value: 40, debt: 0 }, 'одягнув броню PR 40 — повний захист')
  // розбита броня: 10/40 → зняв → 0/0 (недостача 30) → вдягнув → знов 10/40
  const off = R.followMax(10, 40, 0)
  assert.deepEqual(off, { value: 0, debt: 30 })
  assert.deepEqual(R.followMax(off.value, 0, 40, off.debt), { value: 10, debt: 0 })
  assert.deepEqual(R.followMax(-20, 300, 280), { value: -20, debt: 20 }, 'від\'ємне HP не чіпаємо')
})
t('розхідні: відновлення до максимуму, шкода, порожні поля', () => {
  const res = { hp: { value: 280, max: 300 }, mp: { value: 0, max: 600 }, ed: { value: 50, max: 200 } }
  const r = R.applyRestore(res, { hp: 50, mp: 0, ed: -80 })
  assert.deepEqual(r.changes, { hp: 300, ed: 0 })
  assert.deepEqual(r.applied.map(a => a.gained), [20, -50])
  assert.deepEqual(R.restoreList({ hp: 0, mp: 30 }), [{ key: 'mp', value: 30 }])
  assert.equal(R.formatPrice({ gold: 2, silver: 0, copper: 5 }, { gold: { abbr: 'з' }, silver: { abbr: 'ср' }, copper: { abbr: 'м' } }), '2 з 5 м')
})
t('Combat manual: урон від володіння за формулою ГМ-а, прицільність, кап +12', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(R.proficiencyDamageMod), [-5, 1, 2, 3, 3, 3, 4, 5, 6, 6, 8])
  assert.equal(R.accuracyMod(0), -5); assert.equal(R.accuracyMod(4), 4)
  assert.equal(R.capMod(15), 12); assert.equal(R.capMod(-7), -7)
  assert.deepEqual([3, 4, 5, 9, 10].map(R.fistFlatBonus), [0, 50, 150, 300, 500])
})
t('сітка попадання: натуральні 17–20 гарантують, 1 — промах, 2/3 — шанси промаху', () => {
  assert.deepEqual(R.hitCheck({ total: 25, natural: 20, dodge: 30 }).guaranteed, 'crit', '20 — крит навіть проти високого ШУ')
  assert.equal(R.hitCheck({ total: 17, natural: 17, dodge: 30 }).hit, true)
  assert.equal(R.hitCheck({ total: 30, natural: 1, dodge: 2 }).hit, false, '1 — промах навіть з великим модом')
  assert.equal(R.hitCheck({ total: 12, natural: 2, dodge: 5 }).missCheck, 'half')
  assert.equal(R.hitCheck({ total: 12, natural: 3, dodge: 5 }).missCheck, 'chance')
  assert.equal(R.hitCheck({ total: 8, natural: 8, dodge: 8 }).hit, false, 'рівно ШУ — промах')
  assert.equal(R.chanceSucceeds(3), true); assert.equal(R.chanceSucceeds(4), false)
})
t('сітка урону: ШАНС як окремий кидок', () => {
  assert.equal(R.damageTier({ total: 18, natural: 15, skillLvl: 3 }).chance, 'crit')
  assert.equal(R.damageTier({ total: 18, natural: 15, skillLvl: 0 }).chance, null, 'без володіння крит недоступний')
  assert.equal(R.damageTier({ total: 19, natural: 15, skillLvl: 5 }).chance, 'deadly')
  assert.equal(R.damageTier({ total: 9, natural: 9, skillLvl: 1 }).chance, 't50')
  assert.equal(R.betterTier('t50', 'crit'), 'crit'); assert.equal(R.betterTier('deadly', 't75'), 'deadly')
})
t('обладунок і ШУ: тяжкий −2, підігнаний −1, середній −1, без обладунку +1, змішаний — найтяжчий', () => {
  assert.deepEqual(R.armorDodgeMod([]), { mod: 1, worst: null })
  assert.equal(R.armorDodgeMod([R.armorClassKey('heavy', false)]).mod, -2)
  assert.equal(R.armorDodgeMod([R.armorClassKey('heavy', true)]).mod, -1)
  assert.equal(R.armorDodgeMod([R.armorClassKey('medium', true)]).mod, 0)
  assert.equal(R.armorDodgeMod(['light', 'medium', null]).mod, -1)
  assert.equal(R.armorClassKey('none', true), null)
})
t('після удару, спаскидки, витривалість за бій, свідомість', () => {
  assert.deepEqual(R.afterHit(250, 400).checks.map(c => c.stat), ['con'])
  assert.deepEqual(R.afterHit(80, 400).checks.map(c => c.stat), ['con', 'end'])
  assert.equal(R.afterHit(-100, 400).death, 'coin'); assert.equal(R.afterHit(-300, 400).death, 'saves')
  assert.equal(R.afterHit(-400, 400).state, 'dead')
  let s = R.deathSave({}, 20); assert.deepEqual([s.ok, s.fail], [2, 0])
  s = R.deathSave(s, 11); assert.equal(s.result, 'stable')
  assert.equal(R.deathSave({ fail: 1 }, 1).result, 'dead')
  assert.deepEqual([1, 2, 4].map(R.combatStamina), [0, 20, 40])
  assert.equal(R.mentalState(12).key, 'anxiety'); assert.equal(R.mentalState(3).key, 'psychosis'); assert.equal(R.mentalState(20), null)
})
t('володіння зброєю: Потік Одхі, Сила ×2, рукавиці, кулаки', () => {
  const b = { str: 20, int: 10, phys: 30, mag: 40 }
  assert.deepEqual([R.weaponDamage({ ...b, cat: 'onehand', lvl: 3 }).phys, R.weaponDamage({ ...b, cat: 'onehand', lvl: 3 }).mag], [130, 0], 'до 7 рівня маг. урон зброї не рахується')
  assert.deepEqual([R.weaponDamage({ ...b, cat: 'onehand', lvl: 7 }).phys, R.weaponDamage({ ...b, cat: 'onehand', lvl: 7 }).mag], [220, 0], 'Потік без Магічності → у фіз')
  assert.equal(R.weaponDamage({ ...b, cat: 'onehand', lvl: 7, magic: true }).mag, 90, 'Потік з Магічністю — маг')
  assert.equal(R.weaponDamage({ ...b, mag: 0, cat: 'twohand', lvl: 10 }).phys, 230, 'дворучна 10: Сила ×2')
  assert.equal(R.weaponDamage({ ...b, mag: 0, cat: 'light', lvl: 10, offHand: true }).phys, 130, 'легка 10: ліва рука з Силою')
  assert.equal(R.weaponDamage({ str: 10, phys: 0, cat: 'fist', lvl: 7, gloves: 30 }).phys, 50 + 15 + 150, 'кулаки 7: Сила + ½ рукавиць + 150')
  assert.equal(R.weaponDamage({ ...b, cat: 'staff', lvl: 1 }).mag, 90, 'посох — маг. урон завжди')
  assert.equal(R.weaponDamage({ ...b, cat: 'onehand', lvl: 0, char: false }).mag, 90, 'НІП — як раніше')
})
t('здібності зброї за рівнем володіння', () => {
  assert.deepEqual(R.availableAbilities('light', 3), [])
  assert.deepEqual(R.availableAbilities('light', 5)[0], { id: 'shadow', name: 'Тіньовий удар', level: 2, ed: 30 })
  assert.deepEqual(R.availableAbilities('bow', 9).map(a => a.id), ['trauma', 'double', 'deadshot'])
  assert.deepEqual(R.heavenSeries(1000, 1), [500, 250]); assert.deepEqual(R.heavenSeries(1000, 3), [900, 810, 729, 656])
  assert.deepEqual(R.aimBonus(9, true), { n: 4, hit: 4, dmg: 2 }); assert.deepEqual(R.aimBonus(12, false), { n: 10, hit: 10, dmg: 0 })
})
t('щити, школи магії, захист, 2ПХ, ігнор PR', () => {
  assert.deepEqual([0, 1, 5, 10].map(R.shieldPrBonus), [0, 20, 120, 500])
  assert.deepEqual(R.schoolStatBonus({ fire: 7, air: 10, water: 9 }), { wis: 15 + 30 + 15, int: 15 + 15 })
  assert.deepEqual([[1, false], [2, false], [4, false], [5, true]].map(([l, r]) => R.defenseFailPct(l, r)), [100, 75, 50, 100])
  assert.equal(R.doubleTurn(10, [4, 6]), true); assert.equal(R.doubleTurn(10, [6, 6]), false); assert.equal(R.doubleTurn(10, []), false)
  const o = R.applyDamage({ hp: 100, pr: 50, mr: 0 }, { amount: 60, ignorePr: true })
  assert.deepEqual([o.hp, o.pr, o.toPr, o.toHp], [40, 50, 0, 60])
})
const M = await import('../god/module/roll-mods.mjs')
t('складові модифікатора: ефекти гілки й вміння, обладунок, свідомість, недолік', () => {
  const actor = { type: 'character', system: {
    skill: () => 3, stats: { con: { mod: 2 } }, combat: { allMod: -1, hitMod: 2 }, resources: { mt: { value: 12 } },
    derived: { armorWorst: 'heavy', mindDmg: -2 },
    rollMods: { cat: { neutral: -2 }, skill: { 'Скритність': 1 }, stat: { con: 1 } }, rollDis: { skill: {}, hit: 1 },
  } }
  const sk = M.skillMods(actor, 'Скритність')
  assert.equal(sk.total, 3 - 2 + 1 - 1 - 1, 'рівень + гілка + вміння + усі дії + тривожність')
  assert.deepEqual(sk.dis, ['тяжкий обладунок — перешкода'])
  assert.match(sk.text, /рівень 3 · ефекти: нейтральні −?-2/)
  actor.system.derived.armorWorst = null
  assert.equal(M.skillMods(actor, 'Скритність').total, 3 - 2 + 1 + 1 - 1 - 1, 'без обладунку +1')
  assert.equal(M.statMods(actor, 'con').total, 2 + 1 - 1 - 1)
  const h = M.hitMods(actor, 3, 'прицільність 3')
  assert.equal(h.total, 3 + 2 - 1 - 1); assert.deepEqual(h.dis, ['ефект'])
  assert.equal(M.damageMods(actor, 2, 'володіння 2').total, 0)
})
console.log(`\n${n} тестів пройдено`)
