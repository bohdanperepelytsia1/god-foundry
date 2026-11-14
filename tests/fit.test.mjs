/** Вікна під екран: позиція й розмір підганяються так, щоб низ вікна (кнопки) був на екрані */
import assert from 'node:assert/strict'
const { fitRect } = await import('../god/module/fit.mjs')
assert.deepEqual(fitRect({ left: 100, top: 100, width: 400, height: 300 }, 1920, 1080), {}, 'влазить — не чіпаємо')
assert.deepEqual(fitRect({ left: 100, top: 400, width: 400, height: 600 }, 1366, 768), { top: 160 }, 'низ за краєм — підсуваємо вгору')
assert.deepEqual(fitRect({ left: 500, top: 0, width: 600, height: 900 }, 1366, 768), { height: 752, top: 8 }, 'вище за екран — обрізаємо, вміст прокрутиться')
assert.deepEqual(fitRect({ left: 900, top: 20, width: 940, height: 500 }, 1280, 720), { left: 332 }, 'правий край за екраном')
assert.deepEqual(fitRect({ left: 0, top: 0, width: 940, height: 780 }, 800, 600), { width: 784, height: 584, left: 8, top: 8 }, 'маленький екран')
console.log('✓ вікна під екран')
