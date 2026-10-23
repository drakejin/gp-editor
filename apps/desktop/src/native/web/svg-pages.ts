// Pages of DrawCommands as SVG, for printing in the Windows build (File ▸ Print… shows Windows' print dialog for a
// document of these pages; "Microsoft Print to PDF" is one of its printers).
import type { PdfDocument, PdfPage } from '../../export/pdf-document';
import type { DrawCommand, TextCommand } from '../../score/draw';
import { MUSIC_FONT, cssFont } from './fonts';
import { cssColor } from './painter';

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ANCHORS = { left: 'start', center: 'middle', right: 'end' } as const;

function textElement(c: TextCommand): string {
  // Music text sits on its baseline; UI text is centred on y (dominant-baseline central).
  const baseline = c.font === 'music' ? 'alphabetic' : 'central';
  const style = `font: ${cssFont(c.font, c.size, c.bold === true).replace(/"/g, "'")}`;
  return `<text x="${c.x}" y="${c.y}" fill="${cssColor(c.color)}" text-anchor="${ANCHORS[c.align]}" dominant-baseline="${baseline}" style="${style}" xml:space="preserve">${escapeXml(c.text)}</text>`;
}

export function svgElement(command: DrawCommand): string {
  switch (command.kind) {
    case 'line': {
      const dash = command.dash !== undefined && command.dash.length > 0 ? ` stroke-dasharray="${command.dash.join(' ')}"` : '';
      return `<line x1="${command.x1}" y1="${command.y1}" x2="${command.x2}" y2="${command.y2}" stroke="${cssColor(command.color)}" stroke-width="${command.width}"${dash}/>`;
    }
    case 'rect': {
      const radius = Math.min(command.radius ?? 0, Math.min(command.width, command.height) / 2);
      return `<rect x="${command.x}" y="${command.y}" width="${Math.max(0, command.width)}" height="${Math.max(0, command.height)}" rx="${radius}" fill="${cssColor(command.color)}"/>`;
    }
    case 'circle':
      return command.strokeWidth !== undefined
        ? `<circle cx="${command.x}" cy="${command.y}" r="${Math.max(0, command.radius)}" fill="none" stroke="${cssColor(command.color)}" stroke-width="${command.strokeWidth}"/>`
        : `<circle cx="${command.x}" cy="${command.y}" r="${Math.max(0, command.radius)}" fill="${cssColor(command.color)}"/>`;
    case 'curve':
      return `<path d="M ${command.x1} ${command.y1} Q ${command.cx} ${command.cy} ${command.x2} ${command.y2}" fill="none" stroke="${cssColor(command.color)}" stroke-width="${command.width}" stroke-linecap="round"/>`;
    case 'polygon':
      return command.points.length < 6 ? '' : `<polygon points="${command.points.join(' ')}" fill="${cssColor(command.color)}"/>`;
    case 'text':
      return textElement(command);
  }
}

export function pageSvg(page: PdfPage): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}pt" height="${page.height}pt" viewBox="0 0 ${page.width} ${page.height}">${page.commands.map(svgElement).join('')}</svg>`;
}

/** A printable HTML document: one page per sheet, at the pages' own size. */
export function printableHtml(document: PdfDocument, musicFontUrl: string): string {
  const first = document.pages[0];
  const size = first === undefined ? 'auto' : `${first.width}pt ${first.height}pt`;
  const pages = document.pages.map((page) => `<div class="page">${pageSvg(page)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(document.title)}</title><style>
@font-face { font-family: '${MUSIC_FONT}'; src: url('${musicFontUrl}'); }
@page { size: ${size}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.page { break-after: page; page-break-after: always; line-height: 0; }
.page:last-child { break-after: auto; page-break-after: auto; }
svg { display: block; }
</style></head><body>${pages}</body></html>`;
}
