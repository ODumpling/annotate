import type { Hotspot } from '../model'
import type { SanitizedHtml } from './markdown'
import { serializeScriptSafeJson } from './serialize'

export interface ExportedPageData {
  id: string
  width: number
  height: number
  imageDataUrl: string
}

export interface ExportedHotspotData {
  id: string
  pageId: string
  shape: Hotspot['shape']
  x: number
  y: number
  w?: number
  h?: number
  title: string
  descriptionHtml: SanitizedHtml
  tags: string[]
  color: string
}

export type ExportTheme = 'dark' | 'light'

export interface ExportedViewerData {
  schemaVersion: 1
  name: string
  showBadgeNumbers: boolean
  exportTheme?: ExportTheme
  pages: ExportedPageData[]
  hotspots: ExportedHotspotData[]
}

interface ThemePalette {
  background: string
  text: string
  overlayScrim: string
  markerBorder: string
  markerShadow: string
  cardBackground: string
  cardBorder: string
  codeBackground: string
  blockquoteText: string
  tagBackground: string
  link: string
  focusOutline: string
}

const DARK_PALETTE: ThemePalette = {
  background: '#0f172a',
  text: '#e2e8f0',
  overlayScrim: 'rgba(2, 6, 23, 0.12)',
  markerBorder: '#fff',
  markerShadow: 'rgba(2, 6, 23, 0.55)',
  cardBackground: '#1e293b',
  cardBorder: '#334155',
  codeBackground: '#0f172a',
  blockquoteText: '#94a3b8',
  tagBackground: '#334155',
  link: '#93c5fd',
  focusOutline: '#fbbf24',
}

// Light-theme swap of the same layout: navy surfaces become white/slate, and
// text/border/link colors invert to keep the same WCAG AA contrast ratios
// (see src/a11y/contrast.ts) against the new backgrounds.
const LIGHT_PALETTE: ThemePalette = {
  background: '#f8fafc',
  text: '#0f172a',
  overlayScrim: 'rgba(15, 23, 42, 0.08)',
  markerBorder: '#0f172a',
  markerShadow: 'rgba(15, 23, 42, 0.35)',
  cardBackground: '#ffffff',
  cardBorder: '#cbd5e1',
  codeBackground: '#e2e8f0',
  blockquoteText: '#475569',
  tagBackground: '#e2e8f0',
  link: '#1d4ed8',
  focusOutline: '#b45309',
}

function paletteFor(theme: ExportTheme | undefined): ThemePalette {
  return theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE
}

function viewerCss(theme: ExportTheme | undefined): string {
  const palette = paletteFor(theme)
  return `* { box-sizing: border-box; }
body { margin: 0; background: ${palette.background}; color: ${palette.text}; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.annotate-title { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.annotate-page { display: flex; align-items: center; justify-content: center; width: 100%; height: 100vh; height: 100dvh; overflow: hidden; }
.annotate-viewport { position: relative; flex: none; width: min(100%, 100vh * var(--page-ratio, 1)); width: min(100%, 100dvh * var(--page-ratio, 1)); aspect-ratio: var(--page-ratio, 1); }
.annotate-image { display: block; width: 100%; height: 100%; }
.annotate-overlay { position: absolute; inset: 0; }
.annotate-marker { position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; padding: 0; border: 2px solid ${palette.markerBorder}; border-radius: 999px; background: var(--marker-color, #2563eb); color: #fff; font: 600 13px/1 system-ui; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 0 0 2px ${palette.markerShadow}; }
.annotate-marker-rect { transform: none; width: auto; height: auto; border: 2px solid var(--marker-color, #2563eb); background: ${palette.overlayScrim}; border-radius: 4px; }
.annotate-marker-rect .annotate-badge { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); }
.annotate-badge { pointer-events: none; }
.annotate-marker:focus-visible, .annotate-tooltip a:focus-visible { outline: 3px solid ${palette.focusOutline}; outline-offset: 2px; }
.annotate-tooltip { position: fixed; left: 0; top: 0; z-index: 20; width: max-content; max-width: min(360px, calc(100vw - 16px)); max-height: min(60vh, 420px); overflow: auto; background: ${palette.cardBackground}; color: ${palette.text}; border: 1px solid ${palette.cardBorder}; border-radius: 10px; padding: 12px 14px; font-size: 14px; box-shadow: 0 12px 32px ${palette.markerShadow}; }
.annotate-tooltip-title { margin: 0 0 6px; font-size: 1rem; }
.annotate-tooltip-body p { margin: 0 0 8px; }
.annotate-tooltip-body > :last-child { margin-bottom: 0; }
.annotate-tooltip-body :is(ul, ol) { margin: 0 0 8px; padding-left: 20px; }
.annotate-tooltip-body blockquote { margin: 0 0 8px; padding: 2px 10px; border-left: 3px solid ${palette.cardBorder}; color: ${palette.blockquoteText}; }
.annotate-tooltip-body code { background: ${palette.codeBackground}; border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.annotate-tooltip-body pre { background: ${palette.codeBackground}; border-radius: 8px; padding: 10px; overflow: auto; }
.annotate-tooltip-body pre code { background: none; padding: 0; }
.annotate-tooltip a { color: ${palette.link}; }
.annotate-tooltip-tags { margin: 8px 0 0; }
.annotate-tag { display: inline-block; margin: 0 6px 4px 0; padding: 1px 8px; background: ${palette.tagBackground}; border-radius: 999px; font-size: 12px; }
.annotate-noscript { color: ${palette.text}; padding: 16px; }
.annotate-error { color: ${palette.text}; padding: 16px; }`
}

const VIEWER_JS = `(function () {
  'use strict'
  var ACCENT_COLOR = '#2563eb'
  var TOOLTIP_GAP = 8
  var EDGE_MARGIN = 8
  var HIDE_DELAY_MS = 150
  var dataElement = document.getElementById('annotate-data')
  var data = null
  try {
    data = dataElement ? JSON.parse(dataElement.textContent) : null
  } catch (error) {
    data = null
  }
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.pages) || !Array.isArray(data.hotspots)) {
    document.body.appendChild(
      element('p', 'annotate-error', 'Annotation data is missing or corrupted.')
    )
    return
  }

  // The one visible tooltip: { marker, tooltip, pinned }. Hover/focus shows an
  // unpinned tooltip; a click pins it open until clicked again, Escape, or a
  // click elsewhere.
  var active = null
  var hideTimer = null
  var tooltipCount = 0

  function element(tag, className, text) {
    var node = document.createElement(tag)
    if (className) {
      node.className = className
    }
    if (text !== undefined && text !== null) {
      node.textContent = text
    }
    return node
  }

  function percent(value) {
    return value * 100 + '%'
  }

  function cancelHide() {
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function scheduleHide() {
    cancelHide()
    hideTimer = setTimeout(function () {
      hideTimer = null
      if (active && !active.pinned) {
        hideTooltip(false)
      }
    }, HIDE_DELAY_MS)
  }

  function positionTooltip() {
    if (!active) {
      return
    }
    var anchor = active.marker.getBoundingClientRect()
    var tooltip = active.tooltip
    var width = tooltip.offsetWidth
    var height = tooltip.offsetHeight
    var viewWidth = document.documentElement.clientWidth || window.innerWidth
    var viewHeight = document.documentElement.clientHeight || window.innerHeight
    var left = anchor.left + anchor.width / 2 - width / 2
    left = Math.max(EDGE_MARGIN, Math.min(left, viewWidth - width - EDGE_MARGIN))
    var top = anchor.bottom + TOOLTIP_GAP
    if (top + height > viewHeight - EDGE_MARGIN) {
      var above = anchor.top - TOOLTIP_GAP - height
      top = above >= EDGE_MARGIN
        ? above
        : Math.max(EDGE_MARGIN, viewHeight - height - EDGE_MARGIN)
    }
    tooltip.style.left = Math.round(left) + 'px'
    tooltip.style.top = Math.round(top) + 'px'
  }

  function buildTooltip(hotspot, marker) {
    tooltipCount += 1
    var tooltip = element('div', 'annotate-tooltip')
    tooltip.id = 'annotate-tooltip-' + tooltipCount
    tooltip.setAttribute('role', 'dialog')
    var title = element('h2', 'annotate-tooltip-title', hotspot.title)
    title.id = tooltip.id + '-title'
    tooltip.setAttribute('aria-labelledby', title.id)
    tooltip.appendChild(title)
    var body = element('div', 'annotate-tooltip-body')
    body.innerHTML = hotspot.descriptionHtml
    tooltip.appendChild(body)
    if (Array.isArray(hotspot.tags) && hotspot.tags.length > 0) {
      var tags = element('div', 'annotate-tooltip-tags')
      hotspot.tags.forEach(function (tag) {
        tags.appendChild(element('span', 'annotate-tag', tag))
      })
      tooltip.appendChild(tags)
    }
    tooltip.addEventListener('mouseenter', cancelHide)
    tooltip.addEventListener('mouseleave', scheduleHide)
    tooltip.addEventListener('focusout', function (event) {
      handleFocusOut(event, marker)
    })
    return tooltip
  }

  function showTooltip(hotspot, marker, pinned) {
    cancelHide()
    if (active && active.marker === marker) {
      active.pinned = active.pinned || pinned
      return
    }
    if (active) {
      hideTooltip(false)
    }
    var tooltip = buildTooltip(hotspot, marker)
    // Inserted right after its marker so Tab moves from the marker into any
    // links in the description before reaching the next marker.
    marker.parentNode.insertBefore(tooltip, marker.nextSibling)
    active = { marker: marker, tooltip: tooltip, pinned: pinned }
    marker.setAttribute('aria-expanded', 'true')
    marker.setAttribute('aria-controls', tooltip.id)
    positionTooltip()
  }

  function hideTooltip(restoreFocus) {
    cancelHide()
    if (!active) {
      return
    }
    var current = active
    active = null
    current.tooltip.remove()
    current.marker.setAttribute('aria-expanded', 'false')
    current.marker.removeAttribute('aria-controls')
    if (restoreFocus) {
      current.marker.focus()
    }
  }

  function handleFocusOut(event, marker) {
    if (!active || active.marker !== marker || active.pinned) {
      return
    }
    var next = event.relatedTarget
    if (next && (next === marker || active.tooltip.contains(next))) {
      return
    }
    hideTooltip(false)
  }

  function buildMarker(hotspot, number) {
    var marker = element(
      'button',
      'annotate-marker' + (hotspot.shape === 'rect' ? ' annotate-marker-rect' : '')
    )
    marker.type = 'button'
    marker.style.left = percent(hotspot.x)
    marker.style.top = percent(hotspot.y)
    if (hotspot.shape === 'rect') {
      marker.style.width = percent(hotspot.w)
      marker.style.height = percent(hotspot.h)
    }
    marker.style.setProperty('--marker-color', hotspot.color || ACCENT_COLOR)
    marker.setAttribute('aria-haspopup', 'dialog')
    marker.setAttribute('aria-expanded', 'false')
    marker.setAttribute(
      'aria-label',
      (data.showBadgeNumbers ? number + '. ' : '') + hotspot.title
    )
    if (data.showBadgeNumbers) {
      marker.appendChild(element('span', 'annotate-badge', String(number)))
    }
    marker.addEventListener('mouseenter', function () {
      if (!active || !active.pinned) {
        showTooltip(hotspot, marker, false)
      }
    })
    marker.addEventListener('mouseleave', function () {
      if (active && active.marker === marker && !active.pinned) {
        scheduleHide()
      }
    })
    marker.addEventListener('focus', function () {
      if (!active || !active.pinned) {
        showTooltip(hotspot, marker, false)
      }
    })
    marker.addEventListener('focusout', function (event) {
      handleFocusOut(event, marker)
    })
    marker.addEventListener('click', function () {
      if (active && active.marker === marker && active.pinned) {
        hideTooltip(false)
      } else {
        showTooltip(hotspot, marker, true)
      }
    })
    return marker
  }

  function buildPage(page, pageIndex) {
    var section = element('section', 'annotate-page')
    section.setAttribute('aria-label', 'Page ' + (pageIndex + 1))
    var viewport = element('div', 'annotate-viewport')
    viewport.style.setProperty('--page-ratio', String(page.width / page.height))
    var image = element('img', 'annotate-image')
    image.alt = data.name
    image.src = page.imageDataUrl
    var overlay = element('div', 'annotate-overlay')
    viewport.appendChild(image)
    viewport.appendChild(overlay)
    var number = 0
    data.hotspots.forEach(function (hotspot) {
      if (hotspot.pageId === page.id) {
        number += 1
        overlay.appendChild(buildMarker(hotspot, number))
      }
    })
    section.appendChild(viewport)
    return section
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && active) {
      event.preventDefault()
      var focusInside =
        document.activeElement === active.marker ||
        active.tooltip.contains(document.activeElement)
      hideTooltip(focusInside)
    }
  })
  document.addEventListener('click', function (event) {
    if (
      active &&
      !active.marker.contains(event.target) &&
      !active.tooltip.contains(event.target)
    ) {
      hideTooltip(false)
    }
  })
  window.addEventListener('resize', positionTooltip)
  window.addEventListener('scroll', positionTooltip, true)

  var main = element('main', 'annotate')
  main.appendChild(element('h1', 'annotate-title', data.name))
  data.pages.forEach(function (page, index) {
    main.appendChild(buildPage(page, index))
  })
  document.body.appendChild(main)
})()`

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderExportHtml(data: ExportedViewerData): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'\">",
    `<title>${escapeHtmlText(data.name)}</title>`,
    `<style>${viewerCss(data.exportTheme)}</style>`,
    '</head>',
    '<body>',
    '<noscript><p class="annotate-noscript">This exported file requires JavaScript to display its annotations.</p></noscript>',
    `<script type="application/json" id="annotate-data">${serializeScriptSafeJson(data)}</script>`,
    `<script>${VIEWER_JS}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
