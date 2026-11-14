import { useCallback, useEffect, useRef, type RefObject } from 'react'

/**
 * A closing sheet, dialog or popover plays a short exit before Radix unmounts
 * it, and Radix only moves focus on unmount. This calls `restore` as soon as
 * `open` turns false, so the keyboard is never held by a surface on its way
 * out. It only does so when focus would otherwise be lost: inside the closing
 * surface or nowhere. When focus has already gone elsewhere (another sheet or
 * dialog opened in its place), it stays there. Pass the returned handler as
 * onCloseAutoFocus: it stops Radix moving focus a second time when the exit
 * ends.
 */
export function useReturnFocusOnClose(
  open: boolean,
  restore: () => void,
  content: RefObject<HTMLElement | null>,
): (event: Event) => void {
  const wasOpen = useRef(open)
  const restoreRef = useRef(restore)
  useEffect(() => {
    restoreRef.current = restore
  }, [restore])
  useEffect(() => {
    if (wasOpen.current && !open) {
      const active = document.activeElement
      const lost = !active || active === document.body || !!content.current?.contains(active)
      if (lost) restoreRef.current()
    }
    wasOpen.current = open
  }, [open, content])
  return useCallback((event: Event) => event.preventDefault(), [])
}
