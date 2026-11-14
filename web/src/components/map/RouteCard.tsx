import { useId } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Connection, Route } from '@/engine/path'
import { toolById, type Tool } from '@/lib/kb'
import { cn } from '@/lib/utils'

interface RouteCardProps {
  from: Tool
  to: Tool
  /** How the two connect (see engine/path `connect`). */
  connection: Connection
  onClose: () => void
  /** `float`: over the map, its list scrolls within the height it is given. `inline`: inside the tool panel. */
  placement?: 'float' | 'inline'
  className?: string
}

/** Most shared partners named in "Both work with ..."; the rest are counted. */
const SHARED_NAMED = 5

function summary(routes: readonly Route[]): string {
  const steps = routes[0].steps.length
  if (routes.length === 1) return steps === 1 ? 'Directly related.' : `${steps} steps.`
  return `${routes.length} routes, ${steps} steps each.`
}

function via(route: Route): string {
  const others = route.nodes.length - 2
  if (others === 0) return 'Directly'
  return `Through ${others} other ${others === 1 ? 'tool' : 'tools'}`
}

function sharedLine(ids: readonly string[]): string {
  const names = ids.slice(0, SHARED_NAMED).map((id) => toolById(id)?.name ?? id)
  const rest = ids.length - names.length
  const list = rest > 0 ? `${names.join(', ')} and ${rest} more` : names.join(', ')
  return `Both work with ${ids.length} ${ids.length === 1 ? 'tool' : 'tools'}: ${list}.`
}

/**
 * How two tools connect: whether they are alternatives, then the best of the
 * shortest routes between them, one relation per line in plain words, and the
 * tools both work with. A small card over the map (or at the top of the tool
 * panel), not a dialog: the map and the panel stay usable while it shows.
 */
export function RouteCard({ from, to, connection, onClose, placement = 'float', className }: RouteCardProps) {
  const float = placement === 'float'
  const headingId = useId()
  const title = `How ${from.name} connects to ${to.name}`
  const { alternatives, routes, throughAlternatives, shared } = connection
  const twoSteps = routes.length > 0 && routes[0].steps.length === 2 && !throughAlternatives
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'pointer-events-auto grid rounded-[var(--radius-panel)] border border-line bg-surface text-[0.8125rem] text-text',
        float && 'max-h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] shadow-(--shadow-float)',
        className,
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <h2 id={headingId} className="min-w-0 flex-1 pt-1 text-[0.9375rem] leading-snug font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        <Button variant="quiet" size="icon-pill" className="-mt-1 -mr-2 shrink-0" onClick={onClose}>
          <XIcon aria-hidden="true" />
          <span className="sr-only">Clear route</span>
        </Button>
      </div>

      <div aria-live="polite" className={cn('grid content-start gap-3 px-4 pb-4', float && 'overflow-y-auto')}>
        {alternatives && (
          <p className="leading-snug">
            {from.name} and {to.name} are alternatives: projects usually pick one.
          </p>
        )}
        {!alternatives && routes.length === 0 && (
          <div className="grid gap-1">
            <p className="text-text">
              No close route between {from.name} and {to.name}
            </p>
            <p className="text-xs text-text-muted">The catalog does not relate them within three steps.</p>
          </div>
        )}
        {routes.length > 0 && (
          <>
            <p className="text-xs text-text-muted">
              {throughAlternatives ? 'Only through alternatives' : alternatives ? 'Shared partners:' : summary(routes)}
            </p>
            {routes.map((route) => (
              <ul
                key={route.nodes.join('>')}
                aria-label={via(route)}
                className="grid gap-1.5 border-t border-line pt-3 first-of-type:border-t-0 first-of-type:pt-0"
              >
                {route.steps.map((step) => (
                  <li key={`${step.from}>${step.to}`} className="leading-snug">
                    {step.text}
                  </li>
                ))}
              </ul>
            ))}
            {twoSteps && shared.length > 0 && (
              <p className="border-t border-line pt-3 text-xs leading-relaxed text-text-muted">{sharedLine(shared)}</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
