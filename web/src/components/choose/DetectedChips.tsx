import { XIcon } from 'lucide-react'
import type { Chip } from './detection'

interface DetectedChipsProps {
  chips: Chip[]
  nothingFound: boolean
  onRemove: (key: string) => void
}

/** What the description set, each removable; or a plain note that nothing was recognised. */
export function DetectedChips({ chips, nothingFound, onRemove }: DetectedChipsProps) {
  return (
    <div aria-live="polite">
      {chips.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-[0.8125rem] text-text">
            We picked up:
          </p>
          <ul aria-label="Picked up from your description" className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li
                key={chip.key}
                className="inline-flex h-8 items-center gap-0.5 rounded-full border border-line-strong bg-raised pl-3 text-xs text-text touch:h-11"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${chip.label}`}
                  onClick={() => onRemove(chip.key)}
                  className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface hover:text-text active:bg-surface touch:size-11"
                >
                  <XIcon aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {chips.flatMap((chip) => (chip.note ? [chip] : [])).map((chip) => (
            <p key={chip.key} className="text-[0.8125rem] text-text-muted">
              {chip.note}
            </p>
          ))}
        </div>
      ) : (
        nothingFound && (
          <p className="rounded-[var(--radius-sm)] bg-raised px-3 py-2.5 text-[0.8125rem] text-text-muted">
            We did not recognise anything specific. Pick what you are building above, or try other words.
          </p>
        )
      )}
    </div>
  )
}
