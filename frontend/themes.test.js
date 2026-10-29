import test from 'node:test';
import assert from 'node:assert/strict';
import { themes, validTheme, loadTheme, themeStorageKey } from './themes.js';

test('a saved room is restored for every supported theme', () => {
  for (const theme of Object.keys(themes)) {
    assert.equal(loadTheme({ getItem(key) { assert.equal(key, themeStorageKey); return theme; } }), theme);
  }
});

test('missing, obsolete and prototype names fall back to the original room', () => {
  for (const value of [null, undefined, '', 'old-room', 'constructor', '__proto__', 'toString']) {
    assert.equal(validTheme(value), 'classic');
    assert.equal(loadTheme({ getItem() { return value; } }), 'classic');
  }
});

test('storage being blocked does not prevent opening the gallery', () => {
  assert.equal(loadTheme({ getItem() { throw new Error('storage denied'); } }), 'classic');
});
