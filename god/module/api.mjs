/**
 * game.god — публічне API системи для макросів і модулів.
 * Макроси в компендіумі — однорядкові виклики цих функцій.
 */
import * as R from './rules.mjs'

const { DialogV2 } = foundry.applications.api

function selectedActors() {
  const actors = [...new Set((canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean))]
  if (!actors.length) ui.notifications.warn('Обери токен(и) на сцені')
  return actors
}

async function ask(title, content, fields) {
  return DialogV2.wait({
    window: { title, icon: 'fa-solid fa-scroll' }, classes: ['god-dialog'], position: { width: 360 },
    content, rejectClose: false,
    buttons: [{
      action: 'ok', label: 'Застосувати', icon: 'fa-solid fa-check', default: true,
      callback: (ev, btn) => Object.fromEntries(fields.map(f => {
        const el = btn.form.elements[f]
        return [f, el.type === 'checkbox' ? el.checked : el.type === 'radio' || el instanceof RadioNodeList ? el.value : Number(el.value) || 0]
      })),
    }],
  })
}

/** Видати досвід обраним токенам (рівень і очки нарахуються автоматично) */
export async function awardXp() {
  const actors = selectedActors().filter(a => a.type === 'character')
  if (!actors.length) return
  const r = await ask('Видати досвід', `<p class="god-dlg-info">Отримають: <b>${actors.map(a => a.name).join(', ')}</b></p>
    <label class="god-dlg-field"><span>Досвід кожному</span><input type="number" name="xp" value="50" autofocus></label>`, ['xp'])
  if (!r?.xp) return
  for (const a of actors) await a.update({ 'system.progress.xp': Math.max(0, a.system.progress.xp + r.xp) })
  ui.notifications.info(`+${r.xp} XP: ${actors.map(a => a.name).join(', ')}`)
}

/** Відновлення броні (v4.5.0): часткове — 50%, повне — 100% PR/MR */
export async function repairArmor() {
  const actors = selectedActors()
  if (!actors.length) return
  const r = await ask('Відновлення броні', `
    <p class="god-dlg-info">Часткове — 1 година, повне — 2 години (і очищення від крові та бруду).</p>
    <div class="god-mode">
      <label><input type="radio" name="pct" value="50" checked><span>Часткове · 50%</span></label>
      <label><input type="radio" name="pct" value="100"><span>Повне · 100%</span></label>
    </div>`, ['pct'])
  if (!r) return
  const pct = Number(r.pct) || 50
  for (const a of actors) {
    const res = a.system.resources
    const fix = k => Math.min(res[k].max, res[k].value + Math.ceil(res[k].max * pct / 100))
    await a.update({ 'system.resources.pr.value': fix('pr'), 'system.resources.mr.value': fix('mr') })
  }
  ui.notifications.info(`Броню відновлено на ${pct}%`)
}

/** Підсумок урону одним рядком: що зняло з MR, PR і HP */
export function damageSummary(name, out) {
  if (!out.total) return `${name}: урону немає`
  if (out.blocked) return `${name}: магічну броню не пробито — ${out.total} урону зникло`
  const parts = [out.toMr && `MR −${out.toMr}`, out.toPr && `PR −${out.toPr}`, out.toHp && `HP −${out.toHp}`].filter(Boolean)
  return `${name}: ${parts.join(', ') || 'без змін'}`
}

/**
 * Завдати урону актору (персонаж чи НІП) за правилами G.O.D.: MR → PR → HP.
 * Не пробив MR — урон зникає. Повертає розклад урону.
 */
export async function dealDamage(actor, amount) {
  const r = actor.system.resources
  const out = R.applyDamage({ hp: r.hp.value, pr: r.pr?.value ?? 0, mr: r.mr?.value ?? 0 }, amount)
  const upd = {}
  if (out.hp !== r.hp.value) upd['system.resources.hp.value'] = out.hp
  if (r.pr && out.pr !== r.pr.value) upd['system.resources.pr.value'] = out.pr
  if (r.mr && out.mr !== r.mr.value) upd['system.resources.mr.value'] = out.mr
  if (Object.keys(upd).length) await actor.update(upd)
  ui.notifications.info(damageSummary(actor.name, out))
  // Наслідки (перевірки калітства/свідомості, непритомність, смерть) рахує хук updateActor у god.mjs —
  // так само для урону з картки, ручної правки HP і будь-якого іншого зменшення
  return out
}

/** Урон вручну: конкретному актору (кнопка біля HP) або обраним токенам */
export async function applyDamagePrompt(target) {
  const actors = target ? [target] : selectedActors()
  if (!actors.length) return
  const r = await ask(target ? `Урон: ${target.name}` : 'Завдати урону', `
    <p class="god-dlg-info">Урон іде послідовно: <b>MR → PR → HP</b>. Якщо він менший за MR — щит не пробито, урону немає.</p>
    <label class="god-dlg-field"><span>Урон</span><input type="number" name="amount" value="0" min="0" autofocus></label>`, ['amount'])
  if (!r?.amount) return
  for (const a of actors) await dealDamage(a, r.amount)
}
