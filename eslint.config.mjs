import globals from 'globals'
export default [{
  files: ["god/**/*.mjs"], ignores: ["god/lib/**"],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser,
    foundry: 'readonly', game: 'readonly', ui: 'readonly', canvas: 'readonly', CONFIG: 'readonly', CONST: 'readonly', Hooks: 'readonly',
    Actor: 'readonly', Item: 'readonly', ChatMessage: 'readonly', Roll: 'readonly', Folder: 'readonly', Handlebars: 'readonly', PIXI: 'readonly',
    fromUuid: 'readonly', fromUuidSync: 'readonly', getDocumentClass: 'readonly', Sequence: 'readonly', Actors: 'readonly', Items: 'readonly',
    TextEditor: 'readonly', FilePicker: 'readonly', Macro: 'readonly', Combat: 'readonly', ActiveEffect: 'readonly', Token: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'off' },
}]
