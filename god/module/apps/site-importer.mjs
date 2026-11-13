/**
 * Імпорт із сайту G.O.D.: файл від tools/site-export.py → актори й предмети Foundry.
 * Майстер обирає, що перенести (персонажі, вороги, предмети майстра, склади, торговці),
 * і кому з гравців віддати персонажа. Повторний імпорт оновлює вже перенесених (той самий id,
 * тож токени на сценах лишаються прив'язаними) або пропускає їх.
 */
import { characterFromSite, npcFromSite, itemFromSite, wagonFromSite, summarizeExport } from '../site-import.mjs'
import { importWagons, allWagons } from '../wagons.mjs'
import { isSqlite, exportFromSqliteBytes } from '../site-db.mjs'

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api
const esc = s => foundry.utils.escapeHTML?.(String(s ?? '')) ?? String(s ?? '')

export class GodSiteImporter extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'god-site-importer',
    classes: ['god', 'god-importer'],
    window: { title: 'Імпорт із сайту G.O.D.', icon: 'fa-solid fa-file-import', resizable: true },
    position: { width: 560, height: 'auto' },
    actions: { run: GodSiteImporter.#run, reset: GodSiteImporter.#reset, toggleAll: GodSiteImporter.#toggleAll },
  }
  static PARTS = { body: { template: 'systems/god/templates/apps/site-importer.hbs', scrollable: ['.god-imp-lists'] } }

  data = null
  busy = false
  progress = ''

  async _prepareContext() {
    if (!this.data) return { step: 'file' }
    const s = summarizeExport(this.data)
    const users = game.users.filter(u => !u.isGM).map(u => ({ id: u.id, name: u.name }))
    // гравець з ім'ям персонажа (або навпаки) — підставляємо як власника
    const guess = name => users.find(u => name.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(name.toLowerCase()))?.id ?? ''
    const already = new Set(game.actors.map(a => a.getFlag('god', 'siteId')).filter(Boolean))
    const wagonIds = new Set(allWagons().map(w => w.siteId).filter(Boolean))
    return {
      step: 'pick', busy: this.busy, progress: this.progress, users,
      exportedAt: this.data.exportedAt ? new Date(this.data.exportedAt).toLocaleString('uk-UA') : '',
      chars: s.chars.map(c => ({ ...c, owner: guess(c.name), exists: already.has(`char:${c.id}`) })),
      enemies: s.enemies.map(e => ({ ...e, exists: already.has(`enemy:${e.id}`) })),
      storages: s.storages.map(x => ({ ...x, exists: wagonIds.has(`storage:${x.id}`) })),
      groups: s.groups.map(g => ({ ...g, checked: true })),
      anyExists: s.chars.some(c => already.has(`char:${c.id}`)) || s.enemies.some(e => already.has(`enemy:${e.id}`)),
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    const input = this.element.querySelector('input[type=file]')
    input?.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let json
        if (isSqlite(bytes)) {
          // сама база сайту — читаємо її тут же, у браузері
          this.progress = 'Читаю базу сайту…'
          json = await exportFromSqliteBytes(bytes)
          json.exportedAt = new Date(file.lastModified || Date.now()).toISOString()
        } else {
          json = JSON.parse(new TextDecoder().decode(bytes))
          if (json?.format !== 'god-site-export') throw new Error('це не база сайту і не файл експорту')
        }
        this.progress = ''
        this.data = json
        this.render()
      } catch (err) {
        this.progress = ''
        ui.notifications.error(`Не вдалося прочитати файл: ${err.message}`)
      }
    })
  }

  static #reset() { this.data = null; this.render() }
  static #toggleAll(ev, el) {
    const box = this.element.querySelector(`[data-list="${el.dataset.list}"]`)
    const inputs = [...box.querySelectorAll('input[type=checkbox]')]
    const on = !inputs.every(i => i.checked)
    inputs.forEach(i => { i.checked = on })
  }

  static async #run() {
    if (!game.user.isGM || this.busy || !this.data) return
    const root = this.element
    const checked = name => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value)
    const pick = {
      chars: new Set(checked('char').map(Number)), enemies: new Set(checked('enemy')), groups: new Set(checked('group')), storages: new Set(checked('storage').map(Number)),
      owners: Object.fromEntries([...root.querySelectorAll('select[data-owner]')].map(s => [Number(s.dataset.owner), s.value])),
      overwrite: !!root.querySelector('input[name=overwrite]')?.checked,
    }
    if (!pick.chars.size && !pick.enemies.size && !pick.groups.size && !pick.storages.size) return ui.notifications.warn('Нічого не обрано')
    this.busy = true
    const report = await importSelected(this.data, pick, msg => { this.progress = msg; this.render() }).catch(err => {
      console.error('G.O.D. | імпорт із сайту', err)
      ui.notifications.error(`Імпорт перервано: ${err.message}`)
      return null
    })
    this.busy = false
    this.progress = ''
    if (report) {
      await postReport(report)
      ui.notifications.info(`Перенесено: персонажів ${report.chars.length}, ворогів ${report.enemies.length}, візків ${report.storages.length}, предметів ${report.items}`)
      this.close()
    } else this.render()
  }
}

// ── Саме перенесення ──────────────────────────────────────────────────────────
async function importSelected(data, pick, step) {
  const report = { chars: [], enemies: [], storages: [], items: 0, groups: [], skipped: [], images: 0 }
  const fChars = await folder('Персонажі з сайту', 'Actor', '#4a6b3a')
  const fFoes = await folder('Вороги з сайту', 'Actor', '#7a2e2e')

  for (const entry of data.characters ?? []) {
    if (!pick.chars.has(entry.id)) continue
    step(`Персонаж: ${entry.sheet?.name_known || entry.slotName}`)
    const r = characterFromSite(entry)
    const existing = game.actors.find(a => a.getFlag('god', 'siteId') === r.actor.flags.god.siteId)
    if (existing && !pick.overwrite) { report.skipped.push(r.actor.name); continue }
    if (r.avatar) {
      const path = await uploadImage(r.avatar, `char-${entry.id}`)
      if (path) { r.actor.img = path; report.images++ } else r.notes.push('Аватар не вдалося завантажити — постав картинку вручну')
    }
    fitResourceBonus(r.actor, r.siteMax)
    const owner = pick.owners[entry.id]
    r.actor.ownership = owner ? { default: 0, [owner]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } : (existing?.toObject().ownership ?? { default: 0 })
    if (!owner && !existing) r.notes.push('Власника не призначено — віддай персонажа гравцю (ПКМ → Права)')
    const actor = await replaceOrCreate(r.actor, existing, fChars)
    report.chars.push({ name: actor.name, uuid: actor.uuid, notes: r.notes, updated: !!existing })
  }

  for (const e of data.enemies ?? []) {
    const id = `${e.party}:${e.id}`
    if (!pick.enemies.has(id)) continue
    step(`Ворог: ${e.name}`)
    const r = npcFromSite(e)
    const existing = game.actors.find(a => a.getFlag('god', 'siteId') === r.actor.flags.god.siteId)
    if (existing && !pick.overwrite) { report.skipped.push(r.actor.name); continue }
    const actor = await replaceOrCreate(r.actor, existing, fFoes)
    report.enemies.push({ name: actor.name, uuid: actor.uuid, notes: r.notes, updated: !!existing })
  }

  // Візки й склади: сховища; власники — гравці, яким у цьому ж імпорті віддано персонажів тієї пачки
  const partyOwners = {}
  for (const c of data.characters ?? []) {
    const u = pick.owners[c.id]
    if (u && pick.chars.has(c.id) && c.party) (partyOwners[c.party] ??= new Set()).add(u)
  }
  const chosen = (data.storages ?? []).filter(st => pick.storages.has(st.id))
  if (chosen.length) {
    step('Візки')
    const wagons = chosen.map(st => {
      const r = wagonFromSite(st)
      r.wagon.users = [...(partyOwners[st.partyName] ?? [])]
      report.items += r.wagon.items.length
      report.storages.push({ name: r.wagon.name, notes: [...r.notes, ...(r.wagon.users.length ? [] : ['Гравців пачки не обрано — візок бачать усі гравці (змінити: вкладка «Візки» → шестерня)'])] })
      return r.wagon
    })
    const res = await importWagons(wagons, { overwrite: pick.overwrite })
    report.skipped.push(...res.skipped)
    report.storages = report.storages.filter(x => !res.skipped.includes(x.name))
  }

  const groups = [
    ['gmItems', 'Предмети майстра', data.gmItems ?? []],
    ...(data.merchants ?? []).map(m => [`merchant:${m.id}`, `Торговець: ${m.name}`, m.items ?? []]),
  ]
  for (const [key, label, list] of groups) {
    if (!pick.groups.has(key) || !list.length) continue
    step(label)
    const f = await folder(label.slice(0, 60), 'Item', '#6b5a2e')
    const notes = []
    const items = list.filter(i => i?.name).map(raw => { const r = itemFromSite(raw, {}); notes.push(...r.notes); return { ...r.item, folder: f.id } })
    await Item.implementation.createDocuments(items)
    report.items += items.length
    report.groups.push({ label, count: items.length, notes })
  }
  return report
}

/** Доплата до авто-максимуму, щоб максимуми HP/OM/MT/ВС збіглися з сайтом */
function fitResourceBonus(data, siteMax) {
  let temp
  try { temp = new Actor.implementation(foundry.utils.deepClone({ ...data, _id: undefined })) } catch (err) { console.warn('G.O.D. | тимчасовий актор', err); return }
  for (const [k, max] of Object.entries(siteMax ?? {})) {
    const auto = temp.system.resources?.[k]?.auto
    if (typeof auto === 'number') data.system.resources[k].bonus = Math.round(max - auto)
  }
}

/** Новий актор або заміна вже перенесеного з тим самим id (токени на сценах не відв'язуються) */
async function replaceOrCreate(data, existing, folderDoc) {
  data.folder = existing?.folder?.id ?? folderDoc.id
  if (!existing) return Actor.implementation.create(data)
  const keep = { _id: existing.id, sort: existing.sort, prototypeToken: { ...existing.prototypeToken.toObject(), texture: { ...existing.prototypeToken.texture.toObject(), src: data.img ?? existing.prototypeToken.texture.src } } }
  if (!data.img) data.img = existing.img
  await existing.delete()
  return Actor.implementation.create({ ...data, ...keep }, { keepId: true })
}

async function folder(name, type, color) {
  return game.folders.find(f => f.type === type && f.name === name && !f.folder)
    ?? Folder.implementation.create({ name, type, color, sorting: 'a' })
}

/** data:image/... → файл у теці світу. Повертає шлях або null */
async function uploadImage(dataUrl, base) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/s.exec(dataUrl)
  if (!m) return null
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
  const bin = atob(m[2].replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const file = new File([bytes], `${base}.${ext}`, { type: `image/${m[1]}` })
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker
  const dir = `worlds/${game.world.id}/god-import`
  try { await FP.createDirectory('data', dir, {}) } catch { /* уже є */ }
  try {
    const res = await FP.upload('data', dir, file, {}, { notify: false })
    return res?.path ?? `${dir}/${file.name}`
  } catch (err) {
    console.warn('G.O.D. | аватар', err)
    return null
  }
}

/** Звіт майстру в чат: що перенесено і що варто перевірити */
async function postReport(r) {
  const list = (rows, kind) => rows.map(x => `<li>@UUID[${x.uuid}]{${esc(x.name)}}${x.updated ? ' <small>(оновлено)</small>' : ''}${x.notes.length
    ? `<details><summary>${x.notes.length} перевірити</summary><ul>${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}</li>`).join('')
  const groups = r.groups.map(g => `<li>${esc(g.label)}: ${g.count}${g.notes.length ? ` <small>(${g.notes.length} з вгаданою категорією)</small>` : ''}</li>`).join('')
  const content = `<div class="god-card god-import-report"><header class="god-card-head"><div><h3>Імпорт із сайту</h3>
    <span>персонажів ${r.chars.length} · ворогів ${r.enemies.length} · предметів ${r.items}${r.images ? ` · аватарів ${r.images}` : ''}</span></div></header>
    ${r.chars.length ? `<h4>Персонажі</h4><ul>${list(r.chars)}</ul>` : ''}
    ${r.enemies.length ? `<h4>Вороги</h4><ul>${list(r.enemies)}</ul>` : ''}
    ${r.storages.length ? `<h4>Візки (вкладка «Візки» в листі персонажа)</h4><ul>${r.storages.map(x => `<li>${esc(x.name)}${x.notes.length ? `<details><summary>${x.notes.length} перевірити</summary><ul>${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}</li>`).join('')}</ul>` : ''}
    ${groups ? `<h4>Предмети (теки в «Предметах»)</h4><ul>${groups}</ul>` : ''}
    ${r.skipped.length ? `<p class="god-dim">Пропущено, бо вже є: ${r.skipped.map(esc).join(', ')}</p>` : ''}
    <p class="god-dim">Категорії зброї й класи обладунку вгадано за назвами — перевір позначене вище. Ресурси, вміння, гроші й досвід перенесено як на сайті.</p></div>`
  return ChatMessage.create({ content, whisper: game.users.filter(u => u.isGM).map(u => u.id), speaker: { alias: 'G.O.D.' } })
}

export function registerSiteImporter() {
  game.settings.registerMenu('god', 'siteImport', {
    name: 'Імпорт із сайту G.O.D.', label: 'Відкрити імпорт', icon: 'fa-solid fa-file-import', restricted: true,
    hint: 'Перенести персонажів, ворогів і предмети з бази сайту (файл від tools/site-export.py).',
    type: GodSiteImporter,
  })
  // Кнопка в нижній частині вкладки «Актори» — лише для майстра
  Hooks.on('renderActorDirectory', (app, html) => {
    if (!game.user.isGM) return
    const root = html instanceof HTMLElement ? html : html?.[0]
    const footer = root?.querySelector('.directory-footer') ?? root?.querySelector('footer')
    if (!footer || footer.querySelector('.god-import-btn')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'god-import-btn'
    btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Імпорт із сайту'
    btn.addEventListener('click', () => new GodSiteImporter().render({ force: true }))
    footer.append(btn)
  })
}
