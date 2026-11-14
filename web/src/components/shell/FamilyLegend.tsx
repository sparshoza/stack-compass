import { Fragment } from 'react'
import { FAMILIES, familyColor } from '@/lib/families'

/** The five layer families with their colours and the layers in each. */
export function FamilyLegend() {
  return (
    <ul className="grid gap-2.5">
      {FAMILIES.map((family) => (
        <li key={family.id} className="grid grid-cols-[0.625rem_1fr] items-baseline gap-x-2.5">
          <span
            aria-hidden="true"
            className="size-2.5 translate-y-px rounded-full"
            style={{ background: familyColor(family.id) }}
          />
          <span className="text-text">{family.label}</span>
          <span className="col-start-2 text-xs text-text-muted">
            {family.layers.map((layer, i) => (
              <Fragment key={layer}>
                <span className="whitespace-nowrap">
                  {layer}
                  {i < family.layers.length - 1 ? ',' : ''}
                </span>{' '}
              </Fragment>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}
