import { useEffect, useState } from 'react'
import { MaximizeIcon, MinimizeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Phone-only fullscreen toggle over the map. Hidden where the API is missing (iPhone Safari). */
export function FullscreenButton() {
  const [supported] = useState(() => typeof document !== 'undefined' && document.fullscreenEnabled === true)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!supported) return
    const sync = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [supported])

  if (!supported) return null

  return (
    <Button
      variant="pill"
      size="icon-pill"
      className="absolute top-36 right-4 md:hidden"
      aria-label={active ? 'Exit fullscreen' : 'Fullscreen'}
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
      }}
    >
      {active ? <MinimizeIcon aria-hidden="true" /> : <MaximizeIcon aria-hidden="true" />}
    </Button>
  )
}
