/**
 * Нове заклинання чи здібність — одним коротким вікном: назва, головні числа, опис.
 * «Створити» одразу додає на лист; повний лист предмета відкривати не треба
 * (за потреби — кнопка «Створити й відкрити»).
 */
import { GOD, defaultIcon } from '../config.mjs'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('')
const num = (name, label, value, attrs = '', tip = '') =>
  `<label class="god-sc-f" ${tip ? `data-tooltip="${esc(tip)}"` : ''}><span>${label}</span><input type="number" name="${name}" value="${value}" ${attrs}></label>`
/** Текст з textarea → абзаци HTML */
export const textToHtml = t => String(t ?? '').trim().split(/\n{2,}/).filter(Boolean)
  .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')

/**
 * @param type   'spell' | 'ability'
 * @param isNpc  ворогу не потрібна школа для володіння — лише підказка інша
 * @returns { data, open } або null
 */
export async function quickSpell(type, { isNpc = false } = {}) {
  const spell = type === 'spell'
  const DK = { mag: 'Магічний', phys: 'Фізичний', none: 'Без урону' }
  const body = spell ? `
    <div class="god-sc-grid">
      <label class="god-sc-f"><span>Школа</span><select name="school">${opt(GOD.SPELL_SCHOOLS, 'fire')}</select></label>
      ${num('level', 'Рівень', 1, 'min="1" max="10"', isNpc ? 'У ворога рівень заклинання = його володіння (кістка сотворення)' : 'Рівень заклинання')}
      ${num('threshold', 'ПППС', 6, 'min="1" max="20"', 'Поріг проходження перевірки сотворення: хоча б один куб має бути ≥')}
      ${num('manaCost', 'Мана, OM', 0, 'min="0"')}
      ${num('staminaCost', 'Витрив., ВС', 0, 'min="0"')}
      <label class="god-sc-f"><span>Як діє</span><select name="attackType">${opt(GOD.ATTACK_TYPES, 'target')}</select></label>
      ${num('baseDamage', 'Урон / сила', 0, 'min="0"', 'Базовий урон; множиться на володіння школою')}
      <label class="god-sc-f"><span>Тип урону</span><select name="damageKind">${opt(DK, 'mag')}</select></label>
      <label class="god-sc-f"><span>Час (OD)</span><input type="text" name="castTime" placeholder="1 ПХ"></label>
      <label class="god-sc-f"><span>Кулдаун</span><input type="text" name="cooldown" placeholder="3 раунди"></label>
      ${num('castRange', 'Радіус касту', 0, 'min="0"')}
      ${num('areaRadius', 'Радіус дії', 0, 'min="0"')}
    </div>` : `
    <div class="god-sc-grid">
      ${num('manaCost', 'Мана, OM', 0, 'min="0"')}
      ${num('staminaCost', 'Витрив., ВС', 0, 'min="0"')}
      <label class="god-sc-f"><span>Кулдаун</span><input type="text" name="cooldown" placeholder="5 раундів"></label>
    </div>`
  const content = `
    <div class="god-sc">
      <label class="god-sc-f god-sc-name"><span>Назва</span><input type="text" name="name" autofocus placeholder="${spell ? 'Вогняна куля' : 'Ривок'}"></label>
      ${body}
      <label class="god-sc-f god-sc-desc"><span>Опис</span><textarea name="description" rows="4" placeholder="Що робить, на кого діє, особливі умови…"></textarea></label>
      ${spell ? '<label class="god-sc-f god-sc-desc"><span>Покращення (2–5 рівні), за бажанням</span><textarea name="upgrades" rows="2"></textarea></label>' : ''}
    </div>`
  const read = (btn, open) => {
    const el = btn.form.elements
    const name = el.name.value.trim() || (spell ? 'Нове заклинання' : 'Нова здібність')
    const n = k => Number(el[k]?.value) || 0
    const system = { description: textToHtml(el.description.value), manaCost: n('manaCost'), staminaCost: n('staminaCost'), cooldown: el.cooldown.value.trim() }
    if (spell) Object.assign(system, {
      school: el.school.value, level: Math.min(10, Math.max(1, n('level') || 1)), threshold: Math.min(20, Math.max(1, n('threshold') || 6)),
      attackType: el.attackType.value, baseDamage: n('baseDamage'), damageKind: el.damageKind.value, castTime: el.castTime.value.trim(),
      castRange: n('castRange'), areaRadius: n('areaRadius'), upgrades: textToHtml(el.upgrades.value),
    })
    return { data: { name, type, img: defaultIcon(type, system), system }, open }
  }
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: spell ? 'Нове заклинання' : 'Нова здібність', icon: spell ? 'fa-solid fa-wand-sparkles' : 'fa-solid fa-hand-sparkles' },
    classes: ['god-dialog', 'god-sc-dialog'], position: { width: 460 }, rejectClose: false, content,
    buttons: [
      { action: 'open', label: 'Створити й відкрити', icon: 'fa-solid fa-up-right-from-square', callback: (ev, btn) => read(btn, true) },
      { action: 'create', label: 'Створити', icon: 'fa-solid fa-check', default: true, callback: (ev, btn) => read(btn, false) },
    ],
  })
  return res && typeof res === 'object' ? res : null
}
