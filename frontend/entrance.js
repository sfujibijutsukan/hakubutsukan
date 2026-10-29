// Keep the opening presentation independent of WebGL and catalog availability.
export function createEntrance({ reduced = false, onEnter = () => {} } = {}) {
  const entrance = document.getElementById('entrance');
  const content = document.getElementById('museum-content');
  const button = document.getElementById('entrance-enter');
  let active = true, leaving = false, ready = false;
  const minimum = reduced ? 1400 : 2200;
  const openedAt = performance.now();
  const timers = new Set();
  const later = (callback, delay) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
  };

  function enter() {
    if (leaving || !active) return;
    leaving = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    entrance.classList.add('is-leaving');
    // No input reaches the room until the doors have finished opening.
    later(() => {
      active = false; entrance.hidden = true; content.inert = false;
      document.body.classList.remove('is-entering');
      document.removeEventListener('keydown', keydown, true);
      document.getElementById('scene').focus({ preventScroll: true });
      onEnter();
    }, reduced ? 160 : 900);
  }
  function keydown(event) {
    if (!active) return;
    if (event.key === 'Escape' || (event.key === 'Enter' && event.target === button)) {
      event.preventDefault(); event.stopImmediatePropagation(); enter();
    } else if (event.key === 'Tab') {
      const links = [...entrance.querySelectorAll('button, a[href]')];
      const first = links[0], last = links.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  button.onclick = enter;
  document.addEventListener('keydown', keydown, true);
  button.focus({ preventScroll: true });
  // A slow or failed renderer/request must never trap visitors behind the logo.
  later(enter, 5500);
  later(() => { if (ready) enter(); }, minimum);
  return {
    get active() { return active; },
    ready() {
      if (!active || ready) return;
      ready = true;
      if (performance.now() - openedAt >= minimum) enter();
    },
  };
}
