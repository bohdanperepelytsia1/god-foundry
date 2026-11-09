/**
 * Зручне створення й редагування активних ефектів: шаблони з правил (травми, втома, алкоголь…),
 * зрозумілі назви полів замість ключів, тривалість у раундах. Розширене — стандартний лист ефекту.
 */
import { GOD } from '../config.mjs'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const ICON = k => `systems/god/assets/icons/status/${k}.svg`
const ADD = 2

/** Що може змінювати ефект — групи для списку */
export const EFFECT_TARGETS = {
  'Бій': {
    'system.combat.allMod': 'Усі дії (МОД)', 'system.combat.hitMod': 'Попадання', 'system.combat.damageMod': 'Урон',
    'system.combat.dodgeBonus': 'ШУ',
  },
  'Максимум ресурсів': Object.fromEntries(Object.entries(GOD.RESOURCES).map(([k, r]) => [`system.resources.${k}.bonus`, `Макс. ${r.abbr}`])),
  'Характеристики': Object.fromEntries(Object.entries(GOD.STATS).map(([k, s]) => [`system.stats.${k}.value`, s.label])),
}
export const TARGET_LABEL = Object.assign({}, ...Object.values(EFFECT_TARGETS))
export const changeLabel = key => TARGET_LABEL[key] ?? key.replace('system.', '')

const C = (key, value) => ({ key, value })
/** Шаблони з Player manual («Ефекти і відпочинок») */
export const EFFECT_PRESETS = {
  'Втома': {
    tired1: { name: 'Легка втома', img: ICON('fatigued'), changes: [C('system.combat.allMod', -1)] },
    tired2: { name: 'Середня втома', img: ICON('fatigued'), changes: [C('system.combat.allMod', -2)] },
    tired3: { name: 'Тяжка втома', img: ICON('fatigued'), changes: [C('system.combat.allMod', -3)] },
  },
  'Травми й калітства': {
    armT: { name: 'Травма руки', img: ICON('restrained'), changes: [], desc: 'Дії цією рукою та предметами в ній — з недоліком.' },
    legT: { name: 'Травма ноги', img: ICON('restrained'), changes: [], desc: 'Акробатика, атлетика й біг — з недоліком; швидкість удвічі менша. Обидві ноги — пересуватись неможливо.' },
    headT: { name: 'Травма голови', img: ICON('stunned'), changes: [], desc: 'ШУ удвічі менше; уважність і попадання — з недоліком (кожна спроба — шанс на БМП).' },
    bodyT: { name: 'Травма тулуба (ЖВО)', img: ICON('bleeding'), changes: [], desc: 'Не заснути від болю; −50 HP щогодини; d20 від Тілобудови ≤ 12 — блювота після їжі, води, зілля.' },
    maim1: { name: 'Легкі калітства', img: ICON('bleeding'), changes: [C('system.combat.allMod', -2)], desc: 'Кожні 24 год 1d4 — 50% шанс погіршення.' },
    maim2: { name: 'Середні калітства', img: ICON('bleeding'), changes: [C('system.combat.allMod', -3)], desc: 'd20, успіх 16+, інакше БМП. Кожні 12 год 1d4 — 50% шанс погіршення.' },
    maim3: { name: 'Тяжкі калітства', img: ICON('bleeding'), changes: [C('system.combat.allMod', -5)], desc: 'БМП.' },
  },
  'Кровотеча': {
    bleed1: { name: 'Слабка кровотеча', img: ICON('bleeding'), changes: [], desc: '−10 HP щохвилини.' },
    bleed2: { name: 'Середня кровотеча', img: ICON('bleeding'), changes: [], desc: '−50 HP щохвилини.' },
    bleed3: { name: 'Сильна кровотеча', img: ICON('bleeding'), changes: [], desc: '−10 HP кожен ПХ (200 HP/хв).' },
  },
  'Алкоголь': {
    drunk1: { name: 'Легке сп\'яніння', img: ICON('poisoned'), changes: [C('system.combat.damageMod', 1)], desc: 'МОД −1: нейтральні, наука, поза законом; МОД +1: соціальні; фіз. урон +1.' },
    drunk2: { name: 'Середнє сп\'яніння', img: ICON('poisoned'), changes: [], desc: 'МОД −2: бойові, нейтральні, наука, поза законом; МОД +1: соціальні й магічні (вже вивчені).' },
    drunk3: { name: 'Тяжке сп\'яніння', img: ICON('poisoned'), changes: [C('system.combat.allMod', -3)], desc: 'Кожні 20 хв 1d20 від Алкоголю (12+), інакше засинає.' },
  },
  'Голод, вода, виснага': {
    hunger: { name: 'Тяжкий голод', img: ICON('fatigued'), changes: [C('system.combat.allMod', -3)], desc: 'Не заснути; скритність і маскування — з недоліком або МОД −2.' },
    thirst: { name: 'Тяжке зневоднення', img: ICON('fatigued'), changes: [C('system.combat.allMod', -3)], desc: 'Не заснути й не поїсти; не відчуває запахів і смаку.' },
    exhaust: { name: 'Тяжка виснага', img: ICON('fatigued'), changes: [C('system.combat.allMod', -1)], desc: 'БМП. −5 MT і шанс −10; кожні 4 год шанс −5 MT; кожні 20 хв Тілобудова 13+, щоб не заснути.' },
  },
  'Холод і жара': {
    cold1: { name: 'Переохолодження', img: ICON('frozen'), changes: [C('system.combat.allMod', -1)], desc: 'Дрібна моторика з недоліком, втома.' },
    cold2: { name: 'Обмороження', img: ICON('frozen'), changes: [C('system.combat.allMod', -2)], desc: 'БМП; дрібна моторика з потрійним недоліком; −50 HP кожні 10 хв.' },
    heat: { name: 'Пекло', img: ICON('burning'), changes: [C('system.combat.allMod', -2)], desc: 'БМП; удвічі більше води; −100 HP блокується; HP < 100 — втрата свідомості.' },
  },
  'Освітлення': {
    dark: { name: 'Темно', img: ICON('blind'), changes: [C('system.combat.hitMod', -2)], desc: 'Уважність і пошук МОД −5.' },
    gloom: { name: 'Морок', img: ICON('blind'), changes: [C('system.combat.hitMod', -5)], desc: 'Уважність і пошук МОД −10.' },
  },
}
const PRESET_INDEX = Object.assign({}, ...Object.values(EFFECT_PRESETS))
const QUICK_ICONS = ['fatigued', 'bleeding', 'poisoned', 'burning', 'frozen', 'stunned', 'blind', 'frightened', 'blessed', 'cursed', 'restrained', 'invisible']

const targetOptions = sel => Object.entries(EFFECT_TARGETS).map(([g, o]) =>
  `<optgroup label="${esc(g)}">${Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')
  + (sel && !TARGET_LABEL[sel] ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : '')
const changeRow = (c = {}) => `
  <div class="god-eff-change">
    <select name="key">${targetOptions(c.key ?? 'system.combat.allMod')}</select>
    <input type="text" name="value" value="${esc(c.value ?? '-1')}" placeholder="+2 / -1">
    <a class="god-eff-del" data-tooltip="Прибрати"><i class="fa-solid fa-xmark"></i></a>
  </div>`

/**
 * Створити (effect = null) або змінити ефект актора.
 */
export async function editEffect(actor, effect = null) {
  const cur = effect ? {
    name: effect.name, img: effect.img, changes: effect.changes.map(c => ({ key: c.key, value: c.value })),
    rounds: effect.duration?.rounds || 0, desc: effect.description ?? '',
  } : { name: '', img: ICON('blessed'), changes: [], rounds: 0, desc: '' }
  const content = `
    ${effect ? '' : `<label class="god-dlg-field"><span>Шаблон з правил</span><select name="preset"><option value="">— свій ефект —</option>
      ${Object.entries(EFFECT_PRESETS).map(([g, o]) => `<optgroup label="${esc(g)}">${Object.entries(o).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}
    </select></label>`}
    <div class="god-eff-head">
      <a class="god-eff-img" data-tooltip="Своя іконка"><img src="${esc(cur.img)}" alt=""></a>
      <input type="text" name="name" value="${esc(cur.name)}" placeholder="Назва ефекту" required>
    </div>
    <div class="god-eff-icons">${QUICK_ICONS.map(k => `<a data-icon="${ICON(k)}"><img src="${ICON(k)}" alt=""></a>`).join('')}</div>
    <div class="god-eff-sec"><span>Зміни</span><a class="god-eff-add"><i class="fa-solid fa-plus"></i> Додати</a></div>
    <div class="god-eff-changes">${cur.changes.map(changeRow).join('')}</div>
    <p class="god-hint god-eff-empty" ${cur.changes.length ? 'hidden' : ''}>Без чисел — лише нагадування на листі (опис нижче).</p>
    <label class="god-dlg-field"><span>Тривалість, раундів</span><input type="number" name="rounds" min="0" value="${cur.rounds}" data-tooltip="0 — поки не знімуть"></label>
    <label class="god-dlg-field god-eff-desc"><span>Опис</span><textarea name="desc" rows="2" placeholder="Що робить ефект — видно в підказці">${esc(cur.desc)}</textarea></label>`
  const bind = root => {
    const box = root.querySelector('.god-eff-changes'), empty = root.querySelector('.god-eff-empty')
    const img = root.querySelector('.god-eff-img img')
    const sync = () => { empty.hidden = !!box.children.length }
    root.querySelector('.god-eff-add').addEventListener('click', () => { box.insertAdjacentHTML('beforeend', changeRow()); sync() })
    box.addEventListener('click', ev => { if (ev.target.closest('.god-eff-del')) { ev.target.closest('.god-eff-change').remove(); sync() } })
    for (const a of root.querySelectorAll('[data-icon]')) a.addEventListener('click', () => { img.src = a.dataset.icon })
    root.querySelector('.god-eff-img').addEventListener('click', () => {
      const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker
      new FP({ type: 'image', current: img.getAttribute('src'), callback: p => { img.src = p } }).browse()
    })
    root.querySelector('[name="preset"]')?.addEventListener('change', ev => {
      const p = PRESET_INDEX[ev.target.value]
      if (!p) return
      root.querySelector('[name="name"]').value = p.name
      img.src = p.img
      box.innerHTML = p.changes.map(changeRow).join('')
      root.querySelector('[name="desc"]').value = p.desc ?? ''
      sync()
    })
  }
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: effect ? `Ефект: ${effect.name}` : 'Новий ефект', icon: 'fa-solid fa-bolt' },
    classes: ['god-dialog', 'god-eff-dialog'], position: { width: 420 }, rejectClose: false, content,
    render: (event, dialog) => bind(dialog?.element ?? event?.target?.element ?? dialog),
    buttons: [
      ...(effect ? [{ action: 'advanced', label: 'Розширено', icon: 'fa-solid fa-sliders' }] : []),
      { action: 'save', label: effect ? 'Зберегти' : 'Додати', icon: 'fa-solid fa-check', default: true, callback: (ev, btn) => {
        const f = btn.form
        return {
          name: f.elements.name.value.trim() || 'Ефект', img: f.querySelector('.god-eff-img img').getAttribute('src'),
          rounds: Math.max(0, Number(f.elements.rounds.value) || 0), desc: f.elements.desc.value.trim(),
          changes: [...f.querySelectorAll('.god-eff-change')].map(r => ({ key: r.querySelector('[name="key"]').value, value: r.querySelector('[name="value"]').value.trim().replace(/^\+/, '') }))
            .filter(c => c.key && c.value !== '' && !Number.isNaN(Number(c.value))).map(c => ({ ...c, mode: ADD })),
        }
      } },
    ],
  })
  if (res === 'advanced') return effect.sheet.render(true)
  if (!res || typeof res !== 'object') return
  const data = {
    name: res.name, img: res.img, changes: res.changes, description: res.desc,
    duration: res.rounds ? { rounds: res.rounds, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0, combat: game.combat?.id ?? null } : { rounds: null },
  }
  if (effect) return effect.update(data)
  return actor.createEmbeddedDocuments('ActiveEffect', [data])
}

/** Підписи змін для листа: «ШУ +2», окремо — плюс чи мінус */
export const changeChips = effect => effect.changes.map(c => {
  const n = Number(c.value)
  const sign = Number.isNaN(n) ? '' : n >= 0 ? '+' : ''
  return { label: changeLabel(c.key), value: `${sign}${c.value}`, cls: Number.isNaN(n) ? '' : n >= 0 ? 'up' : 'down' }
})
