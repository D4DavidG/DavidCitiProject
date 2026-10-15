import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw' // the file's text, through Vite

const page = new DOMParser().parseFromString(html, 'text/html')
const fontSheets = [...page.querySelectorAll('link[rel="stylesheet"]')].filter((link) => link.href.includes('fonts.googleapis.com'))

describe('index.html', () => {
  it('loads Inter without holding up the first paint: if Google Fonts never answers, the page draws in the system font', () => {
    const loading = fontSheets.filter((link) => !link.closest('noscript'))
    expect(loading).toHaveLength(1)
    expect(loading[0].getAttribute('media')).toBe('print') // a print sheet does not block the screen
    expect(loading[0].getAttribute('onload')).toBe("this.media='all'") // and turns on once it arrives
  })

  it('keeps a plain link for a browser without JavaScript', () => {
    expect(fontSheets.filter((link) => link.closest('noscript'))).toHaveLength(1)
  })
})
