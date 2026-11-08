import assert from 'node:assert/strict'
const formulas = []
globalThis.Roll = class { constructor(f) { this.formula = f; formulas.push(f) }
  async evaluate() { this.total = 15; this.dice = [{ faces: 20, total: 12, results: [{ result: 12, active: true }] }]; return this } }
globalThis.ChatMessage = { getSpeaker: () => ({}), applyRollMode: () => {}, create: async d => d }
globalThis.CONFIG = { sounds: { dice: '' } }
globalThis.game = { settings: { get: () => 'publicroll' } }
const { quickRoll } = await import('../god/module/dice/rolls.mjs')
const actor = { img: 'a.png' }
await quickRoll(actor, { base: 3, extra: 0 })
await quickRoll(actor, { base: 3, extra: -5, mode: 'adv' })
await quickRoll(actor, { mode: 'dis' })
await quickRoll(actor, { pool: { d6: 2, d20: 1 }, base: 1, extra: 1 })
await quickRoll(actor, { pool: { d8: 3 }, mode: 'adv' })
assert.deepEqual(formulas, ['1d20 + 3', '2d20kh - 2', '2d20kl', '2d6 + 1d20 + 2', '3d8'])
console.log('✓ формули панелі:', formulas.join(' | '))
