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

const damageBlock = (phys, mag, note, target = null, { kind = 'melee', pierce = false } = {}) => `
  <div class="god-dmg">
    ${phys ? `<span class="phys">${phys}<small>фіз</small></span>` : ''}
    ${mag ? `<span class="mag">${mag}<small>маг</small></span>` : ''}
    ${!phys && !mag ? '<span class="none">0</span>' : ''}
  </div>
  ${note ? `<div class="god-note">${note}</div>` : ''}
  ${phys || mag ? `<div class="god-apply god-apply-one">
    <button type="button" data-god-apply="1" data-phys="${phys}" data-mag="${mag}" ${target ? `data-target="${target.uuid}"` : ''} ${pierce ? 'data-pierce="pr"' : ''}
      data-tooltip="${target ? `Застосувати до «${esc(target.name)}»` : 'Обраним токенам'}: спершу MR, потім ${pierce ? 'HP (фіз. захист ігнорується)' : 'PR, потім HP'}. Менше за MR — щит не пробито">
      <i class="fa-solid fa-burst"></i> Урон ${phys + mag}${target ? ` → ${esc(target.name)}` : ''}</button>
    ${target ? `<button type="button" class="god-defend" data-god-defend="1" data-kind="${kind}"
      data-tooltip="Маневр «Захист» (для власника цілі): 1d10 зброєю чи піднятим щитом. Вдалося — урону немає, ні — частина урону за Бойовими рефлексами">
      <i class="fa-solid fa-shield-halved"></i> Захист</button>` : ''}
  </div>` : ''}`

// ── Крити і вдача (Player manual, «Очки критичного успіху та вдачі») ─────────
// Крити: оголошуються ДО кидку, кожен — +1 до роллу; натуральна 1 лишається 1 (крити згорають).
// Вдача: після кидку — перекинути з перевагою, без УСІХ негативних модифікаторів (позитивні лишаються).
const isPC = a => a?.type === 'character'
export const critsOf = a => isPC(a) ? Math.max(0, Number(a.system.reputation?.crits) || 0) : 0
export const luckOf = a => isPC(a) ? Math.max(0, Number(a.system.reputation?.luck) || 0) : 0
const pos = n => Math.max(0, Number(n) || 0)
/** Поле «Крити» для діалогу — лише якщо вони є */
const critField = (actor, name = 'crits', label = 'Крити') =>
  critsOf(actor) ? [{ name, label: `${label} (+1 за кожен, є ${critsOf(actor)})`, value: 0 }] : []
async function spendCrits(actor, n) {
  n = Math.max(0, Math.trunc(Number(n) || 0))
  if (!n || !isPC(actor)) return 0
  const have = critsOf(actor)
  n = Math.min(n, have)
  if (n) await actor.update({ 'system.reputation.crits': have - n })
  return n
}
/** Формула d20: режим + модифікатор + крити окремим доданком */
const d20f = (mode, crits) => `${D20[mode] ?? D20.norm} + @m${crits ? ' + @c' : ''}`
/** Підсумок з урахуванням натуральної 1 (крити не рятують) */
const withCrits = (roll, crits) => roll.total - (crits && naturalOf(roll) === 1 ? crits : 0)
const critNote = (crits, nat) => crits ? (nat === 1 ? ` · крити ${crits} згоріли (натуральна 1)` : ` · крити +${crits}`) : ''

async function sendCard(actor, html, rolls, replay = null, luck = false, extra = null) {
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="god-card">${luck ? '<div class="god-luck-tag"><i class="fa-solid fa-clover"></i> Вдача: перекинуто з перевагою, без штрафів</div>' : ''}${html}</div>`,
    rolls,
    sound: CONFIG.sounds.dice,
  }
  if (replay && isPC(actor)) data.flags = { god: { replay: { ...replay, actor: actor.uuid } } }
  if (extra) data.flags = { god: { ...(data.flags?.god ?? {}), ...extra } }
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
          else if (fd.type === 'check') out[fd.name] = el[fd.name]?.checked ?? !!fd.value
          else if (fd.type === 'target' || fd.type === 'select') out[fd.name] = el[fd.name]?.value ?? fd.value ?? ''
          else out[fd.name] = Number(el[fd.name]?.value ?? fd.value) || 0
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
async function d20Check(actor, label, mod, sub, replay, opts = {}) {
  const luck = !!opts.luck
  const p = opts.preset ?? await rollDialog({ title: label, fields: [{ name: 'mod', label: 'Модифікатор', value: mod }, ...critField(actor), { type: 'mode' }] })
  if (!p) return
  const crits = luck ? (p.crits ?? 0) : await spendCrits(actor, p.crits)
  const m = luck ? pos(p.mod) : p.mod, mode = luck ? 'adv' : p.mode
  const roll = await new Roll(d20f(mode, crits), { m, c: crits }).evaluate()
  const nat = naturalOf(roll)
  const cls = nat === 20 ? 'nat20' : nat === 1 ? 'nat1' : ''
  return sendCard(actor, `
    ${head(actor.img, label, sub)}
    <div class="god-big ${cls}">${withCrits(roll, crits)}</div>
    <div class="god-note">куб ${nat} ${signed(m)}${critNote(crits, nat)}${MODE_LABEL[mode] ? ` · ${MODE_LABEL[mode]}` : ''}</div>`, [roll],
    { ...replay, preset: { ...p, crits } }, luck)
}

/** «МОД на всі дії» з ефектів, перевантаження і стану свідомості */
const allMod = actor => actor?.system?.derived?.allMod || 0
const allNote = actor => allMod(actor) ? ` (з них ${actor.system.derived.allModParts || `на всі дії ${allMod(actor)}`})` : ''

export const statCheck = (actor, key, opts) =>
  d20Check(actor, GOD.STATS[key].label, actor.system.stats[key].mod + allMod(actor), `перевірка характеристики${allNote(actor)}`, { fn: 'stat', args: [key] }, opts)

export const skillCheck = (actor, key, opts) =>
  d20Check(actor, GOD.SKILL_INDEX[key].name, actor.system.skill(key) + allMod(actor), `вміння, рівень ${actor.system.skill(key)}${allNote(actor)}`, { fn: 'skill', args: [key] }, opts)

// ── Швидкий кидок з панелі (без діалогу) ─────────────────────────────────────
/**
 * @param pool  {d4: 2, d20: 1, ...} — довільні куби; порожній → перевірка d20
 * @param mode  'norm'|'adv'|'dis' — лише для перевірки d20
 */
export async function quickRoll(actor, spec = {}, opts = {}) {
  const { label = 'Кидок', sub = '', base = 0, extra = 0, mode: mode0 = 'norm', pool = {} } = spec
  const luck = !!opts.luck
  const dice = Object.entries(pool).filter(([, n]) => n > 0)
  const crits = luck ? (spec.crits ?? 0) : await spendCrits(actor, spec.crits)
  const mod = luck ? pos(base) + pos(extra) : base + extra
  const mode = luck ? 'adv' : mode0
  const tail = (mod ? ` ${mod >= 0 ? '+' : '-'} ${Math.abs(mod)}` : '') + (crits ? ` + ${crits}` : '')
  const poolF = dice.map(([d, n]) => `${n}${d}`).join(' + ')
  const isCheck = !dice.length
  let roll = await new Roll(isCheck ? `${D20[mode]}${tail}` : `${poolF}${tail}`).evaluate()
  const rolls = [roll]
  // Вдача для довільних кубів: кидаємо двічі, краще
  if (luck && !isCheck) { const r2 = await new Roll(`${poolF}${tail}`).evaluate(); rolls.push(r2); if (r2.total > roll.total) roll = r2 }
  const nat = isCheck ? naturalOf(roll) : null
  const cls = nat === 20 ? 'nat20' : nat === 1 ? 'nat1' : ''
  const faces = dice.length
    ? `<div class="god-faces">${roll.dice.flatMap(d => d.results.map(r => `<span data-tooltip="d${d.faces}">${r.result}</span>`)).join('')}</div>` : ''
  const detail = isCheck
    ? `куб ${nat}${mod ? ` ${signed(mod)}` : ''}${critNote(crits, nat)}${MODE_LABEL[mode] ? ` · ${MODE_LABEL[mode]}` : ''}`
    : `${esc(roll.formula)}${luck ? ' · кращий з двох' : ''}`
  return sendCard(actor, `
    ${head(actor?.img, label, sub)}
    <div class="god-big ${cls}">${isCheck ? withCrits(roll, crits) : roll.total}</div>
    ${faces}
    <div class="god-note">${detail}</div>`, rolls, { fn: 'quick', args: [{ ...spec, crits }] }, luck)
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

/** Шанс на 1d2/1d4 за описом з R.ODDS; auto — спрацьовує без кидка (Легка, 10 рівень) */
async function rollOdds(rolls, kind, auto = false) {
  const o = R.ODDS[kind]
  if (auto) return { value: '—', ok: true, label: `${o.label}: автоматично` }
  const r = await new Roll(o.die).evaluate(); rolls.push(r)
  return { value: r.total, ok: o.ok(r.total), label: o.label }
}

/** Фіз. захист одягнених рукавиць — для кулачного бою (7+ рівень) */
const glovesPr = actor => [...(actor.items ?? [])].filter(i => i.type === 'armor' && i.system.equipped && i.system.slot === 'Рукавиці')
  .reduce((a, i) => a + (Number(i.system.phys) || 0), 0)

/** Посилання на зброю для повторного кидка: uuid предмета або (для атаки НІП) сам опис */
const itemRef = item => item.natural ? { name: item.name, img: item.img, natural: true, system: { ...item.system } } : item.uuid
async function itemFrom(ref) { return typeof ref === 'string' ? fromUuid(ref) : ref }

/** Спільні дані атаки: категорія, рівні, перки, доступні здібності */
function attackInfo(actor, item) {
  const sys = actor.system
  const cat = item.system.category
  const ws = GOD.WEAPON_SKILLS[cat] ?? {}
  const isChar = actor.type === 'character'
  const natural = !!item.natural
  const profLvl = sys.skill?.(ws.prof) ?? 0
  return {
    sys, cat, ws, isChar, natural, profLvl, accLvl: sys.skill?.(ws.acc) ?? 0, cm: sys.combat ?? {}, melee: !RANGED.has(cat),
    perks: isChar ? R.weaponPerks(cat, profLvl) : {}, abilities: natural ? [] : R.availableAbilities(cat, profLvl),
  }
}

/**
 * Атака, крок 1 — лише кидок попадання. Якщо влучив, на картці з'являється «Кинути урон»:
 * урон кидається окремо (і крити на урон оголошуються вже тоді).
 */
export async function weaponAttack(actor, item, opts = {}) {
  const luck = !!opts.luck
  const A = attackInfo(actor, item)
  const { sys, cat, isChar, natural, profLvl, accLvl, cm, melee, abilities } = A
  const choices = opts.preset ? [] : targetChoices(actor)
  if (!opts.preset && !choices.length) return ui.notifications.warn('На сцені немає цілей для атаки')

  // Модифікатори за правилами: прицільність 0 → −5, урон від володіння за «формулою ГМ-а», максимум +12
  const hitDefault = (isChar ? R.accuracyMod(accLvl) : accLvl) + (cm.hitMod || 0) + allMod(actor)
  const dmgDefault = (isChar ? R.proficiencyDamageMod(profLvl) : (sys.attack?.damageMod ?? 0)) + (cm.damageMod || 0) + (sys.derived?.mindDmg || 0)
  const abilityOpts = { '': 'Звичайна атака', ...Object.fromEntries(abilities.map(a => [a.id, `${a.name}${a.level > 1 ? ` (${a.level} рів.)` : ''} — ${a.ed} ВС`])) }
  const p = opts.preset ?? await rollDialog({
    title: `Атака: ${item.name}`,
    info: 'Спершу кидок попадання: має бути <b>більше</b> за ШУ цілі (17–20 — гарантовано, 1 — промах). Урон — окремим кидком, якщо влучив.',
    fields: [
      { type: 'target', name: 'target', choices },
      { type: 'select', name: 'dir', label: 'Звідки б\'єш', options: DIRECTIONS, value: 'front' },
      ...(abilities.length ? [{ type: 'select', name: 'ability', label: 'Здібність зброї', options: abilityOpts, value: '' }] : []),
      { name: 'hitMod', label: 'Модифікатор попадання', value: isChar ? R.capMod(hitDefault) : hitDefault },
      { name: 'dmgMod', label: 'Модифікатор урону', value: isChar ? R.capMod(dmgDefault) : dmgDefault },
      { name: 'aim', label: melee ? 'Оцінок перед ударом (до 4: +1 попадання, +0.5 урону)' : 'Прицілювань (до 10: +1 попадання)', value: 0 },
      ...critField(actor, 'critHit', 'Крити на попадання'),
      { type: 'mode' },
    ],
  })
  if (!p) return
  const target = resolveTarget(p.target)
  if (!target) return ui.notifications.warn('Ціль зникла зі сцени')

  // Здібність: спершу витривалість
  const ab = abilities.find(a => a.id === p.ability) ?? null
  if (ab && !luck) {
    const ed = sys.resources?.ed
    if (ed && ed.value < ab.ed) return ui.notifications.warn(`${ab.name}: потрібно ${ab.ed} ВС, є ${ed.value}`)
    if (ed) await actor.update({ 'system.resources.ed.value': ed.value - ab.ed })
  }

  // Положення: тил — перевага на попадання, фланг +1; сам лежиш −3. Вдача: перевага, від'ємні модифікатори відкидаються
  const notes = []
  let hitMod = luck ? pos(p.hitMod) : p.hitMod
  let hitMode = luck ? 'adv' : p.mode
  if (p.dir === 'flank') { hitMod += 1; notes.push('фланг +1') }
  if (p.dir === 'back') { hitMode = mergeMode(hitMode, 'adv'); notes.push('тил: перевага') }
  if (hasStatus(actor, 'prone') && !luck) { hitMod -= 3; notes.push('лежачи −3') }
  const aim = R.aimBonus(p.aim, melee)
  if (aim.n) { hitMod += aim.hit; notes.push(`${melee ? 'оцінка' : 'прицілювання'} ×${aim.n}`) }
  if (isChar) hitMod = R.capMod(hitMod)
  const cHit = luck ? (p.critHit ?? 0) : await spendCrits(actor, p.critHit)
  const ref = itemRef(item)
  const replay = { fn: 'weapon', args: [ref], preset: { ...p, critHit: cHit } }

  const rolls = []
  const sub = `${natural ? esc(actor.name) : (GOD.WEAPON_CATEGORIES[cat] ?? '')} · володіння ${profLvl} → ${esc(target.name)}`
  let html = head(item.img ?? actor.img, item.name, sub)
  if (ab) html += `<div class="god-ability"><i class="fa-solid fa-star"></i> ${esc(ab.name)}${ab.level > 1 ? ` · ${ab.level} рівень` : ''} <small>${luck ? 'ВС уже списано' : `−${ab.ed} ВС`}</small></div>`

  let hc = { hit: true, guaranteed: null }
  if (ab?.id === 'shadow') {
    // Тіньовий удар: ціль не бачить героя — попадання автоматичне
    html += step('Попадання', '—', 'ціль не бачить — автоматично', { ok: true, text: 'Так' })
  } else {
    const hit = await new Roll(d20f(hitMode, cHit), { m: hitMod, c: cHit }).evaluate()
    rolls.push(hit)
    const nat = naturalOf(hit), hitTotal = withCrits(hit, cHit)
    hc = R.hitCheck({ total: hitTotal, natural: nat, dodge: target.dodge })
    let hitOk = hc.hit
    html += step('Попадання', hitTotal,
      `куб ${nat} ${signed(hitMod)}${critNote(cHit, nat)}${MODE_LABEL[hitMode] ? ` · ${MODE_LABEL[hitMode]}` : ''} · проти ШУ ${target.dodge}${notes.length ? ` · ${notes.join(', ')}` : ''}`,
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
      return sendCard(actor, html, rolls, replay, luck)
    }
  }
  if (hc.guaranteed) html += `<div class="god-note">Урон щонайменше: ${esc(R.TIER[profLvl >= 1 ? hc.guaranteed : (hc.guaranteed === 'crit' ? 't100' : hc.guaranteed)].label.toLowerCase())}.</div>`
  html += `<div class="god-apply god-apply-one"><button type="button" class="god-roll-dmg" data-god-damage="1"
    data-tooltip="Окремий кидок урону${critsOf(actor) ? '. Крити на урон — перед кидком' : ''}"><i class="fa-solid fa-dice-d20"></i> Кинути урон</button></div>`
  const attack = { actor: actor.uuid, item: ref, p: { ...p, critHit: cHit }, guaranteed: hc.guaranteed ?? null, target: target.uuid }
  return sendCard(actor, html, rolls, replay, luck, { attack })
}

/**
 * Атака, крок 2 — кидок урону після влучання (кнопка «Кинути урон» на картці попадання).
 * @param state  flags.god.attack з картки попадання
 */
export async function weaponDamage(actor, item, state, opts = {}) {
  const luck = !!opts.luck
  const A = attackInfo(actor, item)
  const { sys, cat, isChar, natural, profLvl, melee, perks, abilities } = A
  const p = state.p
  const target = resolveTarget(state.target)
  if (!target) return ui.notifications.warn('Ціль зникла зі сцени')
  const ab = abilities.find(a => a.id === p.ability) ?? null

  // Тил +2, оцінка +0.5 за кожну; ціль лежить (ближній) — урон з перевагою. Вдача: перевага без від'ємних
  const notes = []
  let dmgMod = luck ? pos(p.dmgMod) : p.dmgMod, dmgMode = luck ? 'adv' : 'norm'
  if (p.dir === 'back') { dmgMod += 2; notes.push('тил +2') }
  if (melee && hasStatus(target.actor, 'prone')) { dmgMode = 'adv'; notes.push('ціль лежить: перевага') }
  const aim = R.aimBonus(p.aim, melee)
  if (aim.dmg) { dmgMod += aim.dmg; notes.push(`оцінка +${aim.dmg}`) }
  if (isChar) dmgMod = R.capMod(dmgMod)
  const cDmg = luck ? (opts.preset?.crits ?? 0) : await askCrits(actor, `Урон: ${item.name}`)
  if (cDmg === null) return
  const replay = { fn: 'weaponDmg', args: [itemRef(item), state], preset: { crits: cDmg } }

  const rolls = [], after = []
  let html = head(item.img ?? actor.img, `Урон: ${item.name}`, `${natural ? esc(actor.name) : (GOD.WEAPON_CATEGORIES[cat] ?? '')} · володіння ${profLvl} → ${esc(target.name)}`)
  const dmg = await new Roll(d20f(dmgMode, cDmg), { m: dmgMod, c: cDmg }).evaluate()
  rolls.push(dmg)
  const dmgTotal = withCrits(dmg, cDmg)
  const tier = R.damageTier({ total: dmgTotal, natural: naturalOf(dmg), skillLvl: profLvl })
  let key = tier.tier
  html += step('Урон', dmgTotal, `куб ${naturalOf(dmg)} ${signed(dmgMod)}${critNote(cDmg, naturalOf(dmg))}${MODE_LABEL[dmgMode] ? ` · ${MODE_LABEL[dmgMode]}` : ''}${notes.length ? ` · ${notes.join(', ')}` : ''}`, null)
  if (tier.chance) {
    if (perks.autoChance) {
      html += step('ШАНС', '—', `легка зброя 10 рівня: ${R.TIER[tier.chance].label.toLowerCase()} автоматично`, { ok: true, text: 'Спрацював' })
      key = R.betterTier(key, tier.chance)
    } else {
      const ch = await rollChance(rolls)
      html += step('ШАНС', ch.value, `1d4: 3 — ${R.TIER[tier.chance].label.toLowerCase()}`, { ok: ch.ok, text: ch.ok ? 'Спрацював' : 'Ні' })
      if (ch.ok) key = R.betterTier(key, tier.chance)
    }
  }
  // Тіньовий удар: шанс криту/смертельного від результату урону
  if (ab?.id === 'shadow' && profLvl >= 1) {
    const rule = (R.SHADOW_STRIKE[ab.level] ?? []).find(x => dmgTotal >= x.min)
    if (rule && R.betterTier(key, rule.tier) !== key) {
      const o = await rollOdds(rolls, rule.odds, perks.autoChance)
      html += step('Тіньовий удар', o.value, `${o.label} — ${R.TIER[rule.tier].label.toLowerCase()} (урон ${rule.min}+)`, { ok: o.ok, text: o.ok ? 'Спрацював' : 'Ні' })
      if (o.ok) key = R.betterTier(key, rule.tier)
    }
  }
  // Гарантований мінімум із сітки попадання (без володіння крит → 100%)
  let guaranteedNote = ''
  if (state.guaranteed) {
    const g = profLvl >= 1 ? state.guaranteed : (state.guaranteed === 'crit' ? 't100' : state.guaranteed)
    const before = key
    key = R.betterTier(key, g)
    if (key !== before) guaranteedNote = `гарантовано попаданням`
  }
  const st = sys.stats
  const base = natural
    ? { phys: sys.attack?.phys || 0, mag: sys.attack?.mag || 0, notes: [] }
    : R.weaponDamage({
      str: st.str.value, int: st.int.value, phys: item.system.phys, mag: item.system.mag, offHand: item.system.hand === 'off',
      cat, lvl: profLvl, magic: (sys.skill?.('Магічність') ?? 0) > 0, gloves: glovesPr(actor), char: isChar,
    })
  let pierce = false
  if (ab?.id === 'trauma') { base.phys += 50; base.notes.push('травматичний постріл +50'); after.push('Ціль, що тікає, отримує травму ноги; якщо не тікає — шанс травми.') }
  if (ab?.id === 'deadshot') { const b = Math.max(0, st.str.mod) * 50; base.phys += b; pierce = true; base.notes.push(`смертельний постріл +${b} (МОД СИЛ×50)`); after.push('Фізичний захист цілі ігнорується.') }
  const pct = R.TIER[key].pct
  const out = R.applyPct(base, pct)
  if (ab?.id === 'double') { out.phys *= 2; out.mag *= 2; after.push('Дві стріли однією перевіркою — урон ×2. Потрібен сагайдак.') }
  // Заборонений удар: шанс додати % фінального урону (ціль без броні; 3 рівень — будь-яка)
  if (ab?.id === 'forbidden') {
    const f = R.FORBIDDEN_STRIKE[ab.level]
    const tr = target.actor.system.resources
    const bare = !((tr?.pr?.value ?? 0) > 0 || (tr?.mr?.value ?? 0) > 0)
    if (bare || f.armored) {
      const o = await rollOdds(rolls, f.odds, perks.autoChance)
      html += step('Заборонений удар', o.value, `${o.label} — +${f.pct}% урону`, { ok: o.ok, text: o.ok ? 'Спрацював' : 'Ні' })
      if (o.ok) { out.phys += Math.floor(out.phys * f.pct / 100); out.mag += Math.floor(out.mag * f.pct / 100) }
    } else after.push('Заборонений удар: ціль у броні — до 3 рівня не діє.')
  }
  if (ab?.id === 'heaven') {
    const series = R.heavenSeries(out.phys + out.mag, ab.level)
    after.push(`Небесна кара: наступні цілі навколо — ${series.join(' → ')} (кожна на ${R.HEAVEN_STRIKE[ab.level].cut}% менше).`)
  }
  if (ab?.id === 'feint') after.push(`Фінт: другий удар замість наступн${['', 'ого ПХ', 'ої дії', 'ої дод. дії'][ab.level]}.`)
  if (ab?.id === 'instant') after.push(`Миттєвий захист: удар упритул і кидок тієї ж зброї в іншого ворога; ${ab.level > 1 ? 'за бажанням відскок на 2 м' : 'відскок на 1 клітину назад'}.`)
  if (ab?.id === 'deaththrow') after.push('Кидок смерті: друга зброя летить у ту саму ціль — ще одна атака.')

  const tierNote = [tier.note && !tier.chance ? tier.note : '', key !== tier.tier ? `покращено з «${tier.label}»` : '', guaranteedNote].filter(Boolean).join(' · ')
  html += `<div class="god-tier tier-${key}">${R.TIER[key].label}<small>${pct}%${tierNote ? ` · ${esc(tierNote)}` : ''}</small></div>`
  const baseNote = `100% = ${base.phys} фіз${base.mag ? ` / ${base.mag} маг` : ''}${base.notes.length ? ` (${base.notes.join(', ')})` : ''}`
  html += damageBlock(out.phys, out.mag, [baseNote, ...after].map(esc).join('<br>'), target, { kind: melee ? 'melee' : 'ranged', pierce })
  return sendCard(actor, html, rolls, replay, luck)
}

/** Кнопка «Кинути урон» на картці попадання: кидає власник нападника або майстер, лише раз */
export async function rollAttackDamage(message, markFlag) {
  const st = message.getFlag?.('god', 'attack')
  if (!st || message.getFlag('god', 'damageRolled') || message.getFlag('god', 'lucky')) return
  const actor = await fromUuid(st.actor)
  const a = actor?.actor ?? actor
  if (!a?.isOwner) return ui.notifications.warn('Урон кидає той, хто атакував, або майстер')
  const item = await itemFrom(st.item)
  if (!item) return ui.notifications.warn('Зброї вже немає')
  await markFlag(message, 'damageRolled', true)
  return weaponDamage(a, item, st)
}

/**
 * Маневр «Захист» проти удару з картки. Повертає, скільки урону дістається (0 — відбито), або null — скасовано.
 * @param kind 'melee' | 'ranged' | 'magic'
 */
export async function defend(actor, amount, kind = 'melee') {
  const sys = actor.system
  const isChar = actor.type === 'character'
  const reflexes = isChar ? (sys.skill?.('Бойові_рефлекси') ?? 0) : 1
  if (isChar && reflexes < 1) { ui.notifications.warn(`${actor.name}: «Захист» доступний з 1 рівня Бойових рефлексів`); return null }
  const ranged = kind !== 'melee'
  const eq = actor.items.filter(i => i.system.equipped)
  const opts = {}
  for (const w of eq.filter(i => i.type === 'weapon')) {
    const c = w.system.category
    if (ranged || R.DEFENSE_DC[c] === undefined) continue
    opts[`w:${w.id}`] = `${w.name} — 1d10 ≥ ${R.DEFENSE_DC[c]}`
  }
  if (!ranged && !eq.some(i => i.type === 'weapon')) { opts.fist = `Кулаки (рівний бій) — 1d10 ≥ ${R.DEFENSE_DC.fist}`; opts.fistUneven = `Кулаки проти зброї — 1d10 ≥ ${R.DEFENSE_DC.fistUneven}` }
  for (const sh of eq.filter(i => i.type === 'armor' && i.system.slot === 'Щит')) {
    if (kind === 'magic' && !(Number(sh.system.mag) > 0)) continue
    const dc = R.DEFENSE_DC.shield[sh.system.shieldSize || 'small'][ranged ? 'ranged' : 'melee']
    opts[`s:${sh.id}`] = `${sh.name} (піднятий) — 1d10 ≥ ${dc}`
  }
  if (!Object.keys(opts).length) { ui.notifications.warn(`${actor.name}: нема чим захиститись від ${kind === 'magic' ? 'магії' : ranged ? 'стріл' : 'цього удару'}`); return null }
  const p = await rollDialog({
    title: `Захист: ${actor.name}`,
    info: `Вхідний урон <b>${amount}</b>. Захист завжди спрацьовує проти першого ворога за раунд, далі — з шансом; від 5-го вже ні.`,
    fields: [
      { type: 'select', name: 'by', label: 'Чим', options: opts, value: Object.keys(opts)[0] },
      { type: 'select', name: 'nth', label: 'Який ворог б\'є тебе цього раунду', options: { 1: 'Перший', 2: 'Другий (75%)', 3: 'Третій (50%)', 4: 'Четвертий (25%)', 5: 'П\'ятий і далі' }, value: '1' },
      ...critField(actor, 'crits', 'Крити на захист'),
    ],
  })
  if (!p) return null
  const rolls = []
  let html = head(actor.img, 'Захист', `${esc(actor.name)} · вхідний урон ${amount}`)
  let ok = true
  const nth = Number(p.nth) || 1
  if (nth >= 5) { ok = false; html += `<div class="god-note">П'ятий ворог за раунд — захиститись уже не можна.</div>` }
  else if (R.DEFENSE_GATE[nth]) {
    const r = await new Roll('1d4').evaluate(); rolls.push(r)
    ok = R.DEFENSE_GATE[nth](r.total)
    html += step('Встиг захиститись', r.total, `${nth}-й ворог: 1d4 ${{ 2: '≥ 2', 3: '≥ 3', 4: '= 3' }[nth]}`, { ok, text: ok ? 'Так' : 'Ні' })
  }
  if (ok) {
    let dc
    if (p.by.startsWith('w:')) dc = R.DEFENSE_DC[actor.items.get(p.by.slice(2))?.system.category]
    else if (p.by.startsWith('s:')) dc = R.DEFENSE_DC.shield[actor.items.get(p.by.slice(2))?.system.shieldSize || 'small'][ranged ? 'ranged' : 'melee']
    else dc = R.DEFENSE_DC[p.by]
    const crits = await spendCrits(actor, p.crits)
    const r = await new Roll(`1d10${crits ? ' + @c' : ''}`, { c: crits }).evaluate(); rolls.push(r)
    const total = withCrits(r, crits)
    ok = total >= dc
    html += step('Захист', total, `${esc(opts[p.by].split(' — ')[0])}: 1d10 ≥ ${dc}${critNote(crits, naturalOf(r))}`, { ok, text: ok ? 'Відбито' : 'Не вдалося' })
  }
  const pct = ok ? 0 : R.defenseFailPct(reflexes, ranged)
  const left = Math.floor(amount * pct / 100)
  html += `<div class="god-note">${ok ? 'Урон повністю відбито.' : `Проходить ${pct}% урону: <b>${left}</b>${pct < 100 ? ` (Бойові рефлекси ${reflexes})` : ranged ? ' (стріли й магія — повністю)' : ''}.`}</div>`
  await sendCard(actor, html, rolls)
  return left
}

// ── Сотворення заклинання (v4.5.0 §1.2) ──────────────────────────────────────
export async function castSpell(actor, spell, opts = {}) {
  const luck = !!opts.luck
  const s = spell.system, sys = actor.system
  const schoolLvl = sys.schools[s.school] ?? 0
  const school = GOD.SPELL_SCHOOLS[s.school]
  if (!schoolLvl) return ui.notifications.warn(`Немає володіння школою «${school}»${actor.type === 'character' ? ' — потрібне відповідне вміння в гілці «Магія»' : ''}`)
  const needsHit = s.attackType === 'target' || s.attackType === 'touch'
  const choices = needsHit && !opts.preset ? targetChoices(actor) : []
  if (needsHit && !opts.preset && !choices.length) return ui.notifications.warn('На сцені немає цілей для заклинання')
  const n = R.castDiceCount(sys.stats.int.value), die = R.schoolDie(schoolLvl)

  const p = opts.preset ?? await rollDialog({
    title: `Сотворення: ${spell.name}`,
    info: `${school}, володіння ${schoolLvl} → <b>${n}d${die}</b>, потрібно ≥ ${s.threshold} хоча б на одному кубі.` +
      (needsHit ? '<br>Спершу попадання: має бути <b>більше</b> за ШУ цілі.' : ''),
    fields: [
      ...(needsHit ? [
        { type: 'target', name: 'target', choices },
        { name: 'hitMod', label: 'Маг. прицільність', value: actor.type === 'character'
          ? R.capMod(R.accuracyMod(sys.skill('Маг_прицільність')) + (sys.combat.hitMod || 0) + allMod(actor))
          : sys.skill('Маг_прицільність') + (sys.combat.hitMod || 0) + allMod(actor) },
        ...critField(actor, 'critHit', 'Крити на попадання'),
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
    if (!p.pay || paid || luck) return
    paid = true
    const cur = actor.system.resources
    await actor.update({ 'system.resources.mp.value': cur.mp.value - s.manaCost, 'system.resources.ed.value': cur.ed.value - s.staminaCost })
  }
  const manaWarn = () => p.pay && actor.system.resources.mp.value <= 0
    ? `<div class="god-note god-warn">Мана ${actor.system.resources.mp.value} OM — перевірка <b>12+ від Тілобудови</b>, щоб не знепритомніти.
       <div class="god-apply god-apply-one"><button type="button" data-god-check="${actor.uuid}|con|12">Кинути Тілобудову</button></div></div>` : ''

  const rolls = []
  const cHit = !needsHit ? 0 : luck ? (p.critHit ?? 0) : await spendCrits(actor, p.critHit)
  const replay = { fn: 'spell', args: [spell.uuid], preset: { ...p, critHit: cHit } }
  let html = head(spell.img, spell.name, `${school} · ${GOD.ATTACK_TYPES[s.attackType]}`)

  if (needsHit) {
    const hm = luck ? pos(p.hitMod) : p.hitMod
    const hitMod = actor.type === 'character' ? R.capMod(hm) : hm
    const hit = await new Roll(d20f(luck ? 'adv' : 'norm', cHit), { m: hitMod, c: cHit }).evaluate()
    rolls.push(hit)
    const hitTotal = withCrits(hit, cHit)
    const hc = R.hitCheck({ total: hitTotal, natural: naturalOf(hit), dodge: target.dodge })
    let ok = hc.hit
    html += step('Попадання', hitTotal, `куб ${naturalOf(hit)} ${signed(hitMod)}${critNote(cHit, naturalOf(hit))}${luck ? ' · перевага' : ''} · ${esc(target.name)}, ШУ ${target.dodge}`,
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
      html += `<div class="god-note">${luck ? 'Ресурси вже списані первинним кидком' : p.pay ? `Мана списана: ${s.manaCost} OM` : 'Ресурси не списувались'}</div>` + manaWarn()
      return sendCard(actor, html, rolls, replay, luck)
    }
  }

  let cast = await new Roll(`${n}d${die}`).evaluate()
  rolls.push(cast)
  let faces = cast.dice[0].results.map(r => r.result)
  let ev = R.evaluateCast(faces, p.threshold)
  // Вдача: пул сотворення кидається двічі, береться вдаліший
  if (luck && !ev.success) {
    const c2 = await new Roll(`${n}d${die}`).evaluate(); rolls.push(c2)
    const f2 = c2.dice[0].results.map(r => r.result), e2 = R.evaluateCast(f2, p.threshold)
    if (e2.success) { cast = c2; faces = f2; ev = e2 }
  }
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
    html += damageBlock(s.damageKind === 'phys' ? dmg : 0, s.damageKind === 'mag' ? dmg : 0, `${s.baseDamage} × ${mult}`, target, { kind: 'magic' })
  }
  if (p.pay && !luck) html += `<div class="god-note">Списано ${s.manaCost} OM${s.staminaCost ? `, ${s.staminaCost} ВС` : ''}</div>` + manaWarn()
  return sendCard(actor, html, rolls, replay, luck)
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

/** Крити перед кидком без звичайного діалогу: питаємо лише якщо вони є */
async function askCrits(actor, title) {
  if (!critsOf(actor)) return 0
  const p = await rollDialog({ title, fields: critField(actor) })
  if (!p) return null
  return spendCrits(actor, p.crits)
}

/** Перевірка «N+ від характеристики»: d20 + МОД */
export async function thresholdCheck(actor, stat, dc, why = '', opts = {}) {
  const luck = !!opts.luck
  const crits = luck ? (opts.preset?.crits ?? 0) : await askCrits(actor, `${STAT_LABEL(stat)} ${dc}+`)
  if (crits === null) return
  const mod0 = (actor.system.stats?.[stat]?.mod ?? 0) + allMod(actor)
  const mod = luck ? pos(mod0) : mod0
  const roll = await new Roll(d20f(luck ? 'adv' : 'norm', crits), { m: mod, c: crits }).evaluate()
  const total = withCrits(roll, crits)
  const ok = total >= dc
  let html = head(actor.img, `${STAT_LABEL(stat)} ${dc}+`, why || 'перевірка')
  html += step('Кидок', total, `куб ${naturalOf(roll)} ${signed(mod)}${critNote(crits, naturalOf(roll))}${luck ? ' · перевага' : ''}`, { ok, text: ok ? 'Успіх' : 'Провал' })
  return sendCard(actor, html, [roll], { fn: 'threshold', args: [stat, dc, why], preset: { crits } }, luck)
}

/** Спаскидок: 11+ успіх, 1 = два провали, 20 = два успіхи; три успіхи — стабільний, три провали — смерть */
export async function deathSave(actor, opts = {}) {
  const luck = !!opts.luck
  // Вдача перекидає саме цей спаскидок: повертаємо стан до нього
  const before = luck ? (opts.preset?.before ?? {}) : (actor.getFlag('god', 'deathSaves') ?? {})
  if (luck) {
    if (opts.preset?.wasDead) await actor.toggleStatusEffect?.('dead', { active: false })
    await actor.setFlag('god', 'deathSaves', before)
  }
  // Реанімація (Player manual): інший герой кидає замість того, хто при смерті, з МОД + рівень уміння
  let crits = 0, rev = null
  if (luck) { crits = opts.preset?.crits ?? 0; rev = opts.preset?.rev ?? null }
  else {
    const revivers = (game.actors?.filter?.(a => a.type === 'character' && a.id !== actor.id && (a.system.skill?.('Реанімація') ?? 0) > 0) ?? [])
    const fields = [
      ...(revivers.length ? [{ type: 'select', name: 'by', label: 'Хто кидає', value: '',
        options: { '': `${actor.name} сам`, ...Object.fromEntries(revivers.map(a => [a.id, `${a.name} — Реанімація +${a.system.skill('Реанімація')}`])) } }] : []),
      ...critField(actor, 'crits', `Крити ${actor.name}`),
    ]
    if (fields.length) {
      const p = await rollDialog({ title: 'Спаскидок', fields, info: revivers.length ? 'Реаніматор кидає замість героя: + рівень Реанімації. Крити — лише власні, якщо кидає сам герой.' : '' })
      if (!p) return
      const r = p.by ? game.actors.get(p.by) : null
      if (r) rev = { name: r.name, lvl: r.system.skill('Реанімація') }
      else crits = await spendCrits(actor, p.crits)
    }
  }
  const rm = rev?.lvl ?? 0
  const roll = await new Roll(`${luck ? '2d20kh' : '1d20'}${rm ? ' + @r' : ''}${crits ? ' + @c' : ''}`, { c: crits, r: rm }).evaluate()
  const nat = naturalOf(roll)
  // 1 і 20 рахуються за кубом; крити й Реанімація додаються до результату (на натуральній 1 згорають)
  const value = nat === 1 || nat === 20 ? nat : Math.min(19, withCrits(roll, crits))
  const s = R.deathSave(before, value)
  let html = head(actor.img, 'Перевірка смерті', `${actor.name}: успіхи ${s.ok}/3 · провали ${s.fail}/3${rev ? ` · кидає ${esc(rev.name)}` : ''}`)
  html += step('Спаскидок', withCrits(roll, crits), (nat === 20 ? 'двадцятка — два успіхи' : nat === 1 ? 'одиниця — два провали' : '11+ успіх') + (rm ? ` · Реанімація +${rm}` : '') + critNote(crits, nat) + (luck ? ' · перевага' : ''),
    { ok: value >= 11, text: value >= 11 ? 'Успіх' : 'Провал' })
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
  return sendCard(actor, html, [roll], { fn: 'deathSave', args: [], preset: { before, crits, rev, wasDead: s.result === 'dead' } }, luck)
}

/** HP між 0 і −½max: 1d2 — 2 = автоматично пройдена перевірка смерті, 1 = спаскидки */
export async function deathCoin(actor, opts = {}) {
  const luck = !!opts.luck
  const crits = luck ? (opts.preset?.crits ?? 0) : await askCrits(actor, 'Без свідомості: 1d2')
  if (crits === null) return
  const roll = await new Roll(`${luck ? '2d2kh' : '1d2'}${crits ? ' + @c' : ''}`, { c: crits }).evaluate()
  const nat = naturalOf(roll)
  const ok = withCrits(roll, crits) >= 2
  let html = head(actor.img, 'Без свідомості', `${actor.name}: 1d2 — чи потрібні спаскидки`)
  html += step('1d2', withCrits(roll, crits), '2 — перевірку смерті пройдено' + critNote(crits, nat) + (luck ? ' · перевага' : ''), { ok, text: ok ? 'Стабільний' : 'Спаскидки' })
  if (!ok) html += `<div class="god-apply god-apply-one"><button type="button" data-god-death="${actor.uuid}|saves"><i class="fa-solid fa-heart-pulse"></i> Спаскидок</button></div>`
  return sendCard(actor, html, [roll], { fn: 'deathCoin', args: [], preset: { crits } }, luck)
}

/** Картка наслідків удару (якщо після нього потрібні перевірки) */
export async function hitConsequences(actor, out) {
  const r = actor.system.resources.hp
  // НІП: жодних перевірок свідомості — HP ≤ 0 означає смерть
  if (actor.type === 'npc') {
    if (r.value > 0 || actor.statuses?.has('dead')) return
    await actor.toggleStatusEffect?.('dead', { active: true, overlay: true })
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="god-card">${head(actor.img, 'Загинув', `${esc(actor.name)}: HP ${r.value}`)}<div class="god-tier tier-none">Смерть</div></div>` })
  }
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

// ── Вдача: перекинути кидок з картки ─────────────────────────────────────────
const REPLAY = {
  stat: (a, [k], o) => statCheck(a, k, o),
  skill: (a, [k], o) => skillCheck(a, k, o),
  quick: (a, [spec], o) => quickRoll(a, spec, o),
  weapon: async (a, [u], o) => { const it = await itemFrom(u); return it ? weaponAttack(a, it, o) : ui.notifications.warn('Зброї вже немає') },
  weaponDmg: async (a, [u, st], o) => { const it = await itemFrom(u); return it ? weaponDamage(a, it, st, o) : ui.notifications.warn('Зброї вже немає') },
  spell: async (a, [u], o) => { const it = await fromUuid(u); return it ? castSpell(a, it, o) : ui.notifications.warn('Заклинання вже немає') },
  threshold: (a, [st, dc, why], o) => thresholdCheck(a, st, dc, why, o),
  deathSave: (a, _, o) => deathSave(a, o),
  deathCoin: (a, _, o) => deathCoin(a, o),
}

/** Чи можна зараз витратити вдачу на цю картку (для показу кнопки) */
export function canLuck(message) {
  const r = message.getFlag?.('god', 'replay')
  if (!r || message.getFlag('god', 'lucky') || !REPLAY[r.fn]) return null
  if (Object.keys(message.getFlag('god', 'applied') ?? {}).length) return null
  if (message.getFlag('god', 'damageRolled')) return null   // урон уже кинуто — попадання не перекидаємо
  const actor = fromUuidSync(r.actor)
  if (!actor?.isOwner || !luckOf(actor)) return null
  return actor
}

/** Витратити 1 вдачу і перекинути: перевага, без від'ємних модифікаторів, без повторних витрат */
export async function luckReroll(message, markLucky) {
  const actor = canLuck(message)
  if (!actor) return ui.notifications.warn('Вдачу тут не використати')
  const r = message.getFlag('god', 'replay')
  await actor.update({ 'system.reputation.luck': luckOf(actor) - 1 })
  await markLucky(message)
  return REPLAY[r.fn](actor, r.args ?? [], { luck: true, preset: r.preset })
}
