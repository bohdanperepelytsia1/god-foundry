/**
 * Моделі даних предметів. Усе, що носить персонаж, — Item: так база майстра стає
 * компендіумом, видача — перетягуванням, а «одягнути/зняти» — лише прапорцем
 * equipped. Предмет ніколи не покидає інвентар, тому при заміні нічого не губиться.
 */
import { GOD } from '../config.mjs'

const f = foundry.data.fields
const int = (initial = 0, opts = {}) => new f.NumberField({ required: true, integer: true, initial, ...opts })
const flt = (initial = 0, opts = {}) => new f.NumberField({ required: true, initial, ...opts })
const choice = (choices, initial) => new f.StringField({ required: true, choices, initial })

const physical = () => ({
  description: new f.HTMLField({ initial: '' }),
  quantity: int(1, { min: 0 }),
  weight: flt(0, { min: 0 }),                       // вага за одиницю
  price: new f.SchemaField(Object.fromEntries(Object.keys(GOD.MONEY).map(k => [k, int(0, { min: 0 })]))),
  location: choice(Object.keys(GOD.INVENTORY_LOCATIONS), 'main'),
  equipped: new f.BooleanField({ initial: false }),
  isMagic: new f.BooleanField({ initial: false }),
  isCursed: new f.BooleanField({ initial: false }),
  isBlessed: new f.BooleanField({ initial: false }),
  spellStatMult: new f.BooleanField({ initial: false }),   // «Великий кодекс мага»: урон ×(школа+МОДІНТ+МОДМУД)
})

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      category: choice(Object.keys(GOD.WEAPON_CATEGORIES), 'onehand'),
      phys: int(0),
      mag: int(0),
      hand: choice(['main', 'off'], 'main'),   // основна рука отримує бонус Сили
      range: int(1, { min: 0 }),
      twoHanded: new f.BooleanField({ initial: false }),
    }
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      slot: choice(Object.keys(GOD.ARMOR_SLOTS), 'Кираса'),
      armorClass: choice(Object.keys(GOD.ARMOR_CLASSES), 'none'),
      phys: int(0),
      mag: int(0),
      beltSlots: int(0, { min: 0 }),   // лише для слота «Пояс»
      bagBonus: flt(0, { min: 0 }),    // лише для слота «Рюкзак»
    }
  }
}

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      // Розхідне (зілля, їжа, бинти): «Використати» відновлює ресурси і списує 1 шт
      consumable: new f.BooleanField({ initial: false }),
      restore: new f.SchemaField(Object.fromEntries(['hp', 'mp', 'ed', 'mt', 'pr', 'mr'].map(k => [k, int(0)]))),
    }
  }
}

export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new f.HTMLField({ initial: '' }),
      upgrades: new f.HTMLField({ initial: '' }),       // покращення 2–5 рівнів
      school: choice(Object.keys(GOD.SPELL_SCHOOLS), 'fire'),
      level: int(1, { min: 1, max: 10 }),
      threshold: int(6, { min: 1, max: 20 }),          // ПППС
      castTime: new f.StringField({ initial: '' }),    // OD
      manaCost: int(0, { min: 0 }),                    // OM
      staminaCost: int(0, { min: 0 }),                 // ВС
      cooldown: new f.StringField({ initial: '' }),    // CD
      castRange: int(0, { min: 0 }),
      attackType: choice(Object.keys(GOD.ATTACK_TYPES), 'target'),
      areaRadius: int(0, { min: 0 }),
      baseDamage: int(0, { min: 0 }),
      damageKind: choice(['mag', 'phys', 'none'], 'mag'),
    }
  }
}

export class AbilityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new f.HTMLField({ initial: '' }),
      manaCost: int(0, { min: 0 }),
      staminaCost: int(0, { min: 0 }),
      cooldown: new f.StringField({ initial: '' }),
    }
  }
}

/** Риси й особливості персонажа — окремий тип, щоб їх можна було класти в компендіум */
export class TraitData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new f.HTMLField({ initial: '' }),
      kind: choice(['trait', 'quirk'], 'trait'),
      cost: new f.StringField({ initial: '' }),   // вартість у очках створення — як на сайті, довільний текст ("+3", "−2")
    }
  }
}
