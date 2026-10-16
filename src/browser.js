// Copyright 2026 Qder AI (Itay Funes). Licensed under the Apache License, Version 2.0.
/**
 * Translate a Hebrew page in the browser without a second copy of the page: text nodes and the attributes a person
 * reads are rewritten in place, and a MutationObserver keeps doing it for whatever a script renders later
 * (including error messages from the server). Elements marked `data-no-i18n` (and scripts and styles) are left
 * alone: names, addresses and other people's text must never be "translated".
 */
import { createTranslator, HEBREW, READABLE_ATTRS } from "./core.js";

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

function skipped(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (SKIP.has(n.nodeName) || n.hasAttribute("data-no-i18n")) return true;
  }
  return false;
}

function turnText(node, translate) {
  const v = node.nodeValue;
  if (!HEBREW.test(v) || skipped(node.parentNode)) return;
  const out = translate(v);
  if (out !== null && out !== v) node.nodeValue = out;
}

function turnAttrs(el, translate, attrs) {
  if (skipped(el)) return;
  for (const a of attrs) {
    // A value is prose only on a button; on any other input it is what the person typed.
    if (a === "value" && !(el.nodeName === "INPUT" && /^(button|submit|reset)$/i.test(el.type))) continue;
    const v = el.getAttribute(a);
    if (!v || !HEBREW.test(v)) continue;
    const out = translate(v);
    if (out !== null && out !== v) el.setAttribute(a, out);
  }
}

/** Translate everything under `root` once. */
export function translateTree(root, translate, { attrs = READABLE_ATTRS } = {}) {
  const doc = root.ownerDocument ?? root;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n);
  for (const n of texts) turnText(n, translate);
  const selector = attrs.map((a) => `[${a}]`).join(",");
  if (root.nodeType === 1 && root.matches(selector)) turnAttrs(root, translate, attrs);
  if (root.querySelectorAll) for (const el of root.querySelectorAll(selector)) turnAttrs(el, translate, attrs);
}

/**
 * Translate the page now and keep translating what changes. Returns a function that stops watching.
 *
 *   import { localize } from "@qderai/hebrew-i18n/browser";
 *   localize(document.documentElement, { "שלום": "Hello", "הוספת {name} להזמנה": "Add {name} to the order" });
 */
export function localize(root, dict, { attrs = READABLE_ATTRS, lang = "en", dir = "ltr" } = {}) {
  const translate = typeof dict === "function" ? dict : createTranslator(dict);
  const html = (root.ownerDocument ?? root).documentElement;
  if (html) { html.setAttribute("lang", lang); html.setAttribute("dir", dir); }
  translateTree(root, translate, { attrs });
  const Observer = (root.ownerDocument?.defaultView ?? globalThis).MutationObserver;
  if (!Observer) return () => {};
  const obs = new Observer((records) => {
    for (const r of records) {
      if (r.type === "characterData") turnText(r.target, translate);
      else if (r.type === "attributes") turnAttrs(r.target, translate, attrs);
      else for (const n of r.addedNodes) {
        if (n.nodeType === 3) turnText(n, translate);
        else if (n.nodeType === 1) translateTree(n, translate, { attrs });
      }
    }
  });
  // Our own writes trigger the observer again; translated text has no Hebrew left, so they stop at once.
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attrs });
  return () => obs.disconnect();
}

/**
 * The language to show: an explicit ?lang= wins (and is remembered), then the reader's stored choice, then the
 * default. The browser's own language is deliberately NOT consulted: crawlers render with en-US and would index
 * the translated page as the original (hreflang x-default says "the Hebrew unless asked").
 */
export function pickLanguage({ allowed = ["he", "en"], fallback = "he", storageKey = "lang", location = globalThis.location, storage = globalThis.localStorage } = {}) {
  const q = location ? new URLSearchParams(location.search).get("lang") : null;
  if (q && allowed.includes(q)) { try { storage?.setItem(storageKey, q); } catch { /* private mode */ } return q; }
  let s = null;
  try { s = storage?.getItem(storageKey) ?? null; } catch { /* private mode */ }
  return s && allowed.includes(s) ? s : fallback;
}

export { createTranslator } from "./core.js";
