/**
 * Спільне керування смугами ресурсів (лист, панель, швидка панель):
 * кнопки ± (Shift ×10, Ctrl ×100), кнопка урону біля HP і, за потреби, дельта-поле.
 */
import * as R from '../rules.mjs'
import { applyDamagePrompt } from '../api.mjs'

export function bindResourceControls(root, getActor, { delta = false } = {}) {
  root.addEventListener('click', ev => {
    const step = ev.target.closest('[data-res-step]')
    const hit = !step && ev.target.closest('[data-res-damage]')
    if (!step && !hit) return
    ev.preventDefault(); ev.stopPropagation()
    const actor = getActor()
    if (!actor?.isOwner) return
    if (hit) return applyDamagePrompt(actor)
    const key = step.closest('[data-res]')?.dataset.res
    actor.adjustResource(key, Number(step.dataset.resStep) * R.stepSize(ev))
  })
  // Затиснута кнопка не повинна знімати фокус/виділяти текст
  root.addEventListener('mousedown', ev => { if (ev.target.closest('[data-res-step], [data-res-damage]')) ev.preventDefault() })

  if (!delta) return
  root.addEventListener('change', ev => {
    const el = ev.target
    if (!el.dataset?.delta) return
    ev.stopPropagation()
    const actor = getActor()
    if (!actor) return
    const cur = foundry.utils.getProperty(actor, el.dataset.delta)
    const next = R.parseDelta(el.value, cur)
    if (next === null) { el.value = cur; return }
    actor.update({ [el.dataset.delta]: el.dataset.min !== undefined ? Math.max(Number(el.dataset.min), next) : next })
  }, true)
}
