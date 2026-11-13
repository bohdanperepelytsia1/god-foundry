// Перетягування картинок: назви файлів латиницею, перевірка типу й розміру
import assert from 'node:assert/strict'
const { slug, checkFile } = await import('../god/module/apps/image-drop.mjs')
assert.equal(slug('Баронеса Де Сіняк-portrait'), 'baronesa-de-sinyak-portrait')
assert.equal(slug('Каспар Кроу "Компас"'), 'kaspar-krou-kompas')
assert.equal(slug('!!!'), 'image')
const f = (name, type, mb = 1) => ({ name, type, size: mb * 1048576 })
assert.equal(checkFile(f('орк.png', 'image/png')), null, 'png')
assert.equal(checkFile(f('орк.webp', '')), null, 'webp без MIME — за розширенням')
assert.match(checkFile(f('нотатки.txt', 'text/plain')), /не картинка/)
assert.match(checkFile(f('анімація.webm', 'video/webm')), /не картинка/, 'відео для портрета — ні')
assert.equal(checkFile(f('анімація.webm', 'video/webm'), { video: true }), null, 'відео для токена — так')
assert.match(checkFile(f('величезна.png', 'image/png', 25)), /завелике/)
console.log('✓ картинки: назви файлів, типи, розмір')
