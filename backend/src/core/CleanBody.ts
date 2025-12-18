import type { EmailRecord } from '../database.js';

type CleanBodySource = 'html' | 'text' | 'none';

interface CleanBodyResult {
  text: string;
  quoted: string;
  source: CleanBodySource;
}

const TEMPLATE_MARKERS = [
  /#outlook\b/i,
  /\bmso-/i,
  /@media\b/i,
  /\bfont-family\b/i,
  /\bborder-collapse\b/i,
  /\bline-height\b/i,
  /\btext-decoration\b/i,
  /\btext-size-adjust\b/i,
  /\.mj-/i,
  /-webkit-text-size-adjust/i,
  /-ms-text-size-adjust/i,
  /@import\b/i,
  /<!doctype/i,
  /<html\b/i,
  /<head\b/i,
  /<body\b/i
];

const CSS_SELECTOR_LINE = /^(?:\.|#|table|td|tr|img|body|p|div|span|h[1-6])\b.*\{/i;
const CSS_PROPERTY_LINE = /\b(?:font|border|margin|padding|background|color|width|height|display|line-height|text-decoration|text-align|max-width|min-width|vertical-align|table-layout)\s*:\s*[^;]+;?/i;

const QUOTE_HEADER_PATTERNS = [
  /^On .+wrote:$/i,
  /^-----Original Message-----/i,
  /^Begin forwarded message/i
];

const QUOTE_BLOCK_HEADER = /^(From|Sent|To|Subject):\s+/i;

const FOOTER_PATTERNS = [
  /unsubscribe/i,
  /manage (email )?preferences/i,
  /view in browser/i,
  /update your preferences/i,
  /privacy policy/i,
  /terms of service/i,
  /all rights reserved/i,
  /this (email|message) was sent to/i,
  /you are receiving this/i,
  /email sent to/i,
  /manage notifications/i,
  /mailing list/i,
  /to ensure delivery/i,
  /©/i,
  /sent from my (iphone|ipad|android)/i,
  /do not reply/i,
  /no[- ]?reply/i,
  /view this email in your browser/i
];

export function buildCleanBody(email: EmailRecord): CleanBodyResult {
  const plainText = email.body_text || '';
  const htmlText = email.body_html || '';

  const cleanPlain = cleanPlainText(plainText);
  const cleanHtml = htmlText ? cleanPlainText(htmlToText(htmlText)) : { main: '', quoted: '' };

  const plainScore = scoreText(cleanPlain.main);
  const htmlScore = scoreText(cleanHtml.main);
  const plainLooksLikeTemplate = looksLikeTemplate(plainText);

  if (cleanHtml.main && (htmlScore >= plainScore || plainLooksLikeTemplate)) {
    const resolved = ensurePrimaryText(cleanHtml);
    return { text: resolved.main, quoted: resolved.quoted, source: 'html' };
  }

  if (cleanPlain.main) {
    const resolved = ensurePrimaryText(cleanPlain);
    return { text: resolved.main, quoted: resolved.quoted, source: 'text' };
  }

  if (cleanHtml.main) {
    const resolved = ensurePrimaryText(cleanHtml);
    return { text: resolved.main, quoted: resolved.quoted, source: 'html' };
  }

  return { text: '', quoted: '', source: 'none' };
}

function htmlToText(html: string): string {
  let text = html;

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<[^>]+>/g, ' ');

  text = decodeHtmlEntities(text);
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function decodeHtmlEntities(text: string): string {
  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };

  text = text.replace(/&(nbsp|amp|lt|gt|quot);/g, match => entityMap[match] || match);
  text = text.replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
    const code = parseInt(hex, 16);
    return Number.isNaN(code) ? '' : String.fromCharCode(code);
  });
  text = text.replace(/&#([0-9]+);/g, (_match, num) => {
    const code = parseInt(num, 10);
    return Number.isNaN(code) ? '' : String.fromCharCode(code);
  });

  return text;
}

function cleanPlainText(input: string): { main: string; quoted: string } {
  if (!input) return { main: '', quoted: '' };

  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const stats = countLineStats(lines);
  const shouldDropNoise = stats.nonEmpty > 0 &&
    (stats.noiseRatio >= 0.2 || looksLikeTemplate(normalized));

  const filtered = [];
  let lastWasEmpty = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!lastWasEmpty) {
        filtered.push('');
        lastWasEmpty = true;
      }
      continue;
    }

    if (shouldDropNoise && isNoiseLine(trimmed)) {
      continue;
    }

    filtered.push(trimmed);
    lastWasEmpty = false;
  }

  const { main, quoted } = splitQuotedText(filtered);
  const withoutFooter = trimFooter(main);
  const compactedMain = compactBlankLines(withoutFooter);
  const compactedQuoted = compactBlankLines(quoted);

  return {
    main: compactedMain.join('\n').trim(),
    quoted: compactedQuoted.join('\n').trim()
  };
}

function countLineStats(lines: string[]): { nonEmpty: number; noise: number; noiseRatio: number } {
  let nonEmpty = 0;
  let noise = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    nonEmpty++;
    if (isNoiseLine(trimmed)) {
      noise++;
    }
  }

  const noiseRatio = nonEmpty > 0 ? noise / nonEmpty : 0;
  return { nonEmpty, noise, noiseRatio };
}

function isNoiseLine(line: string): boolean {
  if (CSS_SELECTOR_LINE.test(line)) return true;
  if (CSS_PROPERTY_LINE.test(line) && /[;{}]/.test(line)) return true;
  if (/\b@import\b/i.test(line)) return true;
  if (/\b@media\b/i.test(line)) return true;
  if (/^\s*[{;}]$/.test(line)) return true;
  if (/^<\/?[a-z][^>]*>$/i.test(line)) return true;
  if (/^\d{1,4}$/.test(line)) return true;
  if (/^https?:\/\/\S{60,}$/i.test(line)) return true;

  const urlMatch = line.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    const urlLength = urlMatch[0].length;
    if (line.length >= 80 && urlLength / line.length > 0.6) {
      return true;
    }
    if (/utm_|mc_cid|mc_eid|trk=|tracking|campaign/i.test(line)) {
      return true;
    }
  }

  const nonAlpha = line.replace(/[A-Za-z0-9\s]/g, '');
  if (line.length >= 40 && nonAlpha.length / line.length > 0.4) {
    return true;
  }

  return TEMPLATE_MARKERS.some(pattern => pattern.test(line));
}

function looksLikeTemplate(text: string): boolean {
  return TEMPLATE_MARKERS.some(pattern => pattern.test(text));
}

function splitQuotedText(lines: string[]): { main: string[]; quoted: string[] } {
  const quoteStart = findQuoteStart(lines);
  if (quoteStart >= 0) {
    return { main: lines.slice(0, quoteStart), quoted: lines.slice(quoteStart) };
  }

  return splitTrailingQuoted(lines);
}

function findQuoteStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (QUOTE_HEADER_PATTERNS.some(pattern => pattern.test(line))) {
      return i;
    }
  }

  for (let i = 0; i < lines.length - 3; i++) {
    if (!QUOTE_BLOCK_HEADER.test(lines[i])) continue;

    let matches = 0;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      if (QUOTE_BLOCK_HEADER.test(lines[j])) {
        matches++;
      }
    }

    if (matches >= 3) {
      return i;
    }
  }

  return -1;
}

function splitTrailingQuoted(lines: string[]): { main: string[]; quoted: string[] } {
  let end = lines.length;
  let quotedCount = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('>')) {
      quotedCount++;
      end = i;
      continue;
    }

    if (quotedCount >= 3) {
      break;
    }

    quotedCount = 0;
    end = lines.length;
  }

  if (quotedCount >= 3) {
    return { main: lines.slice(0, end), quoted: lines.slice(end) };
  }

  return { main: lines, quoted: [] };
}

function trimFooter(lines: string[]): string[] {
  if (lines.length < 6) return lines;

  const maxScan = Math.min(lines.length, 25);
  for (let i = lines.length - 1; i >= lines.length - maxScan; i--) {
    const line = lines[i];
    if (FOOTER_PATTERNS.some(pattern => pattern.test(line))) {
      return lines.slice(0, i);
    }
  }

  return lines;
}

function compactBlankLines(lines: string[]): string[] {
  const compacted = [];
  let lastWasEmpty = false;

  for (const line of lines) {
    if (line.trim() === '') {
      if (!lastWasEmpty) {
        compacted.push('');
        lastWasEmpty = true;
      }
      continue;
    }

    compacted.push(line);
    lastWasEmpty = false;
  }

  return compacted;
}

function scoreText(text: string): number {
  if (!text) return 0;
  const compact = text.replace(/\s+/g, '');
  return compact.length;
}

function ensurePrimaryText(parts: { main: string; quoted: string }): { main: string; quoted: string } {
  if (parts.main) return parts;
  if (!parts.quoted) return parts;
  return { main: parts.quoted, quoted: '' };
}
