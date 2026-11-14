import { useId } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Route } from '@/engine/path'
import type { Tool } from '@/lib/kb'
import { cn } from '@/lib/utils'

interface RouteCardProps {
  from: Tool
  to: Tool
  /** The shortest routes from `from` to `to`; empty when they are not connected. */
  routes: readonly Route[]
  onClose: () => void
  /** `float`: over the map, its list scrolls within the height it is given. `inline`: inside the tool panel. */
  placement?: 'float' | 'inline'
  className?: string
}

function summary(routes: readonly Route[]): string {
  const steps = routes[0].steps.length
  if (routes.length === 1) return steps === 1 ? 'Directly, in one step.' : `${steps} steps.`
  return `${routes.length} routes, ${steps} ${steps === 1 ? 'step' : 'steps'} each.`
}

function via(route: Route): string {
  const others = route.nodes.length - 2
  if (others === 0) return 'Directly'
  return `Through ${others} other ${others === 1 ? 'tool' : 'tools'}`
}

/**
 * How two tools connect: each of the shortest routes between them, one
 * relation per line in plain words. A small floating card over the map, not
 * a dialog: the map and the tool panel stay usable while it shows.
 */
export function RouteCard({ from, to, routes, onClose, placement = 'float', className }: RouteCardProps) {
  const float = placement === 'float'
  const headingId = useId()
  const title = `How ${from.name} connects to ${to.name}`
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'pointer-events-auto grid rounded-[var(--radius-panel)] border border-line bg-surface text-[0.8125rem] text-text',
        float ? 'max-h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] shadow-(--shadow-float)' : '',
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
        {routes.length === 0 ? (
          <div className="grid gap-1">
            <p className="text-text">
              No direct route between {from.name} and {to.name}
            </p>
            <p className="text-xs text-text-muted">The catalog relates them through no other tools either.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-muted">{summary(routes)}</p>
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
          </>
        )}
      </div>
    </section>
  )
}
