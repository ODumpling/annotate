// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderDescriptionHtml } from './markdown'

function firstBodyNode(html: string): Element {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.firstElementChild as Element
}

describe('description markdown subset', () => {
  it('renders the supported subset', () => {
    expect(renderDescriptionHtml('plain text')).toContain('<p>plain text</p>')
    expect(renderDescriptionHtml('*em* and _also_')).toContain('<em>em</em>')
    expect(renderDescriptionHtml('**strong** and __also__')).toContain(
      '<strong>strong</strong>',
    )
    expect(renderDescriptionHtml('use `inline` code')).toContain(
      '<code>inline</code>',
    )
    expect(renderDescriptionHtml('```\nfenced\n```')).toContain('<pre><code>')
    expect(renderDescriptionHtml('- one\n- two')).toContain('<ul>')
    expect(renderDescriptionHtml('1. one\n2. two')).toContain('<ol>')
    expect(renderDescriptionHtml('> quoted')).toContain('<blockquote>')
    expect(renderDescriptionHtml('first\nsecond')).toContain('<br>')
  })

  it('hardens links to the allowed protocols', () => {
    const link = firstBodyNode(
      renderDescriptionHtml('[site](https://example.com "Docs")'),
    ).querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(link?.getAttribute('title')).toBe('Docs')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link?.textContent).toBe('site')

    const http = firstBodyNode(renderDescriptionHtml('[a](http://x.example)'))
    expect(http.querySelector('a')?.getAttribute('href')).toBe(
      'http://x.example',
    )
    const mailto = firstBodyNode(
      renderDescriptionHtml('[mail](mailto:a@b.example)'),
    )
    expect(mailto.querySelector('a')?.getAttribute('href')).toBe(
      'mailto:a@b.example',
    )
  })

  it('strips disallowed link protocols', () => {
    const blocked = [
      'javascript:alert(1)',
      'javascript&#58;alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox',
      'ftp://x.example',
      '//x.example',
    ]
    for (const href of blocked) {
      const anchor = firstBodyNode(
        renderDescriptionHtml(`[x](${href})`),
      ).querySelector('a')
      expect(
        anchor?.getAttribute('href'),
        `href must be stripped: ${href}`,
      ).toBeNull()
    }
    const html = renderDescriptionHtml('[x](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('removes scripts, images, event handlers, and raw HTML', () => {
    const script = renderDescriptionHtml('<script>alert(1)</script>')
    expect(script).not.toContain('script')
    expect(script).not.toContain('alert')

    const image = renderDescriptionHtml('<img src=x onerror=alert(2)>')
    expect(image).not.toContain('img')
    expect(image).not.toContain('onerror')

    const styledLink = renderDescriptionHtml(
      '<a href="https://ok.example" onclick="steal()" style="color:red">x</a>',
    )
    expect(styledLink).not.toContain('onclick')
    expect(styledLink).not.toContain('style')
    expect(styledLink).toContain('href="https://ok.example"')
    expect(styledLink).toContain('rel="noopener noreferrer"')

    const rawTags = renderDescriptionHtml('<b>bold</b> <span>text</span>')
    expect(rawTags).not.toContain('<b>')
    expect(rawTags).not.toContain('<span>')
    expect(rawTags).toContain('bold')

    const css = renderDescriptionHtml('<style>body{background:red}</style>')
    expect(css).not.toContain('style')
    expect(css).not.toContain('background')
  })

  it('disables headings, images, tables, task lists, and autolinks', () => {
    const heading = renderDescriptionHtml('# Heading')
    expect(heading).not.toMatch(/<h[1-6]>/)
    expect(heading).toContain('Heading')

    const image = renderDescriptionHtml('![alt](https://x.example/y.png)')
    expect(image).not.toContain('<img')

    const table = renderDescriptionHtml('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(table).not.toContain('<table')
    expect(table).toContain('| a | b |')

    const task = renderDescriptionHtml('- [ ] todo')
    expect(task).not.toContain('<input')
    expect(task).not.toContain('checkbox')
    expect(task).toContain('todo')

    const strike = renderDescriptionHtml('~~strike~~')
    expect(strike).not.toContain('<del')
    expect(strike).toContain('strike')

    const autolink = renderDescriptionHtml('see https://example.com now')
    expect(autolink).not.toContain('<a')
    expect(autolink).toContain('https://example.com')
  })

  it('keeps fenced code as inert text', () => {
    const fenced = renderDescriptionHtml('```\n<script>alert(3)</script>\n```')
    expect(fenced).toContain('<pre><code>')
    expect(fenced).not.toContain('<script>')
    expect(fenced).toContain('&lt;script&gt;')
  })
})
