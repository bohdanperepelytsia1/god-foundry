# G.O.D. для Foundry VTT

Ігрова система G.O.D. (темне фентезі) для Foundry VTT v13–v14: лист персонажа і НІП, бій за правилами v4.5, магія шкіл, інвентар, швидка панель, панель кидків.

Сама система лежить у теці [`god/`](god/) — там і повний опис можливостей: [god/README.md](god/README.md).

## Встановлення
**За посиланням (рекомендовано):** Foundry → *Game Systems* → *Install System* → у полі *Manifest URL* встав

```
https://github.com/bohdanperepelytsia1/god-foundry/releases/latest/download/system.json
```

і натисни *Install*. Нові версії з'являтимуться там само кнопкою *Update*.

**Вручну:** скачай `god.zip` з [останнього релізу](https://github.com/bohdanperepelytsia1/god-foundry/releases/latest) і розпакуй у `Data/systems/god/`.

## Випуск нової версії
1. Підняти `version` у `god/system.json` і `package.json`.
2. Закомітити й запушити в `main`.
3. На GitHub: *Releases* → *Draft a new release* → тег `vX.Y.Z` (той самий, що у `system.json`) → *Publish*.
4. GitHub Actions прожене тести, збере `god.zip` і прикріпить його разом із `system.json` до релізу — Foundry побачить оновлення.

## Розробка
```bash
npm install          # handlebars і foundryvtt-cli для тестів і збірки компендіумів
npm test             # правила, бій, інвентар, синхронізація ресурсів, рендер усіх шаблонів
npm run build:packs  # перезібрати компендіуми з build/packs.mjs
```

| Тека | Що там |
|---|---|
| `god/` | система: `system.json`, модулі, шаблони, стилі, іконки, шрифти, компендіуми |
| `build/` | генератор компендіумів (зброя, броня, довідник, макроси) |
| `tests/` | тести без Foundry: моки API + справжній Handlebars |

## Ліцензії ресурсів
Іконки — game-icons.net (CC BY 3.0), шрифти Montserrat і Rubik (SIL OFL 1.1). Деталі — у [god/README.md](god/README.md).
