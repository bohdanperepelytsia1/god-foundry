/**
 * Вибір предмета з інвентаря одним кліком (як «Одягнути» на сайті): у руку, на пояс, у слот обладунку.
 * Повертає id обраного предмета або null.
 */
export async function pickItem(title, items, { empty = 'Немає відповідних речей в інвентарі', sub = () => '' } = {}) {
  if (!items.length) { ui.notifications.warn(empty); return null }
  const esc = foundry.utils.escapeHTML
  let picked = null
  const rows = items.map(i => `<button type="button" class="god-pick-row" data-pick="${i.id}" data-search="${esc(i.name.toLowerCase())}">
      <img src="${esc(i.img)}" alt=""><span><b>${esc(i.name)}</b>${sub(i) ? `<small>${esc(sub(i))}</small>` : ''}</span></button>`).join('')
  await foundry.applications.api.DialogV2.wait({
    window: { title, icon: 'fa-solid fa-hand' }, classes: ['god-dialog', 'god-pick-dlg'], position: { width: 380 }, rejectClose: false,
    content: `${items.length > 6 ? '<input type="search" class="god-pick-search" placeholder="Знайти…" autofocus>' : ''}<div class="god-pick-list">${rows}</div>`,
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target?.element
      root?.querySelector('.god-pick-search')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase()
        for (const r of root.querySelectorAll('.god-pick-row')) r.hidden = !!q && !r.dataset.search.includes(q)
      })
      for (const b of root?.querySelectorAll('[data-pick]') ?? []) b.addEventListener('click', () => { picked = b.dataset.pick; dialog.close() })
    },
    buttons: [{ action: 'cancel', label: 'Скасувати' }],
  })
  return picked
}
