import { useRef, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { kb } from '@/lib/kb'
import { REPO_URL, WHICHDB_URL } from '@/lib/links'
import { useReturnFocusOnClose } from '@/lib/useReturnFocusOnClose'

interface InfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const link = 'text-text underline decoration-line-strong underline-offset-4 hover:decoration-text'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-[0.8125rem] font-semibold text-text">{title}</h3>
      {children}
    </section>
  )
}

/** About: how picks are made, where the facts come from, how to correct them, credits. */
export function InfoDialog({ open, onOpenChange }: InfoDialogProps) {
  // Focus goes back to what opened the dialog as soon as it starts to close.
  const returnTo = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const onCloseAutoFocus = useReturnFocusOnClose(open, () => {
    const target = returnTo.current
    returnTo.current = null
    if (target?.isConnected) target.focus()
  }, contentRef)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        // Runs before Radix moves focus in, so this is still the opener.
        onOpenAutoFocus={() => {
          returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 text-[0.8125rem] leading-[1.6] text-text-muted sm:max-w-lg">
        <DialogHeader className="gap-2 pr-8">
          <DialogTitle className="text-[1rem] font-semibold text-text">About Stack Compass</DialogTitle>
          <DialogDescription className="text-[0.8125rem] text-text-muted">
            A map of {kb.tools.length} tools across {kb.layers.length} layers. Help me choose builds a whole stack for
            your project, or finds one piece, such as a database.
          </DialogDescription>
        </DialogHeader>

        <Section title="How picks are made">
          <p>
            Describe your project or answer a few one-click questions. Phrases such as "realtime" or "no PHP" are
            matched against a fixed keyword list, in your browser. What you type is never sent anywhere and never
            goes into a shared link.
          </p>
          <p>
            Each layer your project needs is then scored by fixed rules. Tools that fail a hard filter drop out first:
            only languages you want to avoid, none of your preferred languages in a code layer, hosting you
            can't use, a paid-only tool on a free budget, or no fit with an earlier pick. The rest earn points for the features you asked for, for
            tools you already know, for pairing with earlier picks and for maturity. The same answers always give the
            same stack.
          </p>
          <p>
            One piece: pick a part, answer a few questions, and every tool that fits all your answers stays lit. Within
            a question any answer counts; across questions all must fit. Answers that would not change the list are not
            shown.
          </p>
          <p>
            Every pick shows why it won, its score and the close tools that were ruled out. Copy link puts your
            answers in the address, so the same stack opens for anyone you send it to.
          </p>
        </Section>

        <Section title="Where the facts come from">
          <p>
            Licence, languages, pricing and hosting for every tool come from its official site or docs. Open any tool
            on the map to see a link to that site and the date its facts were checked. Tools whose facts could not be
            confirmed are left out.
          </p>
        </Section>

        <Section title="Spot a mistake?">
          <p>
            Open the tool and choose Suggest an edit, or use Report an issue in the corner. Both open a pre-filled
            issue on GitHub.
          </p>
        </Section>

        <p className="border-t border-line pt-4">
          The map layout is inspired by{' '}
          <a className={link} href={WHICHDB_URL} target="_blank" rel="noreferrer">
            WhichDB
          </a>
          . The code and catalog are on{' '}
          <a className={link} href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  )
}
