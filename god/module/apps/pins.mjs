/**
 * Закріплені вікна: вікно зі "шпилькою" пам'ятає позицію й розмір і саме
 * відкривається після перезавантаження сторінки. Зберігається в клієнтських
 * налаштуваннях — у кожного гравця свої закріплення.
 */
const KEY = 'pinned'

export function registerPinSettings() {
  game.settings.register('god', KEY, { scope: 'client', config: false, type: Object, default: {} })
}

export const Pins = {
  all: () => foundry.utils.deepClone(game.settings.get('god', KEY) ?? {}),
  get: id => Pins.all()[id] ?? null,
  async set(id, data) {
    const all = Pins.all()
    if (data) all[id] = data; else delete all[id]
    return game.settings.set('god', KEY, all)
  },
}

/** Додає вікну ApplicationV2 вміння закріплюватись */
export const PinnableMixin = Base => class extends Base {
  /** Дані, які треба відновити разом із вікном (напр. id актора) */
  _pinData() { return {} }
  get isPinned() { return !!Pins.get(this.id) }

  async togglePin() {
    if (this.isPinned) await Pins.set(this.id, null)
    else await Pins.set(this.id, { ...this._pinData(), position: this._pinPosition() })
    this.element?.classList.toggle('god-pinned', this.isPinned)
    this.render()
  }

  _pinPosition() {
    const { left, top, width, height } = this.position
    return { left, top, width, height: typeof height === 'number' ? height : undefined }
  }

  setPosition(position) {
    const out = super.setPosition(position)
    // Пересунули закріплене вікно — запам'ятовуємо нову позицію (з затримкою, без спаму в налаштування)
    if (this.isPinned && this.rendered) {
      clearTimeout(this._pinSave)
      this._pinSave = setTimeout(() => Pins.set(this.id, { ...this._pinData(), position: this._pinPosition() }), 400)
    }
    return out
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this.element.classList.toggle('god-pinned', this.isPinned)
  }

  /** Закрили вручну — отже, закріплення більше не потрібне */
  _onClose(options) {
    super._onClose(options)
    if (this.isPinned) Pins.set(this.id, null)
  }
}
