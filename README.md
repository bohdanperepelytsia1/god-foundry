# G.O.D. для Foundry VTT

Ігрова система G.O.D. (темне фентезі) для Foundry VTT v13–v14: лист персонажа і НІП, бій за правилами v4.5, магія шкіл, інвентар, швидка панель, панель кидків.

Сама система лежить у теці [`god/`](god/) — там і повний опис можливостей: [god/README.md](god/README.md).

## Встановлення
Скопіюй теку `god` у `Data/systems/` свого Foundry (вийде `Data/systems/god/system.json`) і перезапусти сервер.

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
