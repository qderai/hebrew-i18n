// Copyright 2026 Qder AI. Licensed under the Apache License, Version 2.0.
/**
 * The translator: a dictionary keyed by the Hebrew text as it appears on the page.
 *
 * - Keys and page text are normalised the same way (trimmed, runs of whitespace collapsed), because HTML wraps a
 *   long sentence over indented lines; a key that is not normalised like the page can never match.
 * - Keys with {braces} are patterns: "הוספת {name} להזמנה" matches any name, and the translation may put the
 *   pieces in another order ("Add {name} to the order"). A captured piece is translated too (up to 4 levels deep),
 *   so a Hebrew date inside a Hebrew sentence comes out translated on both levels.
 * - A placeholder never runs past the end of a sentence. A lazy "anything" once captured "144. החשבון סגור" as an
 *   amount and pasted the second sentence back untranslated. A full stop ends a sentence only when whitespace
 *   follows it, so "₪12.50" still matches.
 * - Longer patterns are tried first: the most specific sentence wins over a fragment of it.
 * - Text without a Hebrew letter is never touched; untranslated text is returned as null, never guessed.
 *
 * One module, used by both the browser (browser.js) and the server (worker.js), so the two can never disagree.
 */

export const HEBREW = /[֐-׿]/;

const norm = (t) => String(t).trim().replace(/\s+/g, " ");
const escape = (s) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
const PIECE = "((?:[^.!?\\n]|[.!?](?!\\s))+?)";

/**
 * Build a translator from a dictionary `{ hebrew: translation }`.
 * Returns `translate(text)`: the translated text with its leading and trailing whitespace kept, or `null`.
 */
export function createTranslator(dict = {}) {
  const exact = new Map();
  const patterns = [];
  for (const [raw, out] of Object.entries(dict)) {
    if (typeof out !== "string") continue;
    const key = norm(raw);
    if (!key) continue;
    if (key.includes("{")) {
      const names = [];
      const re = "^" + escape(key).replace(/\\?\{(\w+)\\?\}/g, (_, n) => { names.push(n); return PIECE; }) + "$";
      patterns.push({ re: new RegExp(re), names, out, len: key.length });
    } else {
      exact.set(key, out);
    }
  }
  patterns.sort((a, b) => b.len - a.len);

  const translate = (text, depth = 0) => {
    const s = String(text ?? "");
    if (!HEBREW.test(s)) return null;
    const lead = /^\s*/.exec(s)[0];
    const trail = /\s*$/.exec(s)[0];
    const core = norm(s);
    if (!core) return null;
    const hit = exact.get(core);
    if (hit !== undefined) return lead + hit + trail;
    if (depth > 3) return null;
    for (const p of patterns) {
      const m = p.re.exec(core);
      if (!m) continue;
      let out = p.out;
      p.names.forEach((name, j) => {
        const piece = m[j + 1];
        const inner = translate(piece, depth + 1);
        out = out.split(`{${name}}`).join(inner !== null ? inner.trim() : piece);
      });
      return lead + out + trail;
    }
    return null;
  };
  return (text) => translate(text, 0);
}

/** `translate` that falls back to the original text: handy for strings built in code. */
export function t(translate, text) {
  const out = translate(text);
  return out === null ? text : out;
}

/**
 * Translate the VALUES of a JSON-LD block, never its keys ("name" must stay "name"). URLs, types and dates carry no
 * Hebrew and fall through untouched. Invalid JSON is returned as it came.
 */
export function translateJsonLd(src, translate) {
  let data;
  try { data = JSON.parse(src); } catch { return src; }
  const walk = (node) => {
    if (typeof node === "string") { const out = translate(node); return out === null ? node : out; }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    return node;
  };
  try { return JSON.stringify(walk(data)); } catch { return src; }
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·", times: "×", rarr: "→", larr: "←", shekel: "₪" };

/** HTML source text as a reader sees it: "&mdash;" and "&#1513;" become the characters. */
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** The attributes a person reads (and a crawler indexes). */
export const READABLE_ATTRS = ["placeholder", "aria-label", "title", "alt", "content", "value"];
