/** Швидка панель: розкладка слотів по місцях (порожні місця зберігають номери) */
import assert from 'node:assert/strict'
globalThis.foundry = { applications: { api: { HandlebarsApplicationMixin: B => B, ApplicationV2: class {} } } }
const { placeSlot, addSlots, removeSlot } = await import('../god/module/apps/quickbar.mjs')
assert.deepEqual(addSlots(['a', null, 'c'], ['d', 'e', 'a']), ['a', 'd', 'c', 'e'], 'спершу в порожні, потім у кінець, без повторів')
assert.deepEqual(removeSlot(['a', 'b', 'c'], 'b'), ['a', null, 'c'], 'місце лишається порожнім')
assert.deepEqual(removeSlot(['a', 'b', null], 'b'), ['a'], 'хвіст порожніх обрізається')
assert.deepEqual(placeSlot(['a', 'b', 'c'], 'a', 2), ['c', 'b', 'a'], 'з панелі — обмін місцями')
assert.deepEqual(placeSlot(['a', 'b'], 'a', 5), [null, 'b', null, null, null, 'a'], 'на далеке порожнє місце')
assert.deepEqual(placeSlot(['a', null, 'c'], 'x', 1), ['a', 'x', 'c'], 'нове — у порожнє')
assert.deepEqual(placeSlot(['a', 'b'], 'x', 0), ['x', 'a', 'b'], 'нове на зайняте — посуває')
console.log('✓ швидка панель: місця, обмін, порожні')
