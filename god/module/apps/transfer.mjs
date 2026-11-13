/**
 * Передача предметів і грошей між персонажами + зручний гаманець.
 * Гравець не володіє чужим листом, тож саму передачу робить майстер (сокет системи);
 * якщо поточний користувач власник обох — усе робиться одразу.
 * У чат іде коротка картка «хто → кому: що».
 */
import * as R from '../rules.mjs'
import { GOD } from '../config.mjs'

const { DialogV2 } = foundry.applications.api
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const COIN_ORDER = ['platinum', 'gold', 'silver', 'copper']

// ── Кому передати ──────────────────────────────────────────────────────────────
function recipients(from) {
  const owners = a => game.users.filter(u => !u.isGM && a.testUserPermission(u, 'OWNER')).map(u => u.name)
  const heroes = game.actors.filter(a => a.type === 'character' && a.id !== from.id && !(from.isToken && a.id === from.token?.actorId))
    .map(a => ({ uuid: a.uuid, name: a.name, img: a.img, who: owners(a).join(', ') }))
  const seen = new Set(heroes.map(h => h.uuid))
  const onScene = (canvas?.scene?.tokens ?? []).filter(t => t.actor && t.actor.type !== 'character' && t.actor !== from && (!t.hidden || game.user.isGM))
    .map(t => ({ uuid: t.actor.uuid, name: t.name, img: t.texture?.src || t.actor.img, who: 'на сцені' }))
    .filter(t => !seen.has(t.uuid))
  return { heroes, onScene }
}

const coinInputs = (prefix = '', values = {}) => `<div class="god-purse god-purse-dlg">${COIN_ORDER.map(k => `
  <label class="god-coin god-coin-${k}" data-tooltip="${GOD.MONEY[k].label}"><i></i>
    <input type="number" name="${prefix}${k}" value="${values[k] ?? 0}" min="0" step="1"><span>${GOD.MONEY[k].abbr}</span></label>`).join('')}</div>`
const readCoins = (form, prefix = '') => Object.fromEntries(COIN_ORDER.map(k => [k, Math.max(0, Math.trunc(Number(form.elements[`${prefix}${k}`]?.value) || 0))]))

function recipientField(from) {
  const { heroes, onScene } = recipients(from)
  if (!heroes.length && !onScene.length) return null
  const opt = r => `<option value="${esc(r.uuid)}">${esc(r.name)}${r.who ? ` — ${esc(r.who)}` : ''}</option>`
  return `<label class="god-dlg-field"><span>Кому</span><select name="to">
    ${heroes.length ? `<optgroup label="Герої">${heroes.map(opt).join('')}</optgroup>` : ''}
    ${onScene.length ? `<optgroup label="На сцені">${onScene.map(opt).join('')}</optgroup>` : ''}</select></label>`
}

// ── Предмет ───────────────────────────────────────────────────────────────────
export async function giveItemDialog(item) {
  const from = item?.parent
  if (!(from instanceof Actor) || !item.isOwner) return
  const who = recipientField(from)
  if (!who) return ui.notifications.warn('Немає кому передати: у світі немає інших героїв, а на сцені — інших токенів')
  const qty = Math.max(1, item.system.quantity ?? 1)
  const res = await DialogV2.wait({
    window: { title: `Передати: ${item.name}`, icon: 'fa-solid fa-hand-holding-hand' }, classes: ['god-dialog'], position: { width: 380 }, rejectClose: false,
    content: `<div class="god-give-head"><img src="${esc(item.img)}" alt=""><b>${esc(item.name)}</b>${qty > 1 ? `<small>є ${qty} шт.</small>` : ''}</div>
      ${who}
      ${qty > 1 ? `<label class="god-dlg-field"><span>Скільки</span><input type="number" name="qty" value="${qty}" min="1" max="${qty}"></label>` : ''}
      ${item.system.equipped ? '<p class="god-hint">Предмет одягнений — у отримувача він буде знятим.</p>' : ''}`,
    buttons: [{ action: 'give', label: 'Передати', icon: 'fa-solid fa-hand-holding-hand', default: true,
      callback: (ev, btn) => ({ to: btn.form.elements.to.value, qty: Math.min(qty, Math.max(1, Number(btn.form.elements.qty?.value) || 1)) }) }],
  })
  if (!res || typeof res !== 'object') return
  return send({ kind: 'item', item: item.uuid, to: res.to, qty: res.qty })
}

// ── Гроші ─────────────────────────────────────────────────────────────────────
export async function giveMoneyDialog(actor) {
  const who = recipientField(actor)
  if (!who) return ui.notifications.warn('Немає кому передати')
  const res = await DialogV2.wait({
    window: { title: 'Передати гроші', icon: 'fa-solid fa-coins' }, classes: ['god-dialog', 'god-wallet-dlg'], position: { width: 400 }, rejectClose: false,
    content: `<p class="god-dlg-info">У гаманці: <b>${esc(R.fmtMoney(actor.system.money))}</b>. Якщо потрібних монет немає, решту буде розміняно.</p>${who}${coinInputs()}`,
    buttons: [{ action: 'give', label: 'Передати', icon: 'fa-solid fa-hand-holding-dollar', default: true,
      callback: (ev, btn) => ({ to: btn.form.elements.to.value, amount: readCoins(btn.form) }) }],
  })
  if (!res || typeof res !== 'object' || !R.moneyTotal(res.amount)) return
  if (!R.payMoney(actor.system.money, res.amount)) return ui.notifications.warn(`Не вистачає грошей: є ${R.fmtMoney(actor.system.money)}`)
  return send({ kind: 'money', from: actor.uuid, to: res.to, amount: res.amount })
}

async function send(op) {
  const to = await fromUuid(op.to)
  if (!to) return ui.notifications.warn('Отримувача не знайдено')
  if (to.isOwner) return perform(op, game.user)
  if (!game.users.activeGM) return ui.notifications.warn('Передати чужому персонажу можна, коли майстер онлайн')
  game.socket.emit('system.god', { op: 'give', from: game.user.id, data: op })
  ui.notifications.info('Передаю через майстра…')
}

/** Сама передача. user — хто просив (майстер перевіряє, що той володіє тим, що віддає) */
async function perform(op, user) {
  const to = await fromUuid(op.to)
  if (!to) return
  if (op.kind === 'item') {
    const item = await fromUuid(op.item)
    const from = item?.parent
    if (!item || !(from instanceof Actor) || !from.testUserPermission(user, 'OWNER')) return
    const have = Math.max(1, item.system.quantity ?? 1), n = Math.min(have, Math.max(1, Math.trunc(op.qty) || 1))
    const data = item.toObject()
    delete data._id
    data.system.quantity = n
    if ('equipped' in data.system) data.system.equipped = false
    if (data.system.location === 'belt') data.system.location = 'main'
    await to.createEmbeddedDocuments('Item', [data])   // однакові речі в отримувача складуться в стос
    n >= have ? await item.delete() : await item.update({ 'system.quantity': have - n })
    return card(from, to, `<img src="${esc(item.img)}" alt=""> ${esc(item.name)}${n > 1 ? ` ×${n}` : ''}`)
  }
  if (op.kind === 'money') {
    const from = await fromUuid(op.from)
    if (!from || !from.testUserPermission(user, 'OWNER') || !to.system?.money) return
    const left = R.payMoney(from.system.money, op.amount)
    if (!left) return ui.notifications.warn(`${from.name}: не вистачає грошей`)
    await from.update({ 'system.money': left })
    await to.update({ 'system.money': R.addMoney(to.system.money, op.amount) })
    return card(from, to, `<i class="fa-solid fa-coins"></i> ${esc(R.fmtMoney(op.amount))}`)
  }
}

function card(from, to, what) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: from }),
    content: `<div class="god-card god-give-card"><div class="god-give-row"><b>${esc(from.name)}</b><i class="fa-solid fa-arrow-right"></i><b>${esc(to.name)}</b></div><div class="god-give-what">${what}</div></div>`,
  })
}

export function registerTransfer() {
  game.socket.on('system.god', async msg => {
    if (msg?.op !== 'give' || game.user !== game.users.activeGM) return
    const user = game.users.get(msg.from)
    if (!user) return
    try { await perform(msg.data, user) } catch (err) { console.error('G.O.D. | передача', err) }
  })
}

// ── Гаманець: заплатити, отримати, обміняти, зібрати ──────────────────────────
export async function walletDialog(actor, mode) {
  const money = actor.system.money
  if (mode === 'give') return giveMoneyDialog(actor)
  if (mode === 'consolidate') {
    const next = R.consolidateMoney(money)
    await actor.update({ 'system.money': next })
    return ui.notifications.info(`${actor.name}: монети зібрано — ${R.fmtMoney(next)}`)
  }
  const T = {
    pay: { title: 'Заплатити', icon: 'fa-solid fa-hand-holding-dollar', btn: 'Заплатити',
      info: 'Вкажи ціну в будь-яких монетах — якщо точних немає, решту буде розміняно автоматично.' },
    receive: { title: 'Отримати гроші', icon: 'fa-solid fa-sack-dollar', btn: 'Додати', info: 'Скільки додати до гаманця.' },
    exchange: { title: 'Обміняти монети', icon: 'fa-solid fa-right-left', btn: 'Обміняти', info: 'Курс: 1 платина = 100 золотих, 1 золота = 100 срібних, 1 срібна = 100 мідних.' },
  }[mode]
  if (!T) return
  const opt = sel => COIN_ORDER.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${GOD.MONEY[k].label}</option>`).join('')
  const body = mode === 'exchange'
    ? `<div class="god-xchg"><label class="god-dlg-field"><span>Віддати</span><input type="number" name="n" value="1" min="1"><select name="from">${opt('gold')}</select></label>
       <i class="fa-solid fa-arrow-down"></i><label class="god-dlg-field"><span>Отримати</span><select name="to">${opt('silver')}</select></label></div>`
    : coinInputs()
  const res = await DialogV2.wait({
    window: { title: `${T.title}: ${actor.name}`, icon: T.icon }, classes: ['god-dialog', 'god-wallet-dlg'], position: { width: 400 }, rejectClose: false,
    content: `<p class="god-dlg-info">${T.info}<br>У гаманці: <b>${esc(R.fmtMoney(money))}</b></p>${body}`,
    buttons: [{ action: 'ok', label: T.btn, default: true, callback: (ev, btn) => mode === 'exchange'
      ? { from: btn.form.elements.from.value, to: btn.form.elements.to.value, n: Number(btn.form.elements.n.value) || 0 }
      : readCoins(btn.form) }],
  })
  if (!res || typeof res !== 'object') return
  let next = null
  if (mode === 'pay') {
    if (!R.moneyTotal(res)) return
    next = R.payMoney(money, res)
    if (!next) return ui.notifications.warn(`Не вистачає: потрібно ${R.fmtMoney(res)}, є ${R.fmtMoney(money)}`)
  } else if (mode === 'receive') {
    if (!R.moneyTotal(res)) return
    next = R.addMoney(money, res)
  } else {
    next = R.exchangeMoney(money, res.from, res.to, res.n)
    if (!next) return ui.notifications.warn(res.from === res.to ? 'Обери різні монети' : 'Не вистачає монет для обміну (вгору — лише цілими сотнями)')
  }
  await actor.update({ 'system.money': next })
  ui.notifications.info(`${actor.name}: ${R.fmtMoney(next)}`)
}
