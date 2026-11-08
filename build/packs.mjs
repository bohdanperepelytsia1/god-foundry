/**
 * Збирання компендіумів G.O.D.: JSON-джерела → LevelDB-паки через офіційний CLI Foundry.
 * ID стабільні (похідні від назви), тож перезбирання не ламає посилань у світах.
 *   node build/packs.mjs
 */
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defaultIcon } from '../god/module/config.mjs'

const require = createRequire(process.env.TOOLS ? process.env.TOOLS + '/' : import.meta.url)
const { compilePack } = await import(require.resolve('@foundryvtt/foundryvtt-cli'))

const ROOT = new URL('..', import.meta.url).pathname
const SRC = `${ROOT}build/packs-src`
const OUT = `${ROOT}god/packs`
const id = s => createHash('sha1').update(s).digest('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
const STATS = { coreVersion: '13.345', systemId: 'god', systemVersion: '0.5.0' }
const I = (g, k) => `systems/god/assets/icons/${g}/${k}.svg`

// ── Довідкові тексти для описів ─────────────────────────────────────────────
const MAGIC_LEVELS = `<p><b>Рівні володіння:</b> 1 — +1 МОД · 2 — +2 МОД · 3 — +3 МОД · 4 — ЗДТН · 5 — ЗДТН + 1 СИЛА ·
  6 — +4 МОД · 7 — +5 МОД + ПОТІК · 8 — +6 МОД · 9 — ЗДТН + 2 СИЛА · 10 — 8 МОД</p>`
const TEMPLATE_NOTE = `<p><i>Шаблон. Вкажи урон і ціну за таблицями своєї кампанії.</i></p>`
const ARMOR_CLASS = {
  light: `<p><b>Легкий обладунок.</b> Можна спати й плавати без штрафів. Одягання кожного елемента в бою — 2 ПХ, знімання — 1 ПХ.</p>`,
  medium: `<p><b>Середній обладунок.</b> −1 ШУ. Не можна спати; перешкода — плавання; МОД −2 на скритність, акробатику, маскування.
    Кирасу не вдягнути самостійно. Одягання кираси/поножів у бою — 5/3 ПХ, знімання — 2/1 ПХ.</p>`,
  heavy: `<p><b>Тяжкий обладунок.</b> −2 ШУ. Не можна плавати й спати; перешкода — скритність, маскування, акробатика.
    Кирасу не вдягнути й не зняти самостійно. Одягання кираси/поножів у бою — 12/8 ПХ, знімання — 5/3 ПХ.
    Бонус: травми та каліцтва з перешкодою.</p>`,
}

// ── Документи ───────────────────────────────────────────────────────────────
const folders = {}
const folder = (name, color, sort) => {
  const _id = id('folder:' + name)
  folders[name] = { _id, _key: `!folders!${_id}`, name, type: 'Item', folder: null, sorting: 'a', sort, color, description: '', flags: {} }
  return _id
}
const F = {
  weapons: folder('Зброя', '#4a5568', 100), magic: folder('Магічна зброя', '#5b3f8a', 200),
  armor: folder('Обладунки та одяг', '#7a5230', 300), gear: folder('Спорядження', '#6b5a2a', 400),
  spells: folder('Заклинання', '#8a2f1f', 500),
}

const items = []
const effect = (itemId, name, img, changes) => {
  const _id = id(`effect:${itemId}:${name}`)
  return { _id, _key: `!items.effects!${itemId}.${_id}`, name, img, type: 'base', system: {}, disabled: false, transfer: true,
    changes: Object.entries(changes).map(([key, value]) => ({ key, mode: 2, value: String(value), priority: null })),
    duration: {}, origin: null, description: '', statuses: [], tint: '#ffffff', sort: 0, flags: {}, _stats: STATS }
}
const item = (name, type, system, { folderId, img, description = '', effects } = {}) => {
  const _id = id(`item:${name}`)
  const doc = {
    _id, _key: `!items!${_id}`, name, type, img: img ?? defaultIcon(type, system),
    system: { description, ...system }, effects: [], folder: folderId, sort: items.length * 100,
    ownership: { default: 0 }, flags: {}, _stats: STATS,
  }
  if (effects) doc.effects = effects(_id)
  items.push(doc)
  return doc
}

// Зброя (шаблони під категорії)
for (const [name, category, weight, extra] of [
  ['Кастет', 'fist', 0.3, {}], ['Кинджал', 'light', 0.5, {}], ['Меч', 'onehand', 1.5, {}],
  ['Бойова сокира', 'heavy1h', 2.5, {}], ['Дворучний меч', 'twohand', 3.5, { twoHanded: true }],
  ['Лук', 'bow', 1, { twoHanded: true, range: 12 }], ['Метальні ножі', 'throw', 0.2, { quantity: 5, range: 6 }],
]) item(name, 'weapon', { category, weight, range: 1, ...extra }, { folderId: F.weapons, description: TEMPLATE_NOTE })

// Магічна зброя — v4.5.0 §1.3
item('Посох', 'weapon', { category: 'staff', range: 3, twoHanded: true, weight: 2, isMagic: true }, { folderId: F.magic,
  description: `<p>Радіус ураження 3, в обидві руки, далекобійна. Містить 0–3 заклинань, підвищує ефективність заклинань героя (урон, радіус).</p>
  <p>На 7-му рівні володіння посохом можна користуватись як одноручною зброєю.</p>${MAGIC_LEVELS}` })
item('Жезл', 'weapon', { category: 'wand', range: 5, weight: 0.5, isMagic: true }, { folderId: F.magic,
  description: `<p>Радіус ураження 5, в одну руку, далекобійна, наносить магічний урон. <b>Зменшує час касту будь-якого заклинання вдвічі</b>, якщо каст іде через жезл.</p>${MAGIC_LEVELS}` })
item('Кодекс мага', 'weapon', { category: 'codex', range: 0, weight: 1.5, isMagic: true }, { folderId: F.magic,
  description: `<p>Підсилювальний предмет, в одну чи обидві руки. Містить 0–10 заклинань, підвищує ефективність заклинань, дає магічний захист.</p>${MAGIC_LEVELS}` })
item('Великий кодекс мага', 'weapon', { category: 'codex', range: 0, weight: 2.5, twoHanded: true, isMagic: true, spellStatMult: true }, { folderId: F.magic,
  description: `<p>В обидві руки. <b>При підрахунку урону від заклинання враховуються множники ІНТ і МУД:</b>
  база × (рівень школи + МОДІНТ + МОДМУД). Система підставляє це автоматично, коли кодекс у руках.</p>${MAGIC_LEVELS}` })
item('Тризуб', 'weapon', { category: 'trident', range: 3, twoHanded: true, weight: 3, isMagic: true }, { folderId: F.magic,
  description: `<p>Радіус ураження 3, в обидві руки, далекобійна і ближній бій. Універсальна зброя: фізичний і магічний урон.</p>${TEMPLATE_NOTE}${MAGIC_LEVELS}` })
item('Чакрами', 'weapon', { category: 'chakram', range: 6, weight: 1, isMagic: true }, { folderId: F.magic,
  description: `<p>Радіус ураження 6, парна зброя (в кожну руку), далекобійна і ближній бій. Фізичний і магічний урон.</p>${TEMPLATE_NOTE}${MAGIC_LEVELS}` })
item('Оберіг', 'weapon', { category: 'amulet', range: 0, weight: 0.2, isMagic: true }, { folderId: F.magic,
  description: `<p>Магічний оберіг.</p>${TEMPLATE_NOTE}` })

// Обладунки й одяг
item('Шкіряна куртка', 'armor', { slot: 'Кираса', armorClass: 'light', weight: 3 }, { folderId: F.armor, description: ARMOR_CLASS.light + TEMPLATE_NOTE })
item('Кольчуга', 'armor', { slot: 'Кираса', armorClass: 'medium', weight: 9 }, { folderId: F.armor, description: ARMOR_CLASS.medium + TEMPLATE_NOTE,
  effects: iid => [effect(iid, 'Середній обладунок', I('stances', 'defense'), { 'system.combat.dodgeBonus': -1 })] })
item('Латна кираса', 'armor', { slot: 'Кираса', armorClass: 'heavy', weight: 14 }, { folderId: F.armor, description: ARMOR_CLASS.heavy + TEMPLATE_NOTE,
  effects: iid => [effect(iid, 'Тяжкий обладунок', I('stances', 'defense'), { 'system.combat.dodgeBonus': -2 })] })
for (const [name, slot, weight] of [['Шолом', 'Шолом', 2], ['Поножі', 'Поножі', 4], ['Рукавиці', 'Рукавиці', 0.5],
  ['Чоботи', 'Чоботи', 1.5], ['Дорожній одяг', 'Одяг', 1], ['Плащ', 'Плащ_накидка', 1], ['Каплевидний щит', 'Щит', 5]]) {
  item(name, 'armor', { slot, weight }, { folderId: F.armor, description: TEMPLATE_NOTE })
}
item('Пояс з підсумками', 'armor', { slot: 'Пояс', beltSlots: 3, weight: 0.5 }, { folderId: F.armor,
  description: `<p>Дає 3 слоти пояса: предмети з пояса використовуються за 1 додаткову дію без відкриття інвентарю.</p>` })
item('Дорожній рюкзак', 'armor', { slot: 'Рюкзак', bagBonus: 10, weight: 1.5 }, { folderId: F.armor,
  description: `<p>Збільшує максимальну вагу на 10 кг, поки одягнений.</p>` })
item('Магічне кільце', 'armor', { slot: 'Палець_л', weight: 0.05, isMagic: true }, { folderId: F.armor,
  description: `<p>Додатково дає <b>200 OM</b>, поки кільце на пальці. Ефект вимикається сам, якщо кільце зняти.</p>`,
  effects: iid => [effect(iid, 'Магічне кільце: +200 OM', I('schools', 'odhi'), { 'system.resources.mp.bonus': 200 })] })

// Спорядження
for (const [name, icon, weight, quantity, location, description] of [
  ['Мотузка, 15 м', 'rope', 2, 1, 'main', 'Міцна конопляна мотузка. Витримає двох людей.'],
  ['Смолоскип', 'torch', 0.5, 3, 'main', 'Горить близько години. Освітлює радіус у кілька клітинок.'],
  ['Кресало', 'tools', 0.1, 1, 'tools', 'Кремінь і кресало для розпалювання вогню.'],
  ['Набір відмичок', 'lockpick', 0.2, 1, 'tools', 'Для роботи з замками. Потребує вміння «Взлом» чи «Знання замків».'],
  ['Похідний пайок', 'food', 0.5, 3, 'main', 'Сухарі, в’ялене м’ясо, сир. Один день харчування.'],
  ['Спальник', 'camp', 2, 1, 'main', 'Ковдра і підстилка для ночівлі під небом.'],
  ['Мапа місцевості', 'map', 0.1, 1, 'books', 'Мапа — заповнюється в процесі пригоди.'],
  ['Порожній сувій', 'scroll', 0.05, 2, 'books', 'Для записів, листів чи заклинань.'],
  ['Лікувальні трави', 'herb', 0.1, 3, 'ingredients', 'Сировина для травництва і зіллєварства.'],
  ['Зілля лікування', 'potion', 0.2, 1, 'potions', 'Відновлює здоров’я. Скільки саме — визначає майстер: вкажи HP у листі предмета, і «Використати» застосує його саме.'],
  ['Антидот', 'flask', 0.2, 1, 'potions', 'Знімає дію звичайних отрут.'],
]) item(name, 'gear', { weight, quantity, location, consumable: ['potion', 'flask', 'food'].includes(icon) },
  { folderId: F.gear, img: I('gear', icon), description: `<p>${description}</p>` })

// Заклинання — приклад з правил v4.5.0
item('Вогняний джавелін', 'spell', { school: 'fire', level: 1, threshold: 6, manaCost: 100, staminaCost: 0, attackType: 'target',
  baseDamage: 100, damageKind: 'mag', castTime: 'миттєво' }, { folderId: F.spells,
  description: `<p>Герой сотворює в руках величезний спис з плазми, який може кинути в ціль.</p>
  <p><b>Приклад:</b> ІНТ 45 (МОД +3), МУД 60 (МОД +4), Сила вогню 4, Великий кодекс мага в руках →
  3d8 проти 6; при успіху 100 × (4 + 3 + 4) = <b>1100 маг. урону</b>.</p>` })

// ── Довідник правил ─────────────────────────────────────────────────────────
const journals = []
const journal = (name, pages) => {
  const jid = id('journal:' + name)
  journals.push({
    _id: jid, _key: `!journal!${jid}`, name, folder: null, sort: journals.length * 100, ownership: { default: 2 }, flags: {}, _stats: STATS,
    pages: pages.map(([pname, content], i) => {
      const pid = id(`page:${name}:${pname}`)
      return { _id: pid, _key: `!journal.pages!${jid}.${pid}`, name: pname, type: 'text', title: { show: true, level: 1 },
        text: { content, format: 1 }, sort: i * 100, ownership: { default: -1 }, flags: {}, src: null, image: {}, video: {}, system: {}, _stats: STATS }
    }),
  })
}
const tierRows = (master) => [
  [master ? '20 чиста' : '20 чиста', master ? 'Смертельний урон + безкоштовна дод. дія' : 'Смертельний урон'],
  ['20', master ? 'Смертельний урон' : 'Критичний урон'],
  ['19', master ? 'Критичний урон, шанс смертельного' : 'Критичний урон'],
  ['18', '100%, шанс критичного'], ['15–17', '100%'], ['14', '75%, шанс 100%'], ['13', '75%'],
  ['12', '50%, шанс 75%'], ['10–11', '50%'], ['9', '25%, шанс 50%'], ['6–8', '25%'], ['5', '10%, шанс 25%'],
  ['2–4', '10%'], ['1 (і натуральна 1)', '0%'],
].map(([r, t]) => `<tr><td>${r}</td><td>${t}</td></tr>`).join('')

journal('Довідник G.O.D.', [
  ['Як користуватись системою', `
    <p><b>Замок</b> у бічній панелі листа вмикає режим редагування. У звичайному режимі лист показує значення й кнопки кидків.</p>
    <ul>
      <li><b>Ресурси, XP і гроші</b> приймають дельту: <code>-25</code>, <code>+10</code>, <code>=30</code> + Enter. Клік по числу виділяє його (нуль просто зникає) — одразу набирай нове.</li>
      <li><b>± на смугах ресурсів</b> з'являються під курсором: клік ±1, Shift ±10, Ctrl ±100. Лікування не піднімає вище максимуму. Клік по <b>HP</b> — завдати урону.</li>
      <li><b>Максимум змінився — поточне теж.</b> Вдягнув броню на 40 PR — PR +40; підняв Статуру — HP росте на ту саму різницю. Зняв і вдягнув розбиту броню — вона так і лишиться розбитою.</li>
      <li><b>Швидка панель</b> внизу екрана (Shift+Q): ресурси, ШУ, стійка і слоти. Перетягни туди предмет, заклинання чи вміння з листа; ПКМ прибирає слот, перетягування міняє порядок. Панель замінює хотбар Foundry: макроси теж кладуться в слоти, клавіші 1–0 запускають слоти.</li>
      <li><b>Клік по характеристиці чи вмінню</b> — кидок. <b>Клік по назві предмета</b> — опис, <b>по іконці</b> — використати.</li>
      <li><b>ПКМ по предмету</b> — меню: використати, редагувати, одягнути, дублювати, видалити.</li>
      <li><b>Панель кидків</b> — кнопка «Кидки» на листі або <b>Shift+R</b>. Обери вміння — модифікатор підставиться сам.</li>
      <li><b>Перетягни зброю чи заклинання на хотбар</b> — отримаєш макрос.</li>
      <li><b>Атака</b>: у вікні атаки обери ціль (позначена клавішею T обирається сама). Урон кидається лише якщо попадання <b>більше</b> за ШУ цілі; рівно ШУ — промах.</li>
      <li><b>Характеристики й ресурси</b> приймають формулу: <code>+5</code>, <code>-5</code>, <code>=30</code>.</li>
      <li><b>Урон</b> (кнопка «Урон → ціль» у чаті) іде послідовно <b>MR → PR → HP</b>, тип урону не важливий. Якщо урон менший за MR, магічну броню не пробито — урон зникає, MR не зменшується.</li>
      <li><b>Інвентар</b>: обери предмет — праворуч усі його характеристики й опис. Перетягни рядок на інший розділ, щоб перекласти; ↑/↓ і Enter працюють з клавіатури. Розхідне (зілля, їжа) після «Використати» саме відновлює вказані ресурси й списує 1 шт.</li>
      <li><b>Ефекти предметів</b> (кільце +200 OM, штраф тяжкої броні) діють лише поки предмет одягнено.</li>
    </ul>`],
  ['Атака і сітка урону', `
    <p><b>Атака:</b> перевірка попадання d20 + прицільність — треба викинути <b>більше</b> за ШУ цілі. При влучанні — кидок урону d20 за сіткою.</p>
    <p>Володіння зброєю 1+ дає МОД +1 до перевірки урону. Без володіння — МОД −5, а критичний і смертельний урон замінюються на 100%.</p>
    <h2>Уміння 5+</h2><table><tbody>${tierRows(true)}</tbody></table>
    <h2>Уміння 4 і менше</h2><table><tbody>${tierRows(false)}</tbody></table>
    <p><b>100% урону:</b> основна рука — СИЛ × 5 + фіз. урон зброї; магічна частина (ІНТ × 5 + маг. урон) — якщо зброя зачарована.</p>`],
  ['Сотворення заклинань', `
    <ol>
      <li>Перевірка попадання від «Магічної прицільності»: d20 + рівень, треба перекинути ШУ цілі. Промах — мана списується.</li>
      <li>Перевірка сотворення: <b>МОДІНТ кубів d(рівень школи)</b>. Успіх, якщо <b>хоча б один куб ≥ порогу (ПППС)</b>. Куби не сумуються.</li>
      <li>Провал — мана списується, можна пробувати ще раз, поки її вистачає.</li>
      <li>Успіх — урон: <b>база × рівень школи</b>. З Великим кодексом мага: база × (рівень школи + МОДІНТ + МОДМУД).</li>
    </ol>
    <h2>Кістка за рівнем школи</h2>
    <table><tbody><tr><td>1</td><td>d2</td></tr><tr><td>2</td><td>d4</td></tr><tr><td>3</td><td>d6</td></tr><tr><td>4</td><td>d8</td></tr>
    <tr><td>5</td><td>d10</td></tr><tr><td>6</td><td>d12</td></tr><tr><td>7</td><td>d12, МУД +15</td></tr><tr><td>8</td><td>d20</td></tr>
    <tr><td>9</td><td>d20, ІНТ +15</td></tr><tr><td>10</td><td>d20, МУД +30</td></tr></tbody></table>`],
  ['Стійки', `
    <p>Стійка вмикається додатковою дією і діє з наступного раунду. Окрім нейтральної, у стійці не можна бігти (швидкість ×½) і тікати.</p>
    <table><tbody>
      <tr><td><b>Атакуюча</b></td><td>урон МОД +2, ШУ −4</td></tr>
      <tr><td><b>Захисна</b></td><td>ШУ +2, урон МОД −4</td></tr>
      <tr><td><b>Нейтральна</b></td><td>без модифікаторів</td></tr>
      <tr><td><b>Несмертельна</b></td><td>урон МОД −3, попадання +1, урон несмертельний</td></tr>
    </tbody></table>
    <p>На листі стійка вмикається кнопками в бічній панелі — модифікатори застосовуються автоматично.</p>`],
  ['Розвиток персонажа', `
    <p><b>Рівень:</b> перехід з рівня N на N+1 коштує (N+1) × 50 досвіду. Кожен рівень дає 8 очок вмінь і 6 очок характеристик — система нараховує їх сама.</p>
    <p><b>Гілки вмінь</b> відкриваються ключовими вміннями: Говорливість (соціальні), Інстинкти (нейтральні), Бойові навички (бойові),
      Розуміння (наука), Магічність (магія), Злочинність (поза законом). Доки ключ не вивчено, решта гілки закрита.
      Ключ не можна скинути, поки в гілці вкачано інші вміння.</p>
    <p><b>Вартість рівня</b> залежить від базової вартості вміння (2–10) і зростає з рівнем за таблицею вартості.</p>
    <p><b>Фіксація розвитку.</b> Вкачане можна скасувати й повернути очки, доки розвиток не зафіксовано кнопкою «Зафіксувати».
      Після цього знизити рівні може лише майстер (Shift+клік).</p>
    <p><b>Особливі вміння</b> додає майстер у будь-яку гілку: назва, вартість і максимум — довільні.</p>`],
  ['Ухилення, вага, ініціатива', `
    <p><b>ШУ:</b> база = поточна витривалість / 10. Навантаження (вага одягненого і зброї в руках) від бази:
      ≤25% → 8, ≤50% → 6, ≤75% → 3, &lt;100% → 2, більше → 0. Плюс рівень «Ухиляння», ефекти й правка майстра.</p>
    <p><b>Максимальна вага:</b> 20 + 5 за рівень «Мул» + бонус рюкзака (або власний максимум від майстра).</p>
    <p><b>Швидкість:</b> 3 + рівень «Спринту». <b>Ініціатива:</b> поточна витривалість / 100, з округленням донизу.</p>`],
])

// ── Макроси ─────────────────────────────────────────────────────────────────
const macros = [
  ['Панель кидків', 'game.god.diceTray()', I('weapons', 'staff')],
  ['Панель персонажа', 'game.god.hud()', I('misc', 'character')],
  ['Видати досвід', 'game.god.awardXp()', I('misc', 'ability')],
  ['Відновити броню', 'game.god.repairArmor()', I('armor', 'cuirass')],
  ['Завдати урону', 'game.god.applyDamagePrompt()', I('status', 'bleeding')],
].map(([name, command, img], i) => {
  const _id = id('macro:' + name)
  return { _id, _key: `!macros!${_id}`, name, type: 'script', img, command, scope: 'global', folder: null, sort: i * 100,
    ownership: { default: 0 }, flags: {}, author: null, _stats: STATS }
})

// ── Запис і компіляція ──────────────────────────────────────────────────────
const packs = { arsenal: [...Object.values(folders), ...items], rules: journals, macros }
rmSync(SRC, { recursive: true, force: true })
for (const [name, docs] of Object.entries(packs)) {
  mkdirSync(`${SRC}/${name}`, { recursive: true })
  for (const d of docs) writeFileSync(`${SRC}/${name}/${d._id}.json`, JSON.stringify(d, null, 2))
  rmSync(`${OUT}/${name}`, { recursive: true, force: true })
  await compilePack(`${SRC}/${name}`, `${OUT}/${name}`, { log: false })
  console.log(`✓ ${name}: ${docs.length} документів`)
}
