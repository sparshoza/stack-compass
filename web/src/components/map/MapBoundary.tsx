import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface MapBoundaryProps {
  onUseTable: () => void
  children: ReactNode
}

/** If the map code fails to load or start, offer the table instead of a blank screen. */
export class MapBoundary extends Component<MapBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="absolute inset-0 grid place-content-center justify-items-center gap-3 px-6 text-center">
        <p className="text-text">The map could not load.</p>
        <p className="max-w-sm text-text-muted">Reload the page to try again, or browse every tool in the table.</p>
        <Button variant="pill" size="pill" onClick={this.props.onUseTable}>
          Open the table
        </Button>
      </div>
    )
  }
}
