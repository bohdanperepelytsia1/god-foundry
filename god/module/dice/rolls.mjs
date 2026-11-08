/**
 * Кидки G.O.D.: перевірки, атака зброєю (попадання → сітка урону),
 * сотворення заклинань v4.5.0 (попадання → МОДІНТ×d(школа) проти порогу → урон).
 * Кидки — звичайні Roll Foundry: Dice So Nice, режими приватності й чат працюють самі.
 */
import * as R from '../rules.mjs'
import { GOD } from '../config.mjs'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const signed = n => (n >= 0 ? `+${n}` : `${n}`)
const D20 = { norm: '1d20', adv: '2d20kh', dis: '2d20kl' }
const MODE_LABEL = { adv: 'перевага', dis: 'недолік' }

const naturalOf = roll => {
  const d = roll.dice[0]
  return d?.results.find(r => r.active !== false && !r.discarded)?.result ?? d?.total ?? 0
}

/**
 * Можливі цілі на сцені: токени з актором, крім самого нападника.
 * Порядок: позначені (T) → найближчі → за абеткою.
 */
export function targetChoices(actor) {
  const tokens = canvas?.ready ? canvas.tokens.placeables : []
  const own = actor?.getActiveTokens?.() ?? []
  const origin = own[0]
  const marked = new Set([...game.user.targets].map(t => t.id))
  const dist = t => {
    if (!origin) return null
    try { return Math.round(canvas.grid.measurePath([origin.center, t.center]).distance) } catch { return null }
  }
  const list = tokens
    .filter(t => t.actor && !own.includes(t) && (t.visible || game.user.isGM))
    .map(t => {
      const hp = t.actor.system?.resources?.hp
      const seeHp = game.user.isGM || t.actor.isOwner
      return {
        uuid: t.document.uuid, tokenId: t.id, name: t.name, img: t.document.texture?.src ?? t.actor.img,
        dodge: t.actor.system?.derived?.dodge ?? 0, dist: dist(t), marked: marked.has(t.id),
        disp: t.document.disposition ?? 0,
        hpPct: seeHp && hp?.max ? Math.max(0, Math.min(100, Math.round(hp.value / hp.max * 100))) : null,
      }
    })
    .sort((a, b) => (b.marked - a.marked) || ((a.dist ?? 0) - (b.dist ?? 0)) || a.name.localeCompare(b.name, 'uk'))
  // Однакові імена нумеруємо (від найближчого) — і підсвічуємо токен при наведенні в діалозі
  const count = {}, seen = {}
  for (const t of list) count[t.name] = (count[t.name] ?? 0) + 1
  for (const t of list) t.label = count[t.name] > 1 ? `${t.name} #${seen[t.name] = (seen[t.name] ?? 0) + 1}` : t.name
  return list
}

/** Ціль за UUID токена → { uuid, name, dodge, actor } і позначка T для наочності */
function resolveTarget(uuid) {
  const doc = uuid && fromUuidSync(uuid)
  if (!doc?.actor) return null
  doc.object?.setTarget?.(true, { releaseOthers: true, groupSelection: false })
  return { uuid, name: doc.name, dodge: doc.actor.system?.derived?.dodge ?? 0, actor: doc.actor }
}

// ── Розмітка картки ──────────────────────────────────────────────────────────
const head = (img, title, sub) => `
  <header class="god-card-head">
    ${img ? `<img src="${esc(img)}" alt="">` : ''}
    <div><h3>${esc(title)}</h3>${sub ? `<span>${sub}</span>` : ''}</div>
  </header>`

const step = (label, total, detail, verdict) => `
  <div class="god-step">
    <span class="god-step-label">${label}</span>
    <b class="god-step-total">${total}</b>
    ${detail ? `<span class="god-step-detail">${detail}</span>` : ''}
    ${verdict ? `<span class="god-verdict ${verdict.ok ? 'ok' : 'fail'}">${verdict.text}</span>` : ''}
  </div>`

const damageBlock = (phys, mag, note, target = null) => `
  <div class="god-dmg">
    ${phys ? `<span class="phys">${phys}<small>фіз</small></span>` : ''}
    ${mag ? `<span class="mag">${mag}<small>маг</small></span>` : ''}
    ${!phys && !mag ? '<span class="none">0</span>' : ''}
  </div>
  ${note ? `<div class="god-note">${note}</div>` : ''}
  ${phys || mag ? `<div class="god-apply god-apply-one">
    <button type="button" data-god-apply="1" data-phys="${phys}" data-mag="${mag}" ${target ? `data-target="${target.uuid}"` : ''}
      data-tooltip="${target ? `Застосувати до «${esc(target.name)}»` : 'Обраним токенам'}: спершу MR, потім PR, потім HP. Менше за MR — щит не пробито">
      <i class="fa-solid fa-burst"></i> Урон ${phys + mag}${target ? ` → ${esc(target.name)}` : ''}</button>
  </div>` : ''}`

async function sendCard(actor, html, rolls) {
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="god-card">${html}</div>`,
    rolls,
    sound: CONFIG.sounds.dice,
  }
  ChatMessage.applyRollMode(data, game.settings.get('core', 'rollMode'))
  return ChatMessage.create(data)
}

// ── Діалог параметрів ────────────────────────────────────────────────────────
async function rollDialog({ title, fields, info }) {
  const rows = fields.map(fd => {
    if (fd.type === 'mode') return `
      <div class="god-mode" role="radiogroup">
        <label><input type="radio" name="mode" value="dis"><span>Недолік</span></label>
        <label><input type="radio" name="mode" value="norm" checked><span>Звичайний</span></label>
        <label><input type="radio" name="mode" value="adv"><span>Перевага</span></label>
      </div>`
    if (fd.type === 'select') return `
      <label class="god-dlg-field"><span>${esc(fd.label)}</span>
        <select name="${fd.name}">${Object.entries(fd.options).map(([k, v]) => `<option value="${k}" ${k === fd.value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`
    if (fd.type === 'check') return `
      <label class="god-dlg-check"><input type="checkbox" name="${fd.name}" ${fd.value ? 'checked' : ''}><span>${esc(fd.label)}</span></label>`
    if (fd.type === 'target') {
      const pre = fd.choices.find(t => t.marked)
      const DISP = { '-1': 'hostile', '0': 'neutral', '1': 'friendly', '-2': 'secret' }
      return `
      <div class="god-dlg-target">
        <span class="god-dlg-target-label">${esc(fd.label ?? 'Ціль')} <small>наведи — токен підсвітиться на сцені</small></span>
        <div class="god-targets">
          ${fd.choices.map(t => `
          <label class="god-target disp-${DISP[t.disp] ?? 'neutral'}" data-token-id="${t.tokenId}">
            <input type="radio" name="${fd.name}" value="${t.uuid}" ${t === pre ? 'checked' : ''} required>
            <img src="${esc(t.img)}" alt="">
            <span class="god-target-name">${esc(t.label)}${t.marked ? ' <i class="fa-solid fa-bullseye" data-tooltip="Позначена ціль (T)"></i>' : ''}
              ${t.hpPct !== null ? `<span class="god-target-hp"><i style="width:${t.hpPct}%"></i></span>` : ''}</span>
            <span class="god-target-meta"><b>${t.dodge}</b> ШУ${t.dist !== null ? `<br>${t.dist} м` : ''}</span>
            <a class="god-target-pan" data-tooltip="Показати на сцені"><i class="fa-solid fa-location-crosshairs"></i></a>
          </label>`).join('')}
        </div>
      </div>`
    }
    return `
      <label class="god-dlg-field"><span>${esc(fd.label)}</span>
        <input type="number" name="${fd.name}" value="${fd.value ?? 0}" autofocus></label>`
  }).join('')
  const hasTarget = fields.some(fd => fd.type === 'target')
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title, icon: 'fa-solid fa-dice-d20' },
    classes: ['god-dialog'],
    position: { width: hasTarget ? 420 : 380 },
    render: hasTarget ? (event, dialog) => bindTargetList(dialog?.element ?? event?.target?.element ?? dialog) : undefined,
    content: `${info ? `<p class="god-dlg-info">${info}</p>` : ''}${rows}`,
    rejectClose: false,
    buttons: [{
      action: 'roll', label: 'Кинути', icon: 'fa-solid fa-dice-d20', default: true,
      callback: (event, button) => {
        const el = button.form.elements, out = {}
        for (const fd of fields) {
          if (fd.type === 'mode') out.mode = button.form.querySelector('[name="mode"]:checked')?.value ?? 'norm'
          else if (fd.type === 'check') out[fd.name] = el[fd.name].checked
          else if (fd.type === 'target' || fd.type === 'select') out[fd.name] = el[fd.name].value
          else out[fd.name] = Number(el[fd.name].value) || 0
        }
        return out
      },
    }],
  })
  if (hasTarget) clearTargetHover()
  if (!result || typeof result !== 'object') return null
  // Ціль обов'язкова: без неї влучання не перевірити
  const tf = fields.find(fd => fd.type === 'target')
  if (tf && !result[tf.name]) { ui.notifications.warn('Обери ціль атаки'); return null }
  return result
}

/** Наведення на рядок цілі підсвічує токен; кнопка-приціл центрує сцену на ньому */
function bindTargetList(root) {
  const box = root?.querySelector?.('.god-targets')
  if (!box) return
  const tok = el => canvas?.tokens?.get(el?.closest('[data-token-id]')?.dataset.tokenId)
  const out = clearTargetHover
  box.addEventListener('pointerover', ev => {
    const t = tok(ev.target)
    if (!t || t === hoveredToken) return
    out(); hoveredToken = t
    try { t._onHoverIn?.(new PointerEvent('pointerenter'), { hoverOutOthers: true }) } catch {}
  })
  box.addEventListener('pointerleave', out)
  box.addEventListener('click', ev => {
    const pan = ev.target.closest('.god-target-pan')
    if (!pan) return
    ev.preventDefault()
    const t = tok(pan)
    if (t) canvas.animatePan({ x: t.center.x, y: t.center.y, duration: 250 })
  })
}
let hoveredToken = null
function clearTargetHover() {
  try { hoveredToken?._onHoverOut?.(new PointerEvent('pointerleave')) } catch {}
  hoveredToken = null
}

// ── Прості перевірки ─────────────────────────────────────────────────────────
async function d20Check(actor, label, mod, sub) {
  const p = await rollDialog({ title: label, fields: [{ name: 'mod', label: 'Модифікатор', value: mod }, { type: 'mode' }] })
  if (!p) return
  const roll = await new Roll(`${D20[p.mode]} + @m`, { m: p.mod }).evaluate()
  const nat = naturalOf(roll)
  const cls = nat === 20 ? 'nat20' : nat === 1 ? 'nat1' : ''
  return sendCard(actor, `
    ${head(actor.img, label, sub)}
    <div class="god-big ${cls}">${roll.total}</div>
    <div class="god-note">куб ${nat} ${signed(p.mod)}${MODE_LABEL[p.mode] ? ` · ${MODE_LABEL[p.mode]}` : ''}</div>`, [roll])
}

export const statCheck = (actor, key) =>
  d20Check(actor, GOD.STATS[key].label, actor.system.stats[key].mod, 'перевірка характеристики')

export const skillCheck = (actor, key) =>
  d20Check(actor, GOD.SKILL_INDEX[key].name, actor.system.skill(key), `вміння, рівень ${actor.system.skill(key)}`)

// ── Швидкий кидок з панелі (без діалогу) ─────────────────────────────────────
/**
 * @param pool  {d4: 2, d20: 1, ...} — довільні куби; порожній → перевірка d20
 * @param mode  'norm'|'adv'|'dis' — лише для перевірки d20
 */
export async function quickRoll(actor, { label = 'Кидок', sub = '', base = 0, extra = 0, mode = 'norm', pool = {} }) {
  const dice = Object.entries(pool).filter(([, n]) => n > 0)
  const mod = base + extra
  const formula = dice.length
    ? dice.map(([d, n]) => `${n}${d}`).join(' + ') + (mod ? ` ${mod >= 0 ? '+' : '-'} ${Math.abs(mod)}` : '')
    : `${D20[mode]}${mod ? ` ${mod >= 0 ? '+' : '-'} ${Math.abs(mod)}` : ''}`
  const roll = await new Roll(formula).evaluate()
  const isCheck = !dice.length
  const nat = isCheck ? naturalOf(roll) : null
  const cls = nat === 20 ? 'nat20' : nat === 1 ? 'nat1' : ''
  const faces = dice.length
    ? `<div class="god-faces">${roll.dice.flatMap(d => d.results.map(r => `<span data-tooltip="d${d.faces}">${r.result}</span>`)).join('')}</div>` : ''
  const detail = isCheck
    ? `куб ${nat}${mod ? ` ${signed(mod)}` : ''}${MODE_LABEL[mode] ? ` · ${MODE_LABEL[mode]}` : ''}`
    : `${esc(roll.formula)}`
  return sendCard(actor, `
    ${head(actor?.img, label, sub)}
    <div class="god-big ${cls}">${roll.total}</div>
    ${faces}
    <div class="god-note">${detail}</div>`, [roll])
}

// ── Атака зброєю ─────────────────────────────────────────────────────────────
const RANGED = new Set(['bow', 'throw', 'wand', 'staff'])
const DIRECTIONS = { front: 'З фронту', flank: 'З флангу — попадання +1', back: 'З тилу — попадання з перевагою, урон +2' }
/** Об'єднати переваги/недоліки: перевага + недолік = звичайний кидок */
const mergeMode = (a, b) => (a === b || b === 'norm') ? a : a === 'norm' ? b : 'norm'
const hasStatus = (actor, id) => !!actor?.statuses?.has?.(id)

/** ШАНС (1d4 = 3) — окремий кидок, видно в чаті й на кубиках */
async function rollChance(rolls) {
  const r = await new Roll('1d4').evaluate()
  rolls.push(r)
  return { value: r.total, ok: R.chanceSucceeds(r.total) }
}

export async function weaponAttack(actor, item) {
  const sys = actor.system
  const ws = GOD.WEAPON_SKILLS[item.system.category] ?? {}
  const isChar = actor.type === 'character'
  const natural = !!item.natural
  const profLvl = sys.skill?.(ws.prof) ?? 0
  const accLvl = sys.skill?.(ws.acc) ?? 0
  const cm = sys.combat ?? {}
  const melee = !RANGED.has(item.system.category)
  const choices = targetChoices(actor)
  if (!choices.length) return ui.notifications.warn('На сцені немає цілей для атаки')

  // Модифікатори за правилами: прицільність 0 → −5, урон від володіння за «формулою ГМ-а», максимум +12
  const hitDefault = (isChar ? R.accuracyMod(accLvl) : accLvl) + (cm.hitMod || 0)
  const dmgDefault = (isChar ? R.proficiencyDamageMod(profLvl) : (sys.attack?.damageMod ?? 0)) + (cm.damageMod || 0)
  const p = await rollDialog({
    title: `Атака: ${item.name}`,
    info: 'Попадання має бути <b>більше</b> за ШУ цілі. Натуральні 17–20 — гарантоване влучання, 1 — промах.',
    fields: [
      { type: 'target', name: 'target', choices },
      { type: 'select', name: 'dir', label: 'Звідки б\'єш', options: DIRECTIONS, value: 'front' },
      { name: 'hitMod', label: 'Модифікатор попадання', value: isChar ? R.capMod(hitDefault) : hitDefault },
      { name: 'dmgMod', label: 'Модифікатор урону', value: isChar ? R.capMod(dmgDefault) : dmgDefault },
      { type: 'mode' },
    ],
  })
  if (!p) return
  const target = resolveTarget(p.target)
  if (!target) return ui.notifications.warn('Ціль зникла зі сцени')

  // Положення: тил — перевага на попадання й +2 урону, фланг +1; сам лежиш −3, присів −1; ціль лежить — урон з перевагою (ближній бій)
  const notes = []
  let hitMod = p.hitMod, dmgMod = p.dmgMod, hitMode = p.mode, dmgMode = 'norm'
  if (p.dir === 'flank') { hitMod += 1; notes.push('фланг +1') }
  if (p.dir === 'back') { hitMode = mergeMode(hitMode, 'adv'); dmgMod += 2; notes.push('тил: перевага, урон +2') }
  if (hasStatus(actor, 'prone')) { hitMod -= 3; notes.push('лежачи −3') }
  if (melee && hasStatus(target.actor, 'prone')) { dmgMode = 'adv'; notes.push('ціль лежить: урон з перевагою') }
  if (isChar) { hitMod = R.capMod(hitMod); dmgMod = R.capMod(dmgMod) }

  const rolls = []
  const hit = await new Roll(`${D20[hitMode]} + @m`, { m: hitMod }).evaluate()
  rolls.push(hit)
  const nat = naturalOf(hit)
  const hc = R.hitCheck({ total: hit.total, natural: nat, dodge: target.dodge })
  const sub = `${natural ? esc(actor.name) : (GOD.WEAPON_CATEGORIES[item.system.category] ?? '')} · володіння ${profLvl} → ${esc(target.name)}`
  let html = head(item.img ?? actor.img, item.name, sub)
  let hitOk = hc.hit
  html += step('Попадання', hit.total,
    `куб ${nat} ${signed(hitMod)}${MODE_LABEL[hitMode] ? ` · ${MODE_LABEL[hitMode]}` : ''} · проти ШУ ${target.dodge}${notes.length ? ` · ${notes.join(', ')}` : ''}`,
    { ok: hitOk, text: hitOk ? (hc.auto ? 'Гарантовано' : 'Влучання') : 'Промах' })
  if (hc.reason) html += `<div class="god-note">${esc(hc.reason)}</div>`

  // 2 — 50% промаху (1d2 = 1), 3 — ШАНС промаху (1d4 = 3)
  if (hitOk && hc.missCheck === 'half') {
    const r = await new Roll('1d2').evaluate(); rolls.push(r)
    if (r.total === 1) hitOk = false
    html += step('Шанс промаху', r.total, '1d2: 1 — промах', { ok: hitOk, text: hitOk ? 'Влучання' : 'Промах' })
  } else if (hitOk && hc.missCheck === 'chance') {
    const ch = await rollChance(rolls)
    if (ch.ok) hitOk = false
    html += step('ШАНС промаху', ch.value, '1d4: 3 — промах', { ok: hitOk, text: hitOk ? 'Влучання' : 'Промах' })
  }
  if (!hitOk) {
    html += `<div class="god-note">${esc(target.name)} ухиляється — урон не кидається.</div>`
    return sendCard(actor, html, rolls)
  }

  const dmg = await new Roll(`${D20[dmgMode]} + @m`, { m: dmgMod }).evaluate()
  rolls.push(dmg)
  const tier = R.damageTier({ total: dmg.total, natural: naturalOf(dmg), skillLvl: profLvl })
  let key = tier.tier
  html += step('Урон', dmg.total, `куб ${naturalOf(dmg)} ${signed(dmgMod)}${MODE_LABEL[dmgMode] ? ` · ${MODE_LABEL[dmgMode]}` : ''}`, null)
  if (tier.chance) {
    const ch = await rollChance(rolls)
    html += step('ШАНС', ch.value, `1d4: 3 — ${R.TIER[tier.chance].label.toLowerCase()}`, { ok: ch.ok, text: ch.ok ? 'Спрацював' : 'Ні' })
    if (ch.ok) key = R.betterTier(key, tier.chance)
  }
  // Гарантований мінімум із сітки попадання (без володіння крит → 100%)
  if (hc.guaranteed) {
    const g = profLvl >= 1 ? hc.guaranteed : (hc.guaranteed === 'crit' ? 't100' : hc.guaranteed)
    const before = key
    key = R.betterTier(key, g)
    if (key !== before) notes.push(`гарантовано ${R.TIER[key].label.toLowerCase()}`)
  }
  const st = sys.stats
  const base = natural
    ? { phys: sys.attack?.phys || 0, mag: sys.attack?.mag || 0 }
    : R.weaponBaseDamage({ str: st.str.value, int: st.int.value, phys: item.system.phys, mag: item.system.mag, offHand: item.system.hand === 'off' })
  const flat = isChar && item.system.category === 'fist' ? R.fistFlatBonus(profLvl) : 0
  if (flat) base.phys += flat
  const pct = R.TIER[key].pct
  const out = R.applyPct(base, pct)
  const tierNote = [tier.note && !tier.chance ? tier.note : '', key !== tier.tier ? `покращено з «${tier.label}»` : ''].filter(Boolean).join(' · ')
  html += `<div class="god-tier tier-${key}">${R.TIER[key].label}<small>${pct}%${tierNote ? ` · ${esc(tierNote)}` : ''}</small></div>`
  html += damageBlock(out.phys, out.mag, `100% = ${base.phys} фіз${base.mag ? ` / ${base.mag} маг` : ''}${flat ? ` (кулачний бій +${flat})` : ''}`, target)
  return sendCard(actor, html, rolls)
}

// ── Сотворення заклинання (v4.5.0 §1.2) ──────────────────────────────────────
export async function castSpell(actor, spell) {
  const s = spell.system, sys = actor.system
  const schoolLvl = sys.schools[s.school] ?? 0
  const school = GOD.SPELL_SCHOOLS[s.school]
  if (!schoolLvl) return ui.notifications.warn(`Немає володіння школою «${school}»`)
  const needsHit = s.attackType === 'target' || s.attackType === 'touch'
  const choices = needsHit ? targetChoices(actor) : []
  if (needsHit && !choices.length) return ui.notifications.warn('На сцені немає цілей для заклинання')
  const n = R.castDiceCount(sys.stats.int.value), die = R.schoolDie(schoolLvl)

  const p = await rollDialog({
    title: `Сотворення: ${spell.name}`,
    info: `${school}, володіння ${schoolLvl} → <b>${n}d${die}</b>, потрібно ≥ ${s.threshold} хоча б на одному кубі.` +
      (needsHit ? '<br>Спершу попадання: має бути <b>більше</b> за ШУ цілі.' : ''),
    fields: [
      ...(needsHit ? [
        { type: 'target', name: 'target', choices },
        { name: 'hitMod', label: 'Маг. прицільність', value: actor.type === 'character'
          ? R.capMod(R.accuracyMod(sys.skill('Маг_прицільність')) + (sys.combat.hitMod || 0))
          : sys.skill('Маг_прицільність') + (sys.combat.hitMod || 0) },
      ] : []),
      { name: 'threshold', label: 'Поріг (ПППС)', value: s.threshold },
      { name: 'statMult', type: 'check', label: 'Множник +МОДІНТ +МОДМУД (Кодекс)', value: sys.derived.spellStatMult },
      { name: 'pay', type: 'check', label: `Списати ${s.manaCost} OM${s.staminaCost ? ` і ${s.staminaCost} ВС` : ''}`, value: true },
    ],
  })
  if (!p) return
  const target = needsHit ? resolveTarget(p.target) : null
  if (needsHit && !target) return ui.notifications.warn('Ціль зникла зі сцени')

  // Мана може піти в мінус (прихована механіка): тоді — перевірка 12+ від Тілобудови на втрату свідомості.
  // Витривалість — ні: на нулі герой непритомніє, тож нижче не пускаємо.
  const mp = sys.resources.mp.value, ed = sys.resources.ed.value
  if (p.pay && ed < s.staminaCost) {
    return ui.notifications.warn(`Недостатньо витривалості: потрібно ${s.staminaCost} ВС, є ${ed}`)
  }
  let paid = false
  const pay = async () => {
    if (!p.pay || paid) return
    paid = true
    const cur = actor.system.resources
    await actor.update({ 'system.resources.mp.value': cur.mp.value - s.manaCost, 'system.resources.ed.value': cur.ed.value - s.staminaCost })
  }
  const manaWarn = () => p.pay && actor.system.resources.mp.value <= 0
    ? `<div class="god-note god-warn">Мана ${actor.system.resources.mp.value} OM — перевірка <b>12+ від Тілобудови</b>, щоб не знепритомніти.
       <div class="god-apply god-apply-one"><button type="button" data-god-check="${actor.uuid}|con|12">Кинути Тілобудову</button></div></div>` : ''

  const rolls = []
  let html = head(spell.img, spell.name, `${school} · ${GOD.ATTACK_TYPES[s.attackType]}`)

  if (needsHit) {
    const hitMod = actor.type === 'character' ? R.capMod(p.hitMod) : p.hitMod
    const hit = await new Roll('1d20 + @m', { m: hitMod }).evaluate()
    rolls.push(hit)
    const hc = R.hitCheck({ total: hit.total, natural: naturalOf(hit), dodge: target.dodge })
    let ok = hc.hit
    html += step('Попадання', hit.total, `куб ${naturalOf(hit)} ${signed(hitMod)} · ${esc(target.name)}, ШУ ${target.dodge}`,
      { ok, text: ok ? (hc.auto ? 'Гарантовано' : 'Влучання') : 'Промах' })
    if (hc.reason && !hc.guaranteed) html += `<div class="god-note">${esc(hc.reason)}</div>`
    if (ok && hc.missCheck) {
      const r = await new Roll(hc.missCheck === 'half' ? '1d2' : '1d4').evaluate(); rolls.push(r)
      if (hc.missCheck === 'half' ? r.total === 1 : R.chanceSucceeds(r.total)) ok = false
      html += step(hc.missCheck === 'half' ? 'Шанс промаху' : 'ШАНС промаху', r.total, hc.missCheck === 'half' ? '1d2: 1 — промах' : '1d4: 3 — промах',
        { ok, text: ok ? 'Влучання' : 'Промах' })
    }
    if (!ok) {
      await pay()
      html += `<div class="god-note">${p.pay ? `Мана списана: ${s.manaCost} OM` : 'Ресурси не списувались'}</div>` + manaWarn()
      return sendCard(actor, html, rolls)
    }
  }

  const cast = await new Roll(`${n}d${die}`).evaluate()
  rolls.push(cast)
  const faces = cast.dice[0].results.map(r => r.result)
  const ev = R.evaluateCast(faces, p.threshold)
  await pay()

  html += `<div class="god-step"><span class="god-step-label">Сотворення</span>
    <span class="god-step-detail">${n}d${die} проти ${p.threshold}</span>
    <span class="god-verdict ${ev.success ? 'ok' : 'fail'}">${ev.success ? 'Успіх' : 'Провал'}</span></div>
    <div class="god-faces">${faces.map((v, i) => `<span class="${ev.hits[i] ? 'hit' : ''}">${v}</span>`).join('')}</div>`

  if (!ev.success) {
    html += `<div class="god-note">Можна спробувати ще раз, поки вистачає мани.</div>
      <div class="god-apply god-apply-one"><button type="button" data-god-recast="${spell.uuid}">
        <i class="fa-solid fa-rotate-right"></i> Спробувати ще раз</button></div>`
  } else if (s.baseDamage > 0 && s.damageKind !== 'none') {
    const dmg = R.spellDamage({ base: s.baseDamage, schoolLvl, int: sys.stats.int.value, wis: sys.stats.wis.value, statMult: p.statMult })
    const mult = schoolLvl + (p.statMult ? sys.stats.int.mod + sys.stats.wis.mod : 0)
    html += damageBlock(s.damageKind === 'phys' ? dmg : 0, s.damageKind === 'mag' ? dmg : 0, `${s.baseDamage} × ${mult}`, target)
  }
  if (p.pay) html += `<div class="god-note">Списано ${s.manaCost} OM${s.staminaCost ? `, ${s.staminaCost} ВС` : ''}</div>` + manaWarn()
  return sendCard(actor, html, rolls)
}

export async function useAbility(actor, item) {
  const s = item.system, r = actor.system.resources
  let note = ''
  if (s.manaCost || s.staminaCost) {
    // мана може піти в мінус (за правилами), витривалість — ні
    if (r.ed.value < s.staminaCost) return ui.notifications.warn(`Недостатньо витривалості: потрібно ${s.staminaCost} ВС`)
    const mp = r.mp.value - s.manaCost
    await actor.update({ 'system.resources.mp.value': mp, 'system.resources.ed.value': r.ed.value - s.staminaCost })
    note = `Списано ${s.manaCost} OM, ${s.staminaCost} ВС${mp < 0 ? ' · мана в мінусі' : ''}`
  }
  return postItem(actor, item, note)
}

export async function postItem(actor, item, note = '') {
  const desc = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description ?? '', { relativeTo: item })
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="god-card">${head(item.img, item.name, game.i18n.localize(`TYPES.Item.${item.type}`))}
      <div class="god-desc">${desc || '<p class="god-note">Без опису</p>'}</div>${note ? `<div class="god-note">${esc(note)}</div>` : ''}</div>`,
  })
}

/** Розхідний предмет: відновити ресурси, списати 1 шт (останній — прибрати), картка в чат */
export async function consumeItem(actor, item) {
  const s = item.system
  if ((s.quantity ?? 0) < 1) return ui.notifications.warn(`«${item.name}» закінчився`)
  const { changes, applied } = R.applyRestore(actor.system.resources, s.restore)
  const upd = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`system.resources.${k}.value`, v]))
  if (Object.keys(upd).length) await actor.update(upd)
  const left = s.quantity - 1
  if (left > 0) await item.update({ 'system.quantity': left })
  else await item.delete()
  const abbr = k => GOD.RESOURCES[k]?.abbr ?? k.toUpperCase()
  const lines = applied.map(a => `<span class="${a.gained >= 0 ? 'up' : 'down'}"><b>${abbr(a.key)} ${a.gained >= 0 ? '+' : ''}${a.gained}</b> <small>${a.from} → ${a.to}</small></span>`).join('')
  const desc = await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description ?? '', { relativeTo: actor })
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="god-card">${head(item.img, item.name, `Використано · лишилось ${left}`)}
      ${lines ? `<div class="god-restore">${lines}</div>` : ''}
      ${desc ? `<div class="god-desc">${desc}</div>` : ''}</div>`,
  })
}

// ── Перевірки після удару, спаскидки ─────────────────────────────────────────
const STAT_LABEL = k => GOD.STATS[k]?.label ?? k

/** Перевірка «N+ від характеристики»: d20 + МОД, без діалогу */
export async function thresholdCheck(actor, stat, dc, why = '') {
  const mod = actor.system.stats?.[stat]?.mod ?? 0
  const roll = await new Roll('1d20 + @m', { m: mod }).evaluate()
  const ok = roll.total >= dc
  let html = head(actor.img, `${STAT_LABEL(stat)} ${dc}+`, why || 'перевірка')
  html += step('Кидок', roll.total, `куб ${naturalOf(roll)} ${signed(mod)}`, { ok, text: ok ? 'Успіх' : 'Провал' })
  return sendCard(actor, html, [roll])
}

/** Спаскидок: 11+ успіх, 1 = два провали, 20 = два успіхи; три успіхи — стабільний, три провали — смерть */
export async function deathSave(actor) {
  const roll = await new Roll('1d20').evaluate()
  const s = R.deathSave(actor.getFlag('god', 'deathSaves') ?? {}, roll.total)
  let html = head(actor.img, 'Перевірка смерті', `${actor.name}: успіхи ${s.ok}/3 · провали ${s.fail}/3`)
  html += step('Спаскидок', roll.total, roll.total === 20 ? 'двадцятка — два успіхи' : roll.total === 1 ? 'одиниця — два провали' : '11+ успіх',
    { ok: roll.total >= 11, text: roll.total >= 11 ? 'Успіх' : 'Провал' })
  if (s.result === 'stable') {
    html += '<div class="god-tier tier-t100">Стабільний<small>живий, але без свідомості</small></div>'
    await actor.unsetFlag('god', 'deathSaves')
  } else if (s.result === 'dead') {
    html += '<div class="god-tier tier-none">Смерть</div>'
    await actor.unsetFlag('god', 'deathSaves')
    await actor.toggleStatusEffect?.('dead', { active: true, overlay: true })
  } else {
    await actor.setFlag('god', 'deathSaves', { ok: s.ok, fail: s.fail })
    html += `<div class="god-apply god-apply-one"><button type="button" data-god-death="${actor.uuid}|saves"><i class="fa-solid fa-heart-pulse"></i> Наступний спаскидок</button></div>`
  }
  return sendCard(actor, html, [roll])
}

/** HP між 0 і −½max: 1d2 — 2 = автоматично пройдена перевірка смерті, 1 = спаскидки */
export async function deathCoin(actor) {
  const roll = await new Roll('1d2').evaluate()
  let html = head(actor.img, 'Без свідомості', `${actor.name}: 1d2 — чи потрібні спаскидки`)
  html += step('1d2', roll.total, '2 — перевірку смерті пройдено', { ok: roll.total === 2, text: roll.total === 2 ? 'Стабільний' : 'Спаскидки' })
  if (roll.total === 1) html += `<div class="god-apply god-apply-one"><button type="button" data-god-death="${actor.uuid}|saves"><i class="fa-solid fa-heart-pulse"></i> Спаскидок</button></div>`
  return sendCard(actor, html, [roll])
}

/** Картка наслідків удару (якщо після нього потрібні перевірки) */
export async function hitConsequences(actor, out) {
  const r = actor.system.resources.hp
  const a = R.afterHit(r.value, r.max)
  if (a.state === 'ok' && !a.checks.length) return
  let html = head(actor.img, 'Після удару', `${actor.name}: HP ${r.value} / ${r.max}`)
  if (a.state === 'dead') {
    html += '<div class="god-tier tier-none">Смерть<small>HP впало до −максимуму</small></div>'
    await actor.toggleStatusEffect?.('dead', { active: true, overlay: true })
  } else if (a.state === 'down') {
    await actor.toggleStatusEffect?.('unconscious', { active: true })
    await actor.unsetFlag('god', 'deathSaves')
    html += '<div class="god-tier tier-t10">Без свідомості</div>'
    html += a.death === 'coin'
      ? `<div class="god-note">HP вище −½ максимуму: 1d2 — на 2 перевірку смерті пройдено автоматично.</div>
         <div class="god-apply god-apply-one"><button type="button" data-god-death="${actor.uuid}|coin"><i class="fa-solid fa-coins"></i> Кинути 1d2</button></div>`
      : `<div class="god-note">HP нижче −½ максимуму: спаскидки до трьох успіхів або провалів.</div>
         <div class="god-apply god-apply-one"><button type="button" data-god-death="${actor.uuid}|saves"><i class="fa-solid fa-heart-pulse"></i> Спаскидок</button></div>`
  } else {
    html += '<div class="god-checks">' + a.checks.map(ch => `
      <div class="god-apply god-apply-one"><button type="button" data-god-check="${actor.uuid}|${ch.stat}|${ch.dc}" data-tooltip="${esc(ch.label)}">
        <i class="fa-solid fa-dice-d20"></i> ${esc(ch.label)}</button></div>`).join('') + '</div>'
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="god-card">${html}</div>` })
}

/**
 * Створення персонажа: 6 кидків 6d6 без найменшого куба, потім кожне число — в одну характеристику.
 * Числа не діляться, кожне використовується рівно один раз.
 */
export async function rollStatArray(actor) {
  const rolls = []
  for (let i = 0; i < 6; i++) rolls.push(await new Roll('6d6dl1').evaluate())
  const values = rolls.map(r => r.total)
  let html = head(actor.img, 'Кидок характеристик', '6 × 6d6, найменший куб відкидається')
  html += `<div class="god-faces">${values.map(v => `<span class="hit">${v}</span>`).join('')}</div>`
  await sendCard(actor, html, rolls)

  const stats = Object.entries(GOD.STATS)
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)
  const opts = sel => sorted.map(o => `<option value="${o.i}" ${o.i === sel ? 'selected' : ''}>${o.v}</option>`).join('')
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Розподіл характеристик', icon: 'fa-solid fa-dice' }, classes: ['god-dialog'], position: { width: 360 }, rejectClose: false,
    content: `<p class="god-dlg-info">Випало: <b>${values.join(', ')}</b>. Кожне число — в одну характеристику.</p>` +
      stats.map(([k, s], n) => `<label class="god-dlg-field"><span>${esc(s.label)}</span><select name="${k}">${opts(sorted[n].i)}</select></label>`).join(''),
    buttons: [{ action: 'ok', label: 'Застосувати', default: true, callback: (e, btn) => Object.fromEntries(stats.map(([k]) => [k, Number(btn.form.elements[k].value)])) }],
  })
  if (!res || typeof res !== 'object') return
  const used = Object.values(res)
  if (new Set(used).size !== 6) return ui.notifications.warn('Кожне число можна використати лише один раз — спробуй розподілити ще раз')
  const upd = Object.fromEntries(Object.entries(res).map(([k, i]) => [`system.stats.${k}.value`, values[i]]))
  await actor.update(upd)
  ui.notifications.info(`${actor.name}: характеристики розподілено`)
}
