import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button'

describe('buttonVariants touch targets', () => {
  // `touch:` covers screens under 1024px and any coarse pointer, so a tablet
  // or a touch laptop gets 44px targets too, not only phones.
  it('pill and icon pill grow to 44px through the touch variant', () => {
    expect(buttonVariants({ size: 'pill' })).toContain('touch:h-11')
    expect(buttonVariants({ size: 'icon-pill' })).toContain('touch:size-11')
    expect(buttonVariants({ size: 'pill' })).not.toContain('max-md:')
  })
})
