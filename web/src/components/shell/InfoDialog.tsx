import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { kb } from '@/lib/kb'
import { REPO_URL, WHICHDB_URL } from '@/lib/links'

interface InfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const link = 'text-text underline decoration-line-strong underline-offset-4 hover:decoration-text'

export function InfoDialog({ open, onOpenChange }: InfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-6 text-[0.8125rem] sm:max-w-md">
        <DialogHeader className="gap-2">
          <DialogTitle className="text-[1rem] font-semibold">About Stack Compass</DialogTitle>
          <DialogDescription className="text-text-muted">
            One tool per layer for the project you describe, shown on a map of {kb.tools.length} tools
            across {kb.layers.length} layers.
          </DialogDescription>
        </DialogHeader>
        <p>
          Picks come from fixed rules over a hand-checked catalog, so the same answers always give the
          same stack. Every tool links to its official site and shows the date it was last checked.
          Nothing you type leaves your browser.
        </p>
        <p>
          The map layout is inspired by{' '}
          <a className={link} href={WHICHDB_URL} target="_blank" rel="noreferrer">
            WhichDB
          </a>
          . Source code and corrections live on{' '}
          <a className={link} href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  )
}
