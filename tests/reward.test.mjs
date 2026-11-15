// Нагорода за партію: XP із підвищенням рівня, крити й вдача з обмеженням
import assert from 'node:assert/strict'
globalThis.foundry = { data: { fields: {} } }
const { rewardUpdate } = await import('../god/module/apps/reward.mjs')
const R = await import('../god/module/rules.mjs')
const sys = { progress: { xp: R.totalXpForLevel(3) + 10 }, reputation: { crits: 28, luck: 4 } }
const r = rewardUpdate(sys, { xp: 500, crits: 5, luck: 1 })
assert.equal(r.update['system.progress.xp'], R.totalXpForLevel(3) + 510)
assert.equal(r.level, R.levelFromXp(R.totalXpForLevel(3) + 510)); assert.ok(r.levels > 0, 'рівень піднявся')
assert.equal(r.update['system.reputation.crits'], 30, 'крити не більше 30'); assert.ok(r.capped.crits)
assert.equal(r.update['system.reputation.luck'], 5); assert.ok(!r.capped.luck)
const neg = rewardUpdate(sys, { xp: -99999, crits: -40, luck: 0 })
assert.equal(neg.update['system.progress.xp'], 0); assert.equal(neg.update['system.reputation.crits'], 0)
const pts = rewardUpdate({ ...sys, progress: { ...sys.progress, skillPoints: 3, statPoints: 1 } }, { skillPoints: 5, statPoints: -4 })
assert.equal(pts.update['system.progress.skillPoints'], 8, 'очки вмінь окремо')
assert.equal(pts.update['system.progress.statPoints'], 0, 'у мінус — не нижче нуля')
console.log('✓ нагорода: XP і рівень, крити й вдача в межах, очки вмінь і характеристик')
