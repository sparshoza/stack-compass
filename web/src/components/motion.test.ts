import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buttonVariants } from './ui/button'

const here = resolve(import.meta.dirname)
const source = (file: string) => readFileSync(join(here, file), 'utf8')

describe('motion classes on the surfaces that move', () => {
  it('buttons give a little on press instead of shifting down', () => {
    expect(buttonVariants()).toContain('motion-press')
    expect(buttonVariants()).not.toContain('translate-y-px')
  })

  it('the tool panel enters from its side and Help me choose from the other', () => {
    expect(source('map/ToolPanel.tsx')).toContain('motion-sheet-end')
    expect(source('choose/ChooseSheet.tsx')).toContain('motion-sheet-start')
  })

  it('dialogs and popovers grow from their origin, the scrim fades', () => {
    const dialog = source('ui/dialog.tsx')
    expect(dialog).toContain('motion-pop')
    expect(dialog).toContain('motion-fade')
    expect(source('ui/popover.tsx')).toContain('motion-pop')
  })

  it('toggles cross-fade their colours; radio groups (arrow keys) stay instant', () => {
    expect(source('map/FiltersPopover.tsx')).toContain('motion-colors')
    const questions = source('choose/Questions.tsx')
    expect(questions).toContain('motion-colors')
    expect(questions).toContain('motion-thumb')
    // Radio chips and the segmented control change on arrow keys: no motion there.
    const choice = questions.slice(questions.indexOf('function RadioPill'), questions.indexOf('function Segmented'))
    const segmented = questions.slice(questions.indexOf('function Segmented'), questions.indexOf('function Segmented') + 1500)
    expect(choice).not.toContain('motion-')
    expect(segmented).not.toContain('motion-')
  })

  it('the search box and its results never animate (typing and arrow keys)', () => {
    expect(source('map/SearchBox.tsx')).not.toContain('motion-')
  })

  it('closing sheets and dialogs hand focus back at once, not after their exit', () => {
    for (const file of ['map/ToolPanel.tsx', 'choose/ChooseSheet.tsx', 'map/InfoDialog.tsx', 'map/FiltersPopover.tsx']) {
      expect(source(file), file).toMatch(/useReturnFocusOnClose/)
    }
  })
})
