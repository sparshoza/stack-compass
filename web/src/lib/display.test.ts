import { describe, expect, it } from 'vitest'
import { kb } from './kb'
import { languageName, layerName } from './display'

describe('display names', () => {
  it('names every vocabulary language', () => {
    for (const id of kb.vocab.languages) expect(languageName(id)).not.toBe(id)
    expect(languageName('csharp')).toBe('C#')
  })

  it('capitalises layer labels without changing acronyms', () => {
    expect(layerName('backend')).toBe('Backend')
    expect(layerName('ui-kit')).toBe('UI kit')
    expect(layerName('ci-cd')).toBe('CI/CD')
  })
})
