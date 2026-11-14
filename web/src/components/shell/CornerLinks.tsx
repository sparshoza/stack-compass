import { MessageSquareTextIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { REPORT_ISSUE_BODY, WHICHDB_URL, newIssueUrl } from '@/lib/links'
import { cn } from '@/lib/utils'

interface CornerLinksProps {
  /**
   * Over the map the links float in the bottom corners. In the table view
   * they sit after the last row instead, so they never cover a row.
   */
  docked?: boolean
}

/** Bottom corners: the WhichDB credit on the left, "Report an issue" on the right. */
export function CornerLinks({ docked = false }: CornerLinksProps) {
  return (
    <footer
      className={cn(
        'flex items-end justify-between gap-3',
        docked
          ? 'pt-6'
          : 'pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-3 md:px-6 md:pb-4',
      )}
    >
      <a
        href={WHICHDB_URL}
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto inline-flex min-h-11 items-center md:min-h-9"
      >
        <span className="inline-flex items-center gap-[0.5ch] rounded-full bg-background/85 px-2 py-1 text-xs text-text-muted hover:text-text">
          Inspired by <span className="underline decoration-line-strong underline-offset-4">WhichDB</span>
        </span>
      </a>
      <a
        href={newIssueUrl('Catalog correction', REPORT_ISSUE_BODY)}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'pointer-events-auto')}
      >
        <MessageSquareTextIcon aria-hidden="true" />
        Report an issue
      </a>
    </footer>
  )
}
