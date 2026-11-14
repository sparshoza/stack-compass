import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface HelpSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Side sheet from 1024px, full width and height below. */
export function HelpSheet({ open, onOpenChange }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:lg:w-[440px]"
      >
        <SheetHeader className="gap-2 p-6 pr-14">
          <SheetTitle className="text-[1rem] font-semibold">Help me choose</SheetTitle>
          <SheetDescription className="text-[0.8125rem] text-text-muted">
            Describe what you are building or answer a few one-click questions. You get one pick per
            layer, with the reasons.
          </SheetDescription>
        </SheetHeader>
        {/* TODO: the describe box, questions and results replace this note in the recommender build. */}
        <p className="mx-6 rounded-[var(--radius-sm)] bg-raised px-4 py-3 text-[0.8125rem] text-text-muted">
          The questions arrive in the next build.
        </p>
      </SheetContent>
    </Sheet>
  )
}
