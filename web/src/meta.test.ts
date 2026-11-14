import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(join(resolve(import.meta.dirname), '..', 'index.html'), 'utf8')
const meta = (attr: 'property' | 'name', key: string) =>
  html.match(new RegExp(`<meta[ ]+${attr}="${key}"[ ]+content="([^"]*)"`))?.[1]

describe('index.html', () => {
  it('has Open Graph and Twitter card tags that match the title and description', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]
    const description = html.match(/name="description"\s+content="([^"]*)"/)?.[1]
    expect(meta('property', 'og:title')).toBe(title)
    expect(meta('property', 'og:description')).toBe(description)
    expect(meta('property', 'og:type')).toBe('website')
    expect(meta('property', 'og:site_name')).toBe('Stack Compass')
    expect(meta('name', 'twitter:card')).toBe('summary')
    expect(meta('name', 'twitter:title')).toBe(title)
    expect(meta('name', 'twitter:description')).toBe(description)
    // No image and no canonical URL until the site is deployed.
    expect(html).not.toMatch(/og:image|og:url|twitter:image/)
  })
})
