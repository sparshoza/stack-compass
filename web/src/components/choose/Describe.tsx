import { useId, useState, type ReactNode, type RefObject } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EXAMPLES } from './examples'

interface DescribeProps {
  text: string
  onTextChange: (text: string) => void
  onRead: (text?: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** What was picked up, shown right under the box and above the examples. */
  detected: ReactNode
}

/**
 * The optional description. It is read on a pause in typing, on Read
 * description, or at once when an example fills it.
 */
export function Describe({ text, onTextChange, onRead, textareaRef, detected }: DescribeProps) {
  const id = useId()
  const [showExamples, setShowExamples] = useState(false)
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onRead()
      }}
    >
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-text">
        Describe it in your own words <span className="font-normal text-text-muted">(optional)</span>
      </label>
      <Textarea
        ref={textareaRef}
        id={id}
        rows={2}
        value={text}
        spellCheck={false}
        aria-describedby={`${id}-note`}
        placeholder="What are you building, and what must it do?"
        onChange={(e) => onTextChange(e.target.value)}
        className="min-h-[4.25rem] resize-y rounded-[var(--radius-sm)] border-line-field bg-background px-3 py-2.5 text-[1rem] leading-[1.5] text-text placeholder:text-text-faint hover:border-text-faint focus-visible:border-text-faint focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight md:text-[0.875rem] dark:bg-background"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p id={`${id}-note`} className="text-xs text-text-muted">
          Read in your browser. It never goes into a link.
        </p>
        <Button type="submit" variant="pill" size="pill" className="h-8 px-3 text-xs touch:h-11">
          Read description
        </Button>
      </div>

      {detected}

      <div className="grid gap-1.5">
        <button
          type="button"
          aria-expanded={showExamples}
          aria-controls={`${id}-example-list`}
          onClick={() => setShowExamples((on) => !on)}
          className="-ml-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-2 text-xs text-text-muted hover:bg-raised hover:text-text touch:h-11"
        >
          <ChevronDownIcon aria-hidden="true" className={showExamples ? 'size-3.5' : 'size-3.5 -rotate-90'} />
          {showExamples ? 'Hide examples' : 'Show examples'}
        </button>
        <div id={`${id}-example-list`} role="group" aria-label="Examples" hidden={!showExamples}>
          <ul className="grid gap-1.5">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => onRead(example)}
                  className="w-full rounded-[var(--radius-sm)] border border-line px-3 py-2 text-left text-[0.8125rem] leading-[1.45] text-text-muted hover:border-line-strong hover:bg-raised hover:text-text active:bg-raised touch:min-h-11"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </form>
  )
}
