/**
 * True when Escape should stay in the focused field to clear its text first:
 * a text-like input that holds text. Radios and checkboxes always carry a
 * value, so they never keep Escape and the dialog closes.
 */
const TEXT_TYPES: ReadonlySet<string> = new Set(['text', 'search'])

export function escapeClearsField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && TEXT_TYPES.has(target.type) && target.value !== ''
}
