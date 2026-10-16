// Copyright 2026 Qder AI. Licensed under the Apache License, Version 2.0.
/**
 * The same translation on the server, for readers that run no JavaScript (search and AI crawlers): a Cloudflare
 * Workers HTMLRewriter pass over the Hebrew page, using the very translator the browser uses (core.js).
 *
 *   import { translateResponse } from "@qderai/hebrew-i18n/worker";
 *   return translateResponse(await env.ASSETS.fetch(req), dict, { lang: "en" });
 *
 * HTMLRewriter hands text over in chunks that are not sentences, so chunks are buffered to the end of each text
 * node before lookup. A chunk is SOURCE text (entities and all): the lookup reads it decoded, and text that is not
 * translated goes back exactly as it came, as HTML (re-escaping it would show "&#1513;" to the reader).
 */
import { createTranslator, decodeEntities, translateJsonLd, HEBREW, READABLE_ATTRS } from "./core.js";

/** HTMLRewriter handlers that translate a document. `rewriter` is a fresh `new HTMLRewriter()`. */
export function applyTranslation(rewriter, dict, { lang = "en", dir = "ltr", attrs = READABLE_ATTRS } = {}) {
  const translate = typeof dict === "function" ? dict : createTranslator(dict);
  let buf = "";
  let ld = "";
  let skip = 0;
  return rewriter
    .on("html", { element(el) { el.setAttribute("lang", lang); el.setAttribute("dir", dir); } })
    // Registered before the blanket script skip, so it still receives its text.
    .on('script[type="application/ld+json"]', {
      text(chunk) {
        ld += chunk.text;
        if (!chunk.lastInTextNode) { chunk.remove(); return; }
        chunk.replace(translateJsonLd(ld, translate), { html: true });
        ld = "";
      },
    })
    .on("script, style, noscript, textarea, code, pre, [data-no-i18n]", {
      element(el) { skip += 1; el.onEndTag(() => { skip -= 1; }); },
    })
    .on("*", {
      element(el) {
        if (skip) return;
        for (const a of attrs) {
          const v = el.getAttribute(a);
          if (!v || !HEBREW.test(v)) continue;
          if (a === "value" && !(el.tagName === "input" && /^(button|submit|reset)$/i.test(el.getAttribute("type") ?? ""))) continue;
          const out = translate(decodeEntities(v));
          if (out !== null) el.setAttribute(a, out);
        }
      },
      text(chunk) {
        if (skip) return;
        buf += chunk.text;
        if (!chunk.lastInTextNode) { chunk.remove(); return; }
        const plain = decodeEntities(buf);
        const out = HEBREW.test(plain) ? translate(plain) : null;
        if (out !== null) chunk.replace(out, { html: false });
        else chunk.replace(buf, { html: true });
        buf = "";
      },
    });
}

/** Translate an HTML response. Length and ETag are dropped: the body changes. */
export function translateResponse(res, dict, opts = {}) {
  const out = applyTranslation(new HTMLRewriter(), dict, opts).transform(res);
  const headers = new Headers(out.headers);
  headers.set("content-language", opts.lang ?? "en");
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
}

export { createTranslator } from "./core.js";
