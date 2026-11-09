import * as R from '../rules.mjs'
import { GOD } from '../config.mjs'
import * as Dice from '../dice/rolls.mjs'
import { addChange } from '../compat.mjs'

export class GodActor extends Actor {

  /** Підвищення рівня → автоматично нараховуємо очки вмінь і характеристик */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false
    if (options.godMigration) return
    if (this.type !== 'character') return
    const newXp = foundry.utils.getProperty(changes, 'system.progress.xp')
    if (newXp === undefined) return
    const gained = R.levelFromXp(newXp) - R.levelFromXp(this.system.progress.xp)
    if (gained <= 0) return
    const p = this.system.progress
    foundry.utils.setProperty(changes, 'system.progress.skillPoints',
      (foundry.utils.getProperty(changes, 'system.progress.skillPoints') ?? p.skillPoints) + gained * GOD.BALANCE.LEVEL_UP_SKILL_PTS)
    foundry.utils.setProperty(changes, 'system.progress.statPoints',
      (foundry.utils.getProperty(changes, 'system.progress.statPoints') ?? p.statPoints) + gained * GOD.BALANCE.LEVEL_UP_STAT_PTS)
    options.godLevelUp = gained
  }

  _onUpdate(changes, options, userId) {
    super._onUpdate(changes, options, userId)
    if (options.godLevelUp && userId === game.user.id) {
      ui.notifications.info(`${this.name}: новий рівень! +${options.godLevelUp * GOD.BALANCE.LEVEL_UP_SKILL_PTS} очок вмінь, +${options.godLevelUp * GOD.BALANCE.LEVEL_UP_STAT_PTS} очок характеристик`)
    }
  }

  /** Окрема картинка токена (портрет листа — інше): прототип і вже розставлені токени */
  async setTokenImage(path) {
    if (!path) return
    const from = this.isToken ? this.token?.texture?.src : this.prototypeToken?.texture?.src
    if (!this.isToken) await this.update({ 'prototypeToken.texture.src': path })
    await this.#syncPlacedTokens({ from, to: path, force: true })
    ui.notifications.info(`${this.name}: токен оновлено`)
  }

  /**
   * Токени, що вже стоять на сценах, з тією самою картинкою — теж оновити.
   * Майстер оновлює на всіх сценах, гравець — лише свої токени поточної сцени.
   */
  async #syncPlacedTokens({ from, to, force = false }) {
    const same = t => t.actorId === (this.isToken ? this.token?.actorId : this.id) && (force || !t.texture?.src || t.texture.src === from)
    if (this.isToken) { if (this.token?.isOwner) await this.token.update({ 'texture.src': to }); return }
    const scenes = game.user.isGM ? game.scenes.contents : (canvas?.scene ? [canvas.scene] : [])
    for (const scene of scenes) {
      const ups = scene.tokens.filter(t => same(t) && (t.actorLink || game.user.isGM) && t.isOwner).map(t => ({ _id: t.id, 'texture.src': to }))
      if (ups.length) await scene.updateEmbeddedDocuments('Token', ups).catch(e => console.warn('G.O.D. | токен не оновлено', e))
    }
  }

  /**
   * Швидка зміна ресурсу кнопками ±: лікування не піднімає вище максимуму,
   * HP може піти в мінус (як від урону), решта — не нижче нуля.
   */
  async adjustResource(key, delta) {
    const r = this.system.resources?.[key]
    if (!r || !delta) return
    let next = R.adjustValue(r.value, delta, r.max)
    if (key !== 'hp' && key !== 'mp') next = Math.max(0, next)   // HP і мана можуть піти в мінус
    if (next === r.value) return
    return this.update({ [`system.resources.${key}.value`]: next })
  }

  /**
   * Одягнути/зняти предмет. Заміна в зайнятому слоті відбувається ОДНИМ запитом:
   * попередній предмет просто отримує equipped=false і лишається в інвентарі.
   */
  async toggleEquip(item) {
    const s = item.system
    if (s.equipped) return item.update({ 'system.equipped': false })

    const updates = [{ _id: item.id, 'system.equipped': true }]
    const off = id => updates.push({ _id: id, 'system.equipped': false })
    for (const other of this.items) {
      if (other.id === item.id || !other.system.equipped) continue
      if (item.type === 'armor' && other.type === 'armor' && other.system.slot === s.slot) off(other.id)
      if (item.type === 'weapon' && other.type === 'weapon') {
        if (s.twoHanded || other.system.twoHanded || other.system.hand === s.hand) off(other.id)
      }
      // дворучна зброя і щит несумісні
      if (item.type === 'weapon' && s.twoHanded && other.type === 'armor' && other.system.slot === 'Щит') off(other.id)
      if (item.type === 'armor' && s.slot === 'Щит' && other.type === 'weapon' && other.system.twoHanded) off(other.id)
    }
    return this.updateEmbeddedDocuments('Item', updates)
  }

  /**
   * Підняти/знизити вміння. Правила: ключ гілки відкриває гілку; ключ не скинути,
   * поки гілка вкачана; гравець не опуститься нижче зафіксованого.
   * free=true — дія майстра: без витрат очок, і новий рівень одразу фіксується.
   */
  async changeSkill(key, delta, { free = false } = {}) {
    if (key.startsWith('custom:')) return this.changeCustomSkill(key.slice(7), delta, { free })
    const meta = GOD.SKILL_INDEX[key]
    if (!meta) return
    const cat = GOD.SKILL_CATEGORIES[meta.cat]
    const sys = this.system
    const r = R.canChangeSkill({
      skill: meta, cat, levels: sys.skills[meta.cat], delta, points: sys.progress.skillPoints,
      floor: sys.floors.skills[key] ?? 0, free, gateName: GOD.SKILL_INDEX[cat.gate]?.name,
    })
    if (!r.ok) return ui.notifications.warn(`${meta.name}: ${r.reason}`)
    const lvl = sys.skills[meta.cat][key] + delta
    const update = { [`system.skills.${meta.cat}.${key}`]: lvl }
    if (!free) update['system.progress.skillPoints'] = sys.progress.skillPoints + (delta > 0 ? -r.cost : r.refund)
    else update[`system.floors.skills.${key}`] = lvl
    return this.update(update)
  }

  async changeCustomSkill(id, delta, { free = false } = {}) {
    const sys = this.system
    const list = sys.toObject().customSkills
    const s = list.find(x => x.id === id)
    if (!s) return
    const cat = GOD.SKILL_CATEGORIES[s.cat]
    const levels = { ...sys.skills[s.cat], [`custom:${id}`]: s.lvl }
    const r = R.canChangeSkill({
      skill: { key: `custom:${id}`, cost: s.cost, max: s.max, isGate: false }, cat, levels, delta,
      points: sys.progress.skillPoints, floor: s.floor, free, gateName: GOD.SKILL_INDEX[cat.gate]?.name,
    })
    if (!r.ok) return ui.notifications.warn(`${s.name}: ${r.reason}`)
    s.lvl += delta
    if (free) s.floor = s.lvl
    const update = { 'system.customSkills': list }
    if (!free) update['system.progress.skillPoints'] = sys.progress.skillPoints + (delta > 0 ? -r.cost : r.refund)
    return this.update(update)
  }

  async changeStat(key, delta, { free = false } = {}) {
    const st = this.system.stats[key]
    if (!st) return
    const pts = this.system.progress.statPoints
    if (delta > 0 && !free && pts < 1) return ui.notifications.warn('Немає очок характеристик')
    if (delta < 0 && (st.base ?? st.value) <= 0) return
    const floor = this.system.floors.stats[key]
    if (delta < 0 && !free && floor !== undefined && (st.base ?? st.value) <= floor) {
      return ui.notifications.warn(`${GOD.STATS[key].label}: значення зафіксовано — знизити може лише майстер`)
    }
    const v = st.base ?? st.value
    const update = { [`system.stats.${key}.value`]: v + delta }
    if (!free) update['system.progress.statPoints'] = pts - delta
    else update[`system.floors.stats.${key}`] = v + delta
    return this.update(update)
  }

  /** «Зафіксувати розвиток»: поточні рівні стають нижньою межею для гравця */
  async commitBuild() {
    const sys = this.system
    const skills = {}
    for (const [cat, c] of Object.entries(GOD.SKILL_CATEGORIES)) for (const s of c.skills) skills[s.key] = sys.skills[cat][s.key]
    const stats = Object.fromEntries(Object.keys(GOD.STATS).map(k => [k, sys.stats[k].base ?? sys.stats[k].value]))
    const customSkills = sys.toObject().customSkills.map(s => ({ ...s, floor: s.lvl }))
    await this.update({ 'system.floors.skills': skills, 'system.floors.stats': stats, 'system.customSkills': customSkills })
    ui.notifications.info(`${this.name}: розвиток зафіксовано`)
  }

  // ── Особливі вміння (майстер) і списки знань ─────────────────────────────
  async addCustomSkill(cat = 'magic') {
    const list = this.system.toObject().customSkills
    list.push({ id: foundry.utils.randomID(), name: 'Особливе вміння', cat, cost: 5, max: 10, lvl: 0, floor: 0 })
    return this.update({ 'system.customSkills': list })
  }
  async updateCustomSkill(id, field, value) {
    const list = this.system.toObject().customSkills
    const s = list.find(x => x.id === id)
    if (!s) return
    s[field] = ['cost', 'max'].includes(field) ? Number(value) || s[field] : value
    return this.update({ 'system.customSkills': list })
  }
  async removeCustomSkill(id) {
    return this.update({ 'system.customSkills': this.system.toObject().customSkills.filter(s => s.id !== id) })
  }
  async addKnowledge(list) {
    const arr = this.system.toObject().knowledge[list]
    arr.unshift(list === 'languages' ? { name: '', level: '' } : { name: '', source: '', desc: '' })
    return this.update({ [`system.knowledge.${list}`]: arr })
  }
  async updateKnowledge(list, index, field, value) {
    const arr = this.system.toObject().knowledge[list]
    if (!arr[index]) return
    arr[index][field] = value
    return this.update({ [`system.knowledge.${list}`]: arr })
  }
  async removeKnowledge(list, index) {
    const arr = this.system.toObject().knowledge[list]
    arr.splice(index, 1)
    return this.update({ [`system.knowledge.${list}`]: arr })
  }

  /** Стійка v4.5.0 — активний ефект; одночасно лише одна. Повторний клік знімає */
  /** Чи доступні стійки (Бойові рефлекси ≥ налаштування; майстер і НІП — завжди) */
  get stanceLock() {
    if (this.type !== 'character' || game.user?.isGM) return null
    const need = game.settings?.get?.('god', 'stanceReflexes') ?? 1
    const have = this.system.skill?.('Бойові_рефлекси') ?? 0
    return have >= need ? null : `Стійки — з ${need} рівня Бойових рефлексів (зараз ${have})`
  }

  async setStance(id) {
    if (id !== 'neutral' && this.stanceLock) return ui.notifications.warn(`${this.name}: ${this.stanceLock}`)
    const existing = this.effects.filter(e => e.getFlag('god', 'stance'))
    const same = existing.some(e => e.getFlag('god', 'stance') === id)
    if (existing.length) await this.deleteEmbeddedDocuments('ActiveEffect', existing.map(e => e.id))
    if (same || id === 'neutral' || !GOD.STANCES[id]) return
    const st = GOD.STANCES[id]
    return this.createEmbeddedDocuments('ActiveEffect', [{
      name: st.label, img: st.icon, flags: { god: { stance: id } },
      changes: Object.entries(st.changes).map(([key, value]) => addChange(key, value)),
    }])
  }

  /**
   * Відпочинок і відновлення броні (Player manual): вибір у діалозі, відновлене — в чат.
   */
  async restDialog() {
    const opt = (k, l) => `<label class="god-dlg-check"><input type="radio" name="what" value="${k}"><span>${l}</span></label>`
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: `Відпочинок: ${this.name}`, icon: 'fa-solid fa-campground' }, classes: ['god-dialog'], position: { width: 380 }, rejectClose: false,
      content: `<p class="god-dlg-info">Витривалість відновлюється за правилами; броня — підгонкою чи повним відновленням.</p>
        <h4 class="god-dlg-h">Відпочинок і сон</h4>${Object.entries(R.REST).map(([k, r]) => opt(k, `${r.label} — +${r.ed} ВС`)).join('')}
        <h4 class="god-dlg-h">Броня</h4>${Object.entries(R.ARMOR_REPAIR).map(([k, r]) => opt(k, r.label)).join('')}`,
      buttons: [{ action: 'ok', label: 'Застосувати', icon: 'fa-solid fa-check', default: true, callback: (e, b) => b.form.querySelector('[name="what"]:checked')?.value ?? null }],
    })
    if (!res || typeof res !== 'string') return
    const r = this.system.resources, upd = {}, lines = []
    if (R.REST[res]) {
      const to = Math.min(r.ed.max, r.ed.value + R.REST[res].ed)
      upd['system.resources.ed.value'] = to
      lines.push(`${R.REST[res].label}: ВС ${r.ed.value} → ${to}`)
    } else if (R.ARMOR_REPAIR[res]) {
      const pct = R.ARMOR_REPAIR[res].pct
      for (const k of ['pr', 'mr']) {
        const to = Math.min(r[k].max, r[k].value + Math.ceil(r[k].max * pct / 100))
        upd[`system.resources.${k}.value`] = to
        lines.push(`${k.toUpperCase()} ${r[k].value} → ${to}`)
      }
      lines.unshift(R.ARMOR_REPAIR[res].label)
    }
    await this.update(upd)
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="god-card"><p><b>${foundry.utils.escapeHTML?.(this.name) ?? this.name}</b> — ${lines.join(' · ')}</p></div>` })
  }

  /** ШУ цього актора як цілі */
  get dodgeValue() { return this.system.derived?.dodge ?? 0 }

  rollStat(key) { return Dice.statCheck(this, key) }
  rollSkill(key) { return Dice.skillCheck(this, key) }
  rollInitiativeValue() { return this.system.derived?.initiative ?? 0 }
}
