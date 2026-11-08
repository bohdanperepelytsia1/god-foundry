/**
 * Посилання для встановлення з Foundry: url, manifest (завжди на останній реліз) і download
 * (архів конкретної версії). Запуск: node build/manifest.mjs [версія] — без версії бере з system.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
const REPO = 'bohdanperepelytsia1/god-foundry'
const path = new URL('../god/system.json', import.meta.url)
const sys = JSON.parse(readFileSync(path, 'utf8'))
const version = process.argv[2] ?? sys.version
if (version !== sys.version) { console.error(`Версія ${version} ≠ system.json ${sys.version}`); process.exit(1) }
sys.url = `https://github.com/${REPO}`
sys.manifest = `https://github.com/${REPO}/releases/latest/download/system.json`
sys.download = `https://github.com/${REPO}/releases/download/v${version}/god.zip`
sys.bugs = `https://github.com/${REPO}/issues`
writeFileSync(path, JSON.stringify(sys, null, 2) + '\n')
console.log(`manifest: ${sys.manifest}\ndownload: ${sys.download}`)
