// Copyright 2026 Qder AI. Licensed under the Apache License, Version 2.0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranslator, decodeEntities, t, translateJsonLd } from "../src/core.js";
import { pickLanguage } from "../src/browser.js";

const dict = {
  "שלום": "Hello",
  "הוספת {name} להזמנה": "Add {name} to the order",
  "תודה! שילמתם ₪{amount}.": "Thank you! You paid ₪{amount}.",
  "החשבון של השולחן סגור.": "The table's bill is closed.",
  "{a} ו{b}": "{a} and {b}",
  "סלט": "Salad",
  "מרק": "Soup",
  "ההזמנה של {name} תגיע ב-{time}": "{name}'s order arrives at {time}",
  "  שורה   ארוכה\n   שנשברה  ": "A long line that wrapped",
};
const tr = createTranslator(dict);

test("exact keys, with the page's whitespace kept around them", () => {
  assert.equal(tr("שלום"), "Hello");
  assert.equal(tr("  שלום \n"), "  Hello \n");
});

test("keys and page text are normalised alike: a wrapped paragraph still matches", () => {
  assert.equal(tr("שורה ארוכה\n      שנשברה"), "A long line that wrapped");
});

test("patterns capture pieces, which may move, and the pieces are translated too", () => {
  assert.equal(tr("הוספת סלט להזמנה"), "Add Salad to the order");
  assert.equal(tr("הוספת Pizza להזמנה"), "Add Pizza to the order");
  assert.equal(tr("ההזמנה של דנה תגיע ב-20:30"), "דנה's order arrives at 20:30");
  assert.equal(tr("סלט ומרק"), "Salad and Soup");
});

test("a placeholder never swallows the next sentence; a decimal point is not a sentence end", () => {
  assert.equal(tr("תודה! שילמתם ₪12.50."), "Thank you! You paid ₪12.50.");
  // Two sentences in one text node: no key covers both, so nothing is pasted back half-translated.
  assert.equal(tr("תודה! שילמתם ₪144. החשבון של השולחן סגור."), null);
});

test("no Hebrew, no match, nothing guessed", () => {
  assert.equal(tr("Hello"), null);
  assert.equal(tr("משהו שלא במילון"), null);
  assert.equal(t(tr, "משהו שלא במילון"), "משהו שלא במילון");
  assert.equal(tr(""), null);
});

test("the longer, more specific pattern wins over a shorter one", () => {
  const x = createTranslator({ "{x} להזמנה": "{x} to the order", "הוספת {x} להזמנה": "Add {x} to the order" });
  assert.equal(x("הוספת מרק להזמנה"), "Add מרק to the order");
});

test("JSON-LD: values are translated, keys never", () => {
  const src = JSON.stringify({ "@type": "FAQPage", name: "שלום", mainEntity: [{ "@type": "Question", name: "סלט" }], url: "https://example.com" });
  const out = JSON.parse(translateJsonLd(src, tr));
  assert.deepEqual(out, { "@type": "FAQPage", name: "Hello", mainEntity: [{ "@type": "Question", name: "Salad" }], url: "https://example.com" });
  assert.equal(translateJsonLd("{not json", tr), "{not json");
});

test("entities decode to what a reader sees", () => {
  assert.equal(decodeEntities("&#1513;&#1500;&#1493;&#1501; &mdash; &amp;"), "שלום — &");
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
});

test("pickLanguage: ?lang= wins and is remembered, then the stored choice, then the default (never the browser's)", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(pickLanguage({ location: { search: "" }, storage }), "he");
  assert.equal(pickLanguage({ location: { search: "?lang=en" }, storage }), "en");
  assert.equal(pickLanguage({ location: { search: "" }, storage }), "en");
  assert.equal(pickLanguage({ location: { search: "?lang=fr" }, storage }), "en");
  assert.equal(pickLanguage({ location: { search: "" }, storage: { getItem() { throw new Error("private mode"); } } }), "he");
});
