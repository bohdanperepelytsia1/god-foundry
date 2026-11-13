/**
 * Нагорода за партію (майстер): кожному героєві окремо — досвід, крити, вдача.
 * Рядок «Усім» заповнює всіх одразу; далі можна підправити окремих.
 * Рівень і очки вмінь/характеристик за новий рівень нараховуються самі (як при будь-якій зміні XP).
 */
import * as R from '../rules.mjs'
import { GOD } from '../config.mjs'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const FIELDS = [['xp', 'XP'], ['crits', 'Крити'], ['luck', 'Вдача']]

/** Застосувати нагороду до одного героя: повертає рядок для звіту (чиста логіка — для тестів) */
export function rewardUpdate(sys, add) {
  const xp = Math.max(0, (Number(sys.progress?.xp) || 0) + (Number(add.xp) || 0))
  const clamp = (k, v) => Math.max(0, Math.min(GOD.REPUTATION[k]?.max ?? Infinity, v))
  const crits = clamp('crits', (Number(sys.reputation?.crits) || 0) + (Number(add.crits) || 0))
  const luck = clamp('luck', (Number(sys.reputation?.luck) || 0) + (Number(add.luck) || 0))
  const before = R.levelFromXp(sys.progress?.xp), after = R.levelFromXp(xp)
  return {
    update: { 'system.progress.xp': xp, 'system.reputation.crits': crits, 'system.reputation.luck': luck },
    levels: after - before, level: after,
    capped: { crits: crits !== (Number(sys.reputation?.crits) || 0) + (Number(add.crits) || 0), luck: luck !== (Number(sys.reputation?.luck) || 0) + (Number(add.luck) || 0) },
  }
}

export async function rewardDialog() {
  if (!game.user.isGM) return ui.notifications.warn('Нагороду видає майстер')
  const heroes = game.actors.filter(a => a.type === 'character')
  if (!heroes.length) return ui.notifications.warn('У світі немає героїв')
  const withPlayer = a => game.users.some(u => !u.isGM && a.testUserPermission(u, 'OWNER'))
  const rows = heroes.sort((a, b) => (withPlayer(b) - withPlayer(a)) || a.name.localeCompare(b.name, 'uk')).map(a => `
    <tr data-actor="${a.id}">
      <td><label class="god-rw-who"><input type="checkbox" name="on-${a.id}" ${withPlayer(a) ? 'checked' : ''}><img src="${esc(a.img)}" alt=""><span>${esc(a.name)}<small>рів. ${R.levelFromXp(a.system.progress.xp)} · ${a.system.progress.xp} XP · крити ${a.system.reputation.crits} · вдача ${a.system.reputation.luck}</small></span></label></td>
      ${FIELDS.map(([k]) => `<td><input type="number" name="${k}-${a.id}" value="0" step="1"></td>`).join('')}
    </tr>`).join('')
  const content = `
    <p class="god-dlg-info">Кожному — своє. Рядок «Усім» підставляє однакове значення відміченим героям; можна і мінус. Крити не більше ${GOD.REPUTATION.crits.max}, вдача не більше ${GOD.REPUTATION.luck.max}.</p>
    <table class="god-rw">
      <thead><tr><th></th>${FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
      <tbody>
        <tr class="god-rw-all"><td><b>Усім відміченим</b></td>${FIELDS.map(([k]) => `<td><input type="number" data-all="${k}" value="" placeholder="—" step="1"></td>`).join('')}</tr>
        ${rows}
      </tbody>
    </table>
    <label class="god-dlg-check"><input type="checkbox" name="announce" checked><span>Повідомити в чат</span></label>`
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Нагорода за партію', icon: 'fa-solid fa-trophy' }, classes: ['god-dialog', 'god-rw-dialog'], position: { width: 600 }, rejectClose: false, content,
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target?.element
      root?.querySelectorAll('[data-all]').forEach(inp => inp.addEventListener('input', () => {
        for (const tr of root.querySelectorAll('tr[data-actor]')) {
          if (!tr.querySelector('input[type=checkbox]').checked) continue
          tr.querySelector(`input[name="${inp.dataset.all}-${tr.dataset.actor}"]`).value = inp.value || 0
        }
      }))
    },
    buttons: [{ action: 'ok', label: 'Видати', icon: 'fa-solid fa-trophy', default: true, callback: (e, btn) => {
      const el = btn.form.elements
      return {
        announce: el.announce.checked,
        list: heroes.filter(a => el[`on-${a.id}`]?.checked).map(a => ({ actor: a, add: Object.fromEntries(FIELDS.map(([k]) => [k, Math.trunc(Number(el[`${k}-${a.id}`]?.value) || 0)])) }))
          .filter(x => x.add.xp || x.add.crits || x.add.luck),
      }
    } }],
  })
  if (!res || typeof res !== 'object' || !res.list?.length) return
  const lines = []
  for (const { actor, add } of res.list) {
    const r = rewardUpdate(actor.system, add)
    await actor.update(r.update)
    const parts = [add.xp && `${add.xp > 0 ? '+' : ''}${add.xp} XP`, add.crits && `${add.crits > 0 ? '+' : ''}${add.crits} крит.`, add.luck && `${add.luck > 0 ? '+' : ''}${add.luck} вдачі`].filter(Boolean)
    lines.push(`<li><b>${esc(actor.name)}</b>: ${parts.join(', ')}${r.levels > 0 ? ` — <span class="god-rw-up">рівень ${r.level}!</span>` : ''}${r.capped.crits || r.capped.luck ? ' <small>(обмежено максимумом)</small>' : ''}</li>`)
  }
  if (res.announce) await ChatMessage.create({ speaker: { alias: 'G.O.D.' },
    content: `<div class="god-card god-rw-card"><header class="god-card-head"><div><h3><i class="fa-solid fa-trophy"></i> Нагорода за партію</h3></div></header><ul>${lines.join('')}</ul></div>` })
  ui.notifications.info(`Нагороду видано: ${res.list.length}`)
}

export function registerReward() {
  Hooks.on('renderActorDirectory', (app, html) => {
    if (!game.user.isGM) return
    const root = html instanceof HTMLElement ? html : html?.[0]
    const footer = root?.querySelector('.directory-footer') ?? root?.querySelector('footer')
    if (!footer || footer.querySelector('.god-reward-btn')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'god-reward-btn'
    btn.innerHTML = '<i class="fa-solid fa-trophy"></i> Нагорода за партію'
    btn.addEventListener('click', () => rewardDialog())
    footer.prepend(btn)
  })
}
