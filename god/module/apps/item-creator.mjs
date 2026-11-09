/**
 * Одне вікно «Новий предмет»: зліва групи, справа плитки категорій, знизу назва/кількість/вага.
 * Створений предмет одразу вибирається в інвентарі — окремий лист предмета не відкривається.
 */
import { GOD, defaultIcon } from '../config.mjs'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const WEAPON_HINT = { fist: 'кастет, рукавиці', light: 'кинджал, кігті', onehand: 'меч, сокира', heavy1h: 'булава, бастард', twohand: 'клеймор, алебарда',
  bow: 'лук, арбалет', throw: 'ножі, дротики', staff: 'посох', wand: 'жезл', codex: 'книга заклинань', trident: 'тризуб', chakram: 'чакрами', amulet: 'оберіг' }

/** Усі варіанти: { key, group, type, system, label, icon, hint, loc } */
function catalog() {
  const out = []
  for (const [k, label] of Object.entries(GOD.WEAPON_CATEGORIES)) {
    const system = { category: k, ...(['twohand', 'bow', 'staff', 'trident'].includes(k) ? { twoHanded: true } : {}) }
    out.push({ key: `weapon:${k}`, group: 'weapon', type: 'weapon', system, label, hint: WEAPON_HINT[k] ?? '', icon: defaultIcon('weapon', system), loc: 'main' })
  }
  for (const [k, label] of Object.entries(GOD.ARMOR_SLOTS)) {
    const system = { slot: k }
    out.push({ key: `armor:${k}`, group: 'armor', type: 'armor', system, label, hint: '', icon: defaultIcon('armor', system), loc: 'main' })
  }
  for (const [k, g] of Object.entries(GOD.GEAR_CATEGORIES)) {
    const system = { category: k, location: g.loc, ...(g.consumable ? { consumable: true } : {}) }
    out.push({ key: `gear:${k}`, group: g.group, type: 'gear', system, label: g.label, hint: GOD.INVENTORY_LOCATIONS[g.loc] ?? '', icon: defaultIcon('gear', system), loc: g.loc })
  }
  return out
}
const GROUPS = () => ({ weapon: { label: 'Зброя', icon: 'fa-khanda' }, armor: { label: 'Обладунок', icon: 'fa-shield-halved' },
  ...Object.fromEntries(Object.entries(GOD.GEAR_GROUPS).map(([k, label]) => [k, { label, icon: {
    general: 'fa-box-open', food: 'fa-drumstick-bite', medicine: 'fa-flask', craft: 'fa-screwdriver-wrench', lore: 'fa-book',
    materials: 'fa-cubes', valuables: 'fa-gem', quest: 'fa-scroll', combat: 'fa-bullseye' }[k] ?? 'fa-box' }])) })

/**
 * @param preset  ключ варіанта ('gear:potion', 'weapon:onehand') або розділ інвентаря (location) для кнопки «+» розділу
 * @returns дані для createEmbeddedDocuments або null
 */
export async function chooseNewItem({ preset = null, location = null } = {}) {
  const all = catalog(), groups = GROUPS()
  const byLoc = location ? all.find(c => c.type === 'gear' && c.system.category === GOD.LOCATION_CATEGORY[location]) : null
  let sel = all.find(c => c.key === preset) ?? byLoc ?? all.find(c => c.key === 'gear:item')
  const tiles = all.map(c => `<button type="button" class="god-nc-tile" data-key="${esc(c.key)}" data-group="${c.group}" data-search="${esc(`${c.label} ${c.hint}`.toLowerCase())}">
      <img src="${esc(c.icon)}" alt=""><span><b>${esc(c.label)}</b>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</span></button>`).join('')
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('')
  const num = (name, label, value = 0, extra = '') => `<label class="god-nc-f"><span>${label}</span><input type="number" name="${name}" value="${value}" ${extra}></label>`
  const RES = { hp: 'HP', mp: 'OM', ed: 'ED', mt: 'MT', pr: 'PR', mr: 'MR' }
  const content = `
    <div class="god-nc">
      <nav class="god-nc-nav">${Object.entries(groups).map(([k, g]) => `<a data-group="${k}"><i class="fa-solid ${g.icon}"></i><span>${esc(g.label)}</span></a>`).join('')}</nav>
      <div class="god-nc-main">
        <div class="god-nc-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Пошук: зілля, меч, ключ…" autocomplete="off"></div>
        <div class="god-nc-tiles">${tiles}<p class="god-empty god-nc-none" hidden>Нічого не знайдено.</p></div>
      </div>
    </div>
    <section class="god-nc-form">
      <div class="god-nc-row god-nc-top">
        <img class="god-nc-icon" src="" alt="">
        <label class="god-nc-f god-nc-name"><span>Назва</span><input type="text" name="name" required></label>
        ${num('qty', 'К-сть', 1, 'min="1"')}
        ${num('weight', 'Вага, кг', 0, 'min="0" step="0.01"')}
      </div>
      <div class="god-nc-row" data-show="weapon">
        ${num('phys', 'Фіз. урон')}${num('mag', 'Маг. урон')}${num('range', 'Радіус', 1, 'min="0"')}
        <label class="god-nc-f"><span>Рука</span><select name="hand">${opt({ main: 'Основна (+СИЛ×5)', off: 'Друга' }, 'main')}</select></label>
        <label class="god-nc-chk"><input type="checkbox" name="twoHanded"><span>Дворучна</span></label>
      </div>
      <div class="god-nc-row" data-show="armor">
        <label class="god-nc-f"><span>Клас</span><select name="armorClass">${opt(GOD.ARMOR_CLASSES, 'light')}</select></label>
        ${num('aphys', 'Фіз. захист (PR)')}${num('amag', 'Маг. захист (MR)')}
        <label class="god-nc-chk" data-tooltip="Тяжкий −1 ШУ замість −2, середній без штрафу ШУ"><input type="checkbox" name="fitted"><span>Підігнаний</span></label>
      </div>
      <div class="god-nc-row" data-show="shield"><label class="god-nc-f"><span>Тип щита</span><select name="shieldSize">${opt(GOD.SHIELD_SIZES, 'small')}</select></label></div>
      <div class="god-nc-row" data-show="belt">${num('beltSlots', 'Слотів пояса', 2, 'min="0"')}</div>
      <div class="god-nc-row" data-show="bag">${num('bagBonus', '+ до макс. ваги, кг', 10, 'min="0" step="0.1"')}</div>
      <div class="god-nc-row" data-show="gear">
        <label class="god-nc-chk" data-tooltip="«Використати» застосує відновлення і спише 1 шт"><input type="checkbox" name="consumable"><span>Розхідне</span></label>
        <div class="god-nc-restore" data-show="consumable">${Object.entries(RES).map(([k, l]) => num(`r_${k}`, `${l} ±`)).join('')}</div>
      </div>
      <div class="god-nc-row">
        <div class="god-nc-price"><span>Ціна</span>${Object.entries(GOD.MONEY).map(([k, m]) => `<label data-tooltip="${esc(m.label)}"><input type="number" name="p_${k}" value="0" min="0"><small>${esc(m.abbr)}</small></label>`).join('')}</div>
        <label class="god-nc-chk"><input type="checkbox" name="isMagic"><span>Магічний</span></label>
      </div>
      <label class="god-nc-f god-nc-desc"><span>Опис</span><textarea name="desc" rows="2" placeholder="Необов'язково: що це, звідки, особливості"></textarea></label>
    </section>`
  const bind = root => {
    const tilesEl = root.querySelector('.god-nc-tiles'), search = root.querySelector('.god-nc-search input')
    const sync = () => {
      const f = root.querySelector('.god-nc-form'), slot = sel.system.slot
      const on = { weapon: sel.type === 'weapon', armor: sel.type === 'armor', gear: sel.type === 'gear',
        shield: slot === 'Щит', belt: slot === 'Пояс', bag: slot === 'Рюкзак', consumable: f.querySelector('[name="consumable"]').checked }
      for (const el of f.querySelectorAll('[data-show]')) el.hidden = !on[el.dataset.show]
    }
    root.querySelector('[name="consumable"]').addEventListener('change', sync)
    const name = root.querySelector('[name="name"]'), icon = root.querySelector('.god-nc-icon')
    let named = false
    const pick = key => {
      sel = all.find(c => c.key === key) ?? sel
      for (const t of tilesEl.querySelectorAll('.god-nc-tile')) t.classList.toggle('active', t.dataset.key === sel.key)
      icon.src = sel.icon
      if (!named) name.value = sel.type === 'gear' && sel.system.category === 'item' ? 'Новий предмет' : sel.label
      const f = root.querySelector('.god-nc-form')
      if (sel.type === 'gear') f.querySelector('[name="consumable"]').checked = !!sel.system.consumable
      if (sel.type === 'weapon') f.querySelector('[name="twoHanded"]').checked = !!sel.system.twoHanded
      if (sel.type === 'armor') f.querySelector('[name="armorClass"]').value = ['Кираса', 'Поножі', 'Шолом', 'Рукавиці', 'Чоботи'].includes(sel.system.slot) ? 'light' : 'none'
      sync()
    }
    const showGroup = g => {
      search.value = ''
      for (const a of root.querySelectorAll('.god-nc-nav a')) a.classList.toggle('active', a.dataset.group === g)
      for (const t of tilesEl.querySelectorAll('.god-nc-tile')) t.hidden = t.dataset.group !== g
      root.querySelector('.god-nc-none').hidden = true
    }
    root.querySelector('.god-nc-nav').addEventListener('click', ev => { const a = ev.target.closest('a[data-group]'); if (a) showGroup(a.dataset.group) })
    tilesEl.addEventListener('click', ev => { const t = ev.target.closest('.god-nc-tile'); if (t) pick(t.dataset.key) })
    tilesEl.addEventListener('dblclick', ev => { if (ev.target.closest('.god-nc-tile')) root.querySelector('button[data-action="create"]')?.click() })
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase()
      if (!q) return showGroup(sel.group)
      for (const a of root.querySelectorAll('.god-nc-nav a')) a.classList.remove('active')
      let n = 0
      for (const t of tilesEl.querySelectorAll('.god-nc-tile')) { t.hidden = !t.dataset.search.includes(q); if (!t.hidden) n++ }
      root.querySelector('.god-nc-none').hidden = n > 0
    })
    name.addEventListener('input', () => { named = !!name.value.trim() })
    showGroup(sel.group); pick(sel.key)
    setTimeout(() => search.focus(), 30)
  }
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Новий предмет', icon: 'fa-solid fa-plus' },
    classes: ['god-dialog', 'god-nc-dialog'], position: { width: Math.min(700, window.innerWidth - 40) }, rejectClose: false, content,
    render: (event, dialog) => bind(dialog?.element ?? event?.target?.element ?? dialog),
    buttons: [{ action: 'create', label: 'Створити', icon: 'fa-solid fa-check', default: true, callback: (ev, btn) => {
      const f = btn.form.elements, n = k => Number(f[k]?.value) || 0
      return {
        name: f.name.value.trim(), qty: Math.max(1, n('qty') || 1), weight: Math.max(0, n('weight')), desc: f.desc.value.trim(),
        price: Object.fromEntries(Object.keys(GOD.MONEY).map(k => [k, Math.max(0, n(`p_${k}`))])), isMagic: f.isMagic.checked,
        weapon: { phys: n('phys'), mag: n('mag'), range: Math.max(0, n('range')), hand: f.hand.value, twoHanded: f.twoHanded.checked },
        armor: { armorClass: f.armorClass.value, phys: n('aphys'), mag: n('amag'), fitted: f.fitted.checked, shieldSize: f.shieldSize.value,
          beltSlots: Math.max(0, n('beltSlots')), bagBonus: Math.max(0, n('bagBonus')) },
        gear: { consumable: f.consumable.checked, restore: Object.fromEntries(['hp', 'mp', 'ed', 'mt', 'pr', 'mr'].map(k => [k, n(`r_${k}`)])) },
      }
    } }],
  })
  if (!res || typeof res !== 'object' || !sel) return null
  const system = { ...sel.system, quantity: res.qty, weight: res.weight, price: res.price, isMagic: res.isMagic }
  if (res.desc) system.description = `<p>${esc(res.desc).replace(/\n/g, '<br>')}</p>`
  if (sel.type === 'weapon') Object.assign(system, res.weapon)
  if (sel.type === 'armor') {
    const a = res.armor
    Object.assign(system, { armorClass: a.armorClass, phys: a.phys, mag: a.mag, fitted: a.fitted })
    if (sel.system.slot === 'Щит') system.shieldSize = a.shieldSize
    if (sel.system.slot === 'Пояс') system.beltSlots = a.beltSlots
    if (sel.system.slot === 'Рюкзак') system.bagBonus = a.bagBonus
  }
  if (sel.type === 'gear') { system.consumable = res.gear.consumable; if (res.gear.consumable) system.restore = res.gear.restore }
  if (location && sel.type === 'gear') system.location = location
  return { name: res.name || sel.label, type: sel.type, img: sel.icon, system }
}
