import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.use({
  gfm: true,
  breaks: true,
  tokenizer: {
    autolink() {
      return undefined
    },
    html() {
      return undefined
    },
    tag() {
      return undefined
    },
    url() {
      return undefined
    },
    table() {
      return undefined
    },
  },
})

const ALLOWED_TAGS = [
  'p',
  'br',
  'em',
  'strong',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
]
const ALLOWED_ATTR = ['href', 'title']
const ALLOWED_URI_REGEXP = /^(?:https?|mailto):/i

let hooksConfigured = false

declare const sanitizedHtmlBrand: unique symbol

/** HTML that has passed this module's fixed DOMPurify policy. */
export type SanitizedHtml = string & {
  readonly [sanitizedHtmlBrand]: true
}

function ensureLinkHardening() {
  if (hooksConfigured) {
    return
  }
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  hooksConfigured = true
}

export function renderDescriptionHtml(markdown: string): SanitizedHtml {
  ensureLinkHardening()
  const rawHtml = marked.parse(markdown, { async: false })
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
  }) as SanitizedHtml
}
