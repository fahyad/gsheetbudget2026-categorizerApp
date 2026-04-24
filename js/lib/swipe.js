// Per-row swipe gesture factory. Vanilla touch handlers — no dependency.
//
// attachSwipe(translateEl, { revealEl, onLeft, onRight, threshold = 0.40 })
//   - translateEl: the element whose transform changes during drag.
//   - revealEl: the element that receives .swiping / .reveal-left /
//     .reveal-right classes (so its ::before / ::after action backgrounds
//     can toggle visibility). Defaults to translateEl. Use a separate
//     revealEl when the action backgrounds live on a parent/wrapper that
//     must stay static while the inner content slides.
//
// Behaviour:
//   - touchmove updates transform: translateX(dx) and toggles reveal class.
//   - touchend: if |dx| / rowWidth >= threshold, animate off-screen and
//     call the appropriate callback. Otherwise spring back to 0.
//   - Short static tap falls through to the row's normal click handler.
//   - A first move where |dy| > |dx| * 1.5 aborts the swipe so vertical
//     scrolling isn't hijacked.
//
// Returns a detach() function that removes all listeners.

const TAP_DX_THRESHOLD_PX = 5;
const TAP_T_THRESHOLD_MS = 300;
const ABORT_ANGLE_RATIO = 1.5; // |dy| > |dx| * ratio → abort
const COMMIT_ANIM_MS = 180;

export function attachSwipe(translateEl, { revealEl, onLeft, onRight, threshold = 0.40 } = {}) {
  const reveal = revealEl || translateEl;

  let startX = 0;
  let startY = 0;
  let startT = 0;
  let dx = 0;
  let aborted = false;
  let direction = 0; // -1 left, 1 right, 0 none
  let dragging = false;

  function reset() {
    translateEl.style.transform = '';
    translateEl.style.transition = '';
    reveal.classList.remove('swiping', 'reveal-left', 'reveal-right');
    dx = 0;
    direction = 0;
    dragging = false;
    aborted = false;
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startT = Date.now();
    dx = 0;
    direction = 0;
    aborted = false;
    dragging = true;
    translateEl.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (!dragging || aborted) return;
    const t = e.touches[0];
    const rawDx = t.clientX - startX;
    const rawDy = t.clientY - startY;

    // First meaningful move determines intent: vertical scroll vs horizontal swipe.
    if (!reveal.classList.contains('swiping')) {
      if (Math.abs(rawDx) < 4 && Math.abs(rawDy) < 4) return; // still basically static
      if (Math.abs(rawDy) > Math.abs(rawDx) * ABORT_ANGLE_RATIO) {
        aborted = true;
        translateEl.style.transition = '';
        return;
      }
      reveal.classList.add('swiping');
    }

    dx = rawDx;
    direction = dx > 0 ? 1 : -1;

    reveal.classList.toggle('reveal-right', direction === 1);
    reveal.classList.toggle('reveal-left', direction === -1);
    translateEl.style.transform = `translateX(${dx}px)`;

    // Prevent default to stop the browser from scrolling horizontally
    // while we're clearly doing a horizontal swipe.
    if (e.cancelable) e.preventDefault();
  }

  function onTouchEnd() {
    if (!dragging) return;
    if (aborted) {
      reset();
      return;
    }

    const elapsed = Date.now() - startT;
    const absDx = Math.abs(dx);
    const wasTap = absDx < TAP_DX_THRESHOLD_PX && elapsed < TAP_T_THRESHOLD_MS;

    if (wasTap) {
      reset();
      // Let the normal click handler fire — browsers synthesize click
      // after touchend for short static presses.
      return;
    }

    const rowWidth = (revealEl || translateEl).getBoundingClientRect().width || 1;
    const ratio = absDx / rowWidth;

    if (ratio >= threshold && direction !== 0) {
      // Commit — animate off, then fire callback.
      const offX = direction > 0 ? rowWidth : -rowWidth;
      translateEl.style.transition = `transform ${COMMIT_ANIM_MS}ms ease-out, opacity ${COMMIT_ANIM_MS}ms ease-out`;
      translateEl.style.transform = `translateX(${offX}px)`;
      translateEl.style.opacity = '0';

      const cb = direction > 0 ? onRight : onLeft;
      setTimeout(() => {
        try { if (cb) cb(); } catch (err) { console.error('swipe callback failed:', err); }
      }, COMMIT_ANIM_MS);
    } else {
      // Spring back.
      translateEl.style.transition = `transform ${COMMIT_ANIM_MS}ms ease-out`;
      translateEl.style.transform = 'translateX(0)';
      setTimeout(() => { reveal.classList.remove('swiping', 'reveal-left', 'reveal-right'); }, COMMIT_ANIM_MS);
      dragging = false;
      dx = 0;
      direction = 0;
    }
  }

  function onTouchCancel() {
    reset();
  }

  translateEl.addEventListener('touchstart', onTouchStart, { passive: true });
  translateEl.addEventListener('touchmove', onTouchMove, { passive: false });
  translateEl.addEventListener('touchend', onTouchEnd);
  translateEl.addEventListener('touchcancel', onTouchCancel);

  return function detach() {
    translateEl.removeEventListener('touchstart', onTouchStart);
    translateEl.removeEventListener('touchmove', onTouchMove);
    translateEl.removeEventListener('touchend', onTouchEnd);
    translateEl.removeEventListener('touchcancel', onTouchCancel);
  };
}
