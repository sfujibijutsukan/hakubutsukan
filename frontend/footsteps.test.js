import test from 'node:test';
import assert from 'node:assert/strict';
import { TatamiFootsteps } from './footsteps.js';

function walker() {
  const sound = new TatamiFootsteps();
  sound.context = { state: 'running' };
  let count = 0; sound.play = () => count++;
  sound.setEnabled(true);
  return { sound, count: () => count };
}

test('footsteps follow distance rather than animation frame rate', () => {
  for (const frames of [30, 60, 120]) {
    const { sound, count } = walker();
    for (let i = 0; i < frames; i++) sound.advance(2.7 / frames);
    assert.equal(count(), 3);
  }
});

test('idle, rotation and collision without travel stay silent; walking can restart', () => {
  const { sound, count } = walker();
  for (let i = 0; i < 100; i++) sound.advance(0);
  assert.equal(count(), 0);
  sound.advance(.05); assert.equal(count(), 1);
  sound.advance(0); sound.advance(.05); assert.equal(count(), 2);
});

test('other themes, mute and suspended audio suppress steps and reset stride', () => {
  const { sound, count } = walker();
  sound.advance(.05); sound.setEnabled(false);
  for (let i = 0; i < 100; i++) sound.advance(.05);
  assert.equal(count(), 1);
  sound.setEnabled(true); sound.context.state = 'suspended'; sound.advance(.1);
  assert.equal(count(), 1);
  sound.context.state = 'running'; sound.advance(.05); assert.equal(count(), 2);
});

test('audio is lazy and unavailable audio does not break movement', () => {
  let attempts = 0;
  const sound = new TatamiFootsteps(() => { attempts++; throw new Error('unavailable'); });
  sound.unlock(); assert.equal(attempts, 0);
  sound.setEnabled(true); assert.doesNotThrow(() => sound.unlock());
  assert.equal(attempts, 1); assert.doesNotThrow(() => sound.advance(.05));
});
