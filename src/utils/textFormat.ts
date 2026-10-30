/**
 * Tracks hardware CapsLock state globally and formats text inputs:
 * - When Caps Lock is ON: ALL CAPITAL LETTERS (e.g. "RAMESH KUMAR")
 * - When Caps Lock is OFF: Word-by-word Title Case — First letter Capital, rest small (e.g. "Ramesh Kumar")
 */

let capsLockState = false;

export function isCapsLockActive(): boolean {
  return capsLockState;
}

export function setCapsLockActive(active: boolean): void {
  if (capsLockState !== active) {
    capsLockState = active;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('capslockchange', { detail: { capsLockOn: capsLockState } })
      );
    }
  }
}

/**
 * Formats a string based on active Caps Lock state:
 * - If Caps Lock is ON -> ALL CAPS ("RAMESH KUMAR ")
 * - If Caps Lock is OFF -> Title Case per word ("Ramesh Kumar ")
 */
export function toTitleCaseWords(value: string): string {
  if (!value || typeof value !== 'string') return value;
  if (capsLockState) {
    return value.toUpperCase();
  }
  return value.replace(/\S+/g, (word) => {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

const EXCLUDED_INPUT_TYPES = new Set([
  'password',
  'email',
  'number',
  'tel',
  'url',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
  'color',
  'file',
  'checkbox',
  'radio',
  'range',
  'hidden',
  'submit',
  'button',
  'reset'
]);

const EXCLUDED_FIELD_PATTERNS = [
  /\bsku\b/i,
  /\bhsn\b/i,
  /\bgst/i,
  /\bgstin\b/i,
  /\bemail\b/i,
  /\be-mail\b/i,
  /\bupi\b/i,
  /\bpassword\b/i,
  /\bpasscode\b/i,
  /\bpin\b/i,
  /\bifsc\b/i,
  /\bpan\b/i,
  /\bserial\b/i,
  /\best-\d/i,
  /\bbarcode\b/i,
  /\bwebsite\b/i,
  /@/
];

/**
 * Determines whether an input or textarea element should be excluded from
 * automatic Title Case / Caps formatting (e.g., SKU, HSN, GSTIN, Email, UPI, Password).
 */
export function shouldExcludeFromTitleCase(
  el: HTMLInputElement | HTMLTextAreaElement
): boolean {
  if (!el || el.readOnly || el.disabled) return true;
  if (el.dataset?.noTitlecase === 'true') return true;

  if (el instanceof HTMLInputElement) {
    const inputType = (el.type || 'text').toLowerCase();
    if (EXCLUDED_INPUT_TYPES.has(inputType)) {
      return true;
    }
  }

  // Respect explicit uppercase utility classes (used on GSTIN, IFSC, PAN, SKU fields)
  if (el.classList && el.classList.contains('uppercase')) {
    return true;
  }

  const descriptorText = [
    el.name || '',
    el.id || '',
    el.placeholder || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('autocomplete') || ''
  ].join(' ');

  if (EXCLUDED_FIELD_PATTERNS.some((pattern) => pattern.test(descriptorText))) {
    return true;
  }

  return false;
}

/**
 * Global capture-phase input & keyboard handler:
 * - Tracks hardware CapsLock state via getModifierState('CapsLock')
 * - When Caps Lock is ON, formats eligible text inputs as ALL CAPS
 * - When Caps Lock is OFF, formats eligible text inputs as Title Case (First letter Capital, rest small)
 * - Preserves cursor caret position (selectionStart / selectionEnd)
 */
export function installGlobalTitleCaseListener(): () => void {
  if (typeof document === 'undefined') return () => {};

  const syncCapsLockFromKeyboard = (event: KeyboardEvent | MouseEvent) => {
    try {
      if (typeof event.getModifierState === 'function') {
        const modifierCaps = event.getModifierState('CapsLock');
        setCapsLockActive(modifierCaps);
      }
    } catch {
      // Ignore if getModifierState is unavailable
    }
  };

  const handleInputCapture = (event: Event) => {
    const inputEvent = event as InputEvent;
    if (inputEvent.isComposing) return;

    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement)
    ) {
      return;
    }

    if (shouldExcludeFromTitleCase(target)) {
      return;
    }

    const originalValue = target.value;
    if (!originalValue) return;

    const formattedValue = toTitleCaseWords(originalValue);
    if (formattedValue === originalValue) return;

    const selectionStart = target.selectionStart;
    const selectionEnd = target.selectionEnd;

    const prototype =
      target instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      prototype,
      'value'
    )?.set;

    if (nativeValueSetter) {
      nativeValueSetter.call(target, formattedValue);
    } else {
      target.value = formattedValue;
    }

    try {
      if (selectionStart !== null && selectionEnd !== null) {
        target.setSelectionRange(selectionStart, selectionEnd);
      }
    } catch {
      // Ignore selection range errors on unsupported input types
    }
  };

  window.addEventListener('keydown', syncCapsLockFromKeyboard, true);
  window.addEventListener('keyup', syncCapsLockFromKeyboard, true);
  window.addEventListener('mousedown', syncCapsLockFromKeyboard, true);
  document.addEventListener('input', handleInputCapture, true);

  return () => {
    window.removeEventListener('keydown', syncCapsLockFromKeyboard, true);
    window.removeEventListener('keyup', syncCapsLockFromKeyboard, true);
    window.removeEventListener('mousedown', syncCapsLockFromKeyboard, true);
    document.removeEventListener('input', handleInputCapture, true);
  };
}
