// Читання бази сайту через sql.js: той самий формат, що й tools/site-export.py (вигадана міні-база)
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
// sql-wasm.js — UMD; пакет має "type": "module", тож завантажуємо його як CommonJS вручну
const require = createRequire(import.meta.url)
const libDir = new URL('../god/lib/sql.js/', import.meta.url).pathname
const mod = { exports: {} }
new Function('module', 'exports', 'require', '__dirname', '__filename', readFileSync(libDir + 'sql-wasm.js', 'utf8'))(mod, mod.exports, require, libDir, libDir + 'sql-wasm.js')
const initSqlJs = mod.exports
const { exportFromDb, isSqlite } = await import('../god/module/site-db.mjs')

const SQL = await initSqlJs({ locateFile: f => libDir + f })
const db = new SQL.Database()
db.run(`
  create table users (id integer primary key, username text, password_hash text);
  create table parties (id integer primary key, name text);
  create table party_members (party_id int, user_id int, char_id int);
  create table characters (id integer primary key, user_id int, slot_name text, archived int, sheet_data text);
  create table party_combat (party_id int, enemies text);
  create table gm_items (id integer primary key, type text, name text, description text, data text);
  create table party_storages (id integer primary key, party_id int, name text, max_w real, items text);
  create table merchants (id integer primary key, name text, location text);
  create table merchant_items (id integer primary key, merchant_id int, type text, name text, description text, data text, qty int);
  insert into users values (1, 'гравець', 'секретнийхеш');
  insert into parties values (4, 'Банда');
  insert into party_members values (4, 1, 10);
  insert into characters values (10, 1, 'Слот', 0, '{"name_known":"Ведмідь","__touched":{"x":1},"_skillDraft":{}}');
  insert into party_combat values (4, '[{"id":"e1","name":"Орк","hp":"600","x":5,"y":6,"w":300}]');
  insert into gm_items values (1, 'weapon', 'Меч', '', '{"physicalDamage":"100","amount":"1"}');
  insert into party_storages values (3, 4, 'Віз', 200, '[{"name":"Сіно","type":"misc"}]');
  insert into merchants values (2, 'Норд', 'Мінфін');
  insert into merchant_items values (1, 2, 'potion', 'Зілля', 'Лікує', '{"weightPerOne":"0.2"}', 6);
`)
const bytes = db.export()
assert.ok(isSqlite(bytes) && !isSqlite(new TextEncoder().encode('{"format":"god-site-export"}')), 'розпізнає SQLite за заголовком')
const out = exportFromDb(new SQL.Database(bytes))
assert.equal(out.format, 'god-site-export')
assert.deepEqual(out.characters, [{ id: 10, slotName: 'Слот', archived: false, party: 'Банда', sheet: { name_known: 'Ведмідь' } }], 'службові поля прибрано')
assert.deepEqual(out.enemies, [{ id: 'e1', name: 'Орк', hp: '600', party: 4, partyName: 'Банда' }], 'координати картки прибрано')
assert.deepEqual(out.gmItems[0], { physicalDamage: '100', amount: '1', type: 'weapon', name: 'Меч', description: '' })
assert.deepEqual(out.storages[0], { id: 3, name: 'Віз', partyName: 'Банда', maxW: 200, items: [{ name: 'Сіно', type: 'misc' }] })
assert.equal(out.merchants[0].items[0].amount, 6); assert.equal(out.merchants[0].items[0].description, 'Лікує')
assert.ok(!JSON.stringify(out).includes('секретнийхеш') && !JSON.stringify(out).includes('гравець'), 'акаунти й паролі не читаються')
assert.throws(() => exportFromDb(new SQL.Database()), /characters/, 'чужа база — зрозуміла помилка')
console.log('✓ база сайту читається напряму, без акаунтів і службових полів')
