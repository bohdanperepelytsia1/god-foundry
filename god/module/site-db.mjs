/**
 * Читання бази сайту (charsheet.db) прямо в браузері — той самий результат, що й tools/site-export.py.
 * SQLite відкривається через sql.js (WebAssembly, лежить у системі: lib/sql.js, ліцензія MIT),
 * лише на читання і лише в пам'яті браузера майстра: на сервер Foundry база не потрапляє.
 * Акаунти, паролі, логи й кидки не читаються.
 */
const SKIP_SHEET_KEYS = new Set(['__touched', '_dashboardLayout', '_skillDraft', '_statDraft'])
const LIB = 'systems/god/lib/sql.js'

/** Перші байти файлу SQLite: "SQLite format 3\0" */
export const isSqlite = bytes => new TextDecoder().decode(bytes.slice(0, 15)) === 'SQLite format 3'

let sqlPromise = null
/** Завантажити sql.js один раз (у браузері — тегом script; у тестах можна передати готовий initSqlJs) */
export function loadSqlJs(init = globalThis.initSqlJs) {
  if (sqlPromise) return sqlPromise
  sqlPromise = (async () => {
    if (!init) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = `${LIB}/sql-wasm.js`
        s.onload = resolve
        s.onerror = () => reject(new Error('не вдалося завантажити sql.js'))
        document.head.append(s)
      })
      init = globalThis.initSqlJs
    }
    return init({ locateFile: f => `${LIB}/${f}` })
  })()
  sqlPromise.catch(() => { sqlPromise = null })
  return sqlPromise
}

const loads = (s, d) => { try { return s ? JSON.parse(s) : d } catch { return d } }

/** sql.js Database → об'єкт експорту (формат god-site-export, як у Python-скрипта) */
export function exportFromDb(db) {
  const q = (sql, params = []) => {
    const st = db.prepare(sql)
    try { st.bind(params); const rows = []; while (st.step()) rows.push(st.get()); return rows } finally { st.free() }
  }
  const tables = new Set(q("select name from sqlite_master where type = 'table'").map(r => r[0]))
  if (!tables.has('characters')) throw new Error('у базі немає таблиці characters — це не база сайту G.O.D.')
  const has = t => tables.has(t)
  const parties = new Map(has('parties') ? q('select id, name from parties') : [])
  const charParty = new Map(has('party_members') ? q('select char_id, party_id from party_members') : [])
  const itemRow = (type, name, description, data, qty) => {
    const it = loads(data, {})
    Object.assign(it, { type, name, description: description || it.description || '' })
    if (qty !== undefined && qty !== null) it.amount = qty
    return it
  }

  const characters = q('select id, slot_name, archived, sheet_data from characters order by id').map(([id, slot, archived, sheet]) => {
    const sd = loads(sheet, {})
    return {
      id, slotName: slot || '', archived: !!archived, party: parties.get(charParty.get(id)) ?? '',
      sheet: Object.fromEntries(Object.entries(sd).filter(([k]) => !SKIP_SHEET_KEYS.has(k))),
    }
  })
  const enemies = has('party_combat') ? q('select party_id, enemies from party_combat').flatMap(([pid, raw]) =>
    loads(raw, []).map(e => {
      const { x, y, w, h, ...rest } = e
      return { ...rest, party: pid, partyName: parties.get(pid) ?? '' }
    })) : []
  const gmItems = has('gm_items') ? q('select type, name, description, data from gm_items order by id').map(r => itemRow(...r)) : []
  const storages = has('party_storages') ? q('select id, party_id, name, max_w, items from party_storages order by id')
    .map(([id, pid, name, maxW, items]) => ({ id, name, partyName: parties.get(pid) ?? '', maxW, items: loads(items, []) })) : []
  const merchants = has('merchants') ? q('select id, name, location from merchants order by id').map(([id, name, location]) => ({
    id, name, location: location || '',
    items: has('merchant_items') ? q('select type, name, description, data, qty from merchant_items where merchant_id = ? order by id', [id]).map(r => itemRow(...r)) : [],
  })) : []
  return { format: 'god-site-export', version: 1, exportedAt: new Date().toISOString(), characters, enemies, gmItems, storages, merchants }
}

/** Байти файлу бази → експорт. Базу закриваємо одразу, у пам'яті лишається тільки потрібне */
export async function exportFromSqliteBytes(bytes, init) {
  const SQL = await loadSqlJs(init)
  const db = new SQL.Database(bytes)
  try { return exportFromDb(db) } finally { db.close() }
}
