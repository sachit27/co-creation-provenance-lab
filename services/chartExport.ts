/**
 * Export chart/visualization containers as self-contained HTML files.
 * Captures the rendered DOM of a container element and wraps it in a
 * standalone HTML document with all styles inlined.
 */

export const downloadChartAsHTML = (
  containerId: string,
  filename: string,
  title?: string
) => {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`[chartExport] Element #${containerId} not found`);
    return;
  }

  // Clone the container — buttons are still present so indices match the original
  const clone = container.cloneNode(true) as HTMLElement;

  // Inline computed styles BEFORE removing any elements (index alignment is critical)
  inlineComputedStyles(container, clone);

  // Now remove interactive-only elements from the clone
  clone.querySelectorAll('button, [data-export-hide]').forEach(el => el.remove());

  // Handle SVGs — ensure explicit dimensions from rendered bounding rects
  const origSvgs = container.querySelectorAll('svg');
  const cloneSvgs = clone.querySelectorAll('svg');
  cloneSvgs.forEach((svg, i) => {
    const original = origSvgs[i];
    if (original) {
      const rect = original.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        svg.setAttribute('width', String(Math.round(rect.width)));
        svg.setAttribute('height', String(Math.round(rect.height)));
      }
    }
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title || filename)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      padding: 24px;
      color: #334155;
    }
    .export-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    .export-header h1 { font-size: 18px; color: #1e293b; margin-bottom: 4px; }
    .export-header p { font-size: 11px; color: #94a3b8; }
    .export-content { max-width: 1200px; margin: 0 auto; }
    @media print {
      body { padding: 12px; }
      .export-header { margin-bottom: 12px; }
    }
  </style>
</head>
<body>
  <div class="export-header">
    <h1>${escapeHTML(title || filename)}</h1>
    <p>Exported from Provenance Lab on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
  </div>
  <div class="export-content">
    ${clone.outerHTML}
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Walk original and clone element trees in parallel, inlining computed styles
 * from the rendered original onto the clone. Must be called BEFORE removing
 * any elements from the clone so that indices stay aligned.
 */
const inlineComputedStyles = (original: HTMLElement, clone: HTMLElement) => {
  // Inline on the root container itself
  applyStyles(original, clone);

  const origElements = original.querySelectorAll('*');
  const cloneElements = clone.querySelectorAll('*');
  const count = Math.min(origElements.length, cloneElements.length);

  for (let i = 0; i < count; i++) {
    const orig = origElements[i] as HTMLElement;
    const cloneEl = cloneElements[i] as HTMLElement;
    if (!orig || !cloneEl) continue;
    applyStyles(orig, cloneEl);
  }
};

/** CSS properties to capture for HTML elements */
const HTML_PROPS = [
  // Layout
  'display', 'position', 'float', 'clear',
  'flex-direction', 'flex-wrap', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'justify-content', 'gap', 'order',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  // Dimensions
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  // Spacing
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  // Typography
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'text-transform', 'white-space', 'word-break', 'overflow-wrap',
  // Colors & background
  'color', 'background-color', 'background', 'background-image',
  'opacity',
  // Borders
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-radius',
  // Effects
  'box-shadow', 'overflow', 'overflow-x', 'overflow-y',
  'vertical-align', 'visibility',
  'table-layout', 'border-collapse', 'border-spacing',
  // Positioning
  'top', 'right', 'bottom', 'left', 'z-index',
];

/** CSS properties to capture for SVG elements */
const SVG_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight',
  'text-anchor', 'dominant-baseline', 'color',
];

const SVG_TAG_NAMES = new Set([
  'svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'path', 'text', 'tspan', 'defs', 'clipPath', 'use',
]);

const applyStyles = (orig: Element, cloneEl: Element) => {
  const computed = window.getComputedStyle(orig);
  const isSvgElement = SVG_TAG_NAMES.has(orig.tagName.toLowerCase());
  const props = isSvgElement ? SVG_PROPS : HTML_PROPS;

  const parts: string[] = [];
  for (const prop of props) {
    const val = computed.getPropertyValue(prop);
    if (!val || val === '') continue;

    if (isSvgElement) {
      // SVG: preserve values like fill:none (transparent), stroke-width:0, fill:transparent.
      // These are semantically meaningful in SVG — filtering them causes elements to
      // inherit wrong defaults (e.g. black fill, visible strokes).
      parts.push(`${prop}:${val}`);
    } else {
      // HTML: skip default/empty values to keep output compact
      if (val !== 'none' && val !== 'normal' && val !== 'auto'
          && val !== '0px' && val !== '0' && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
        parts.push(`${prop}:${val}`);
      }
    }
  }

  if (parts.length > 0) {
    const existing = cloneEl.getAttribute('style') || '';
    cloneEl.setAttribute('style', existing + (existing ? ';' : '') + parts.join(';'));
  }
};

const escapeHTML = (str: string): string =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
