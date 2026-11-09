/**
 * Сумісність Foundry v13 і v14.
 * v14: зміна ефекту має рядковий `type` ('add'…) замість числового `mode`; тривалість — { value, units, expiry }
 * замість { rounds, startRound, … }. Пишемо обидва формати там, де це безпечно, і читаємо будь-який.
 */
export const isV14 = () => (globalThis.game?.release?.generation ?? 13) >= 14

/** Зміна «додати» для ефекту: v13 бере mode, v14 — type (зайве поле кожна версія просто відкидає) */
export const addChange = (key, value) => ({ key, value: String(value), mode: globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2, type: 'add' })

/** Тривалість у раундах для створення/оновлення ефекту (0 — безстроково) */
export function roundsDuration(rounds) {
  const combat = globalThis.game?.combat
  if (isV14()) {
    if (!rounds) return { value: null, units: 'rounds', expiry: null }
    const ev = Object.keys(globalThis.CONFIG?.ActiveEffect?.expiryEvents ?? {})
    return { value: rounds, units: 'rounds', expiry: ev.find(k => /turnstart/i.test(k)) ?? ev.find(k => /turn/i.test(k)) ?? ev[0] ?? null }
  }
  return rounds ? { rounds, startRound: combat?.round ?? 0, startTurn: combat?.turn ?? 0, combat: combat?.id ?? null } : { rounds: null }
}

/** Скільки раундів задано ефекту (будь-яка версія) */
export const effectRounds = e => {
  const d = e?.duration ?? {}
  if (d.units === 'rounds' && Number.isFinite(d.value)) return d.value
  return d.rounds || 0
}
/** Скільки раундів лишилось (якщо Foundry це знає) */
export const effectRoundsLeft = e => {
  const r = e?.duration?.remaining
  return Number.isFinite(r) ? Math.max(0, Math.ceil(r)) : null
}

/** Режим видимості кидка (публічний / для ГМ / сліпий) — v13 і v14 */
export function applyRollMode(data) {
  let mode
  try { mode = game.settings.get('core', 'rollMode') } catch { try { mode = game.settings.get('core', 'messageMode') } catch {} }
  const CM = globalThis.ChatMessage
  if (typeof CM?.applyRollMode === 'function') CM.applyRollMode(data, mode)
  else if (typeof CM?.applyMode === 'function') CM.applyMode(data, mode)
  return data
}
