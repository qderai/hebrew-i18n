# hebrew-i18n

Translate a Hebrew-first website **by its own text**. Write your pages in Hebrew as you always do, keep one
dictionary keyed by the Hebrew, and the same dictionary turns the page into English (or any language) in the
browser **and** on the server, for search and AI crawlers that run no JavaScript.

```js
const en = {
  "הזמנת שולחן": "Book a table",
  "הוספת {dish} להזמנה": "Add {dish} to the order",
  "התשלום התקבל, תודה!": "Payment received, thank you!",
};
```

No message IDs, no second copy of every page, no build step. We run it in production at [qder.ai](https://qder.ai).

## Why

Most i18n libraries want you to replace every sentence with a key (`t("checkout.cta")`). On a site that was
written in Hebrew first, that is a rewrite of every page and every template. Here the Hebrew **is** the key:

- **Exact sentences**: `"הזמנת שולחן": "Book a table"`. Whitespace is normalised on both sides, so a sentence HTML
  wraps over several lines still matches.
- **Patterns**: `"הוספת {dish} להזמנה": "Add {dish} to the order"`. Pieces may move, and each captured piece is
  translated in turn (a Hebrew date inside a Hebrew sentence comes out English on both levels).
- **Sentence-safe**: a placeholder never runs past the end of a sentence, so a key can't swallow the next sentence
  and paste it back untranslated. `₪12.50` still matches (a full stop ends a sentence only before whitespace).
- **Nothing guessed**: text with no Hebrew letter is never touched, and text with no entry stays as written.
- **One engine, two places**: the browser and the Worker import the same module, so the page a reader sees and the
  page a crawler indexes cannot disagree.

## Install

```sh
npm install github:qderai/hebrew-i18n
```

## In the browser

```js
import { localize, pickLanguage } from "@qderai/hebrew-i18n/browser";
import en from "./en.js";

if (pickLanguage() === "en") localize(document.documentElement, en);
```

`localize` translates text nodes and the attributes people read (`placeholder`, `aria-label`, `title`, `alt`,
`content`, button `value`), sets `lang`/`dir` on `<html>`, and keeps watching: whatever your scripts render later
is translated as it lands. Mark anything that must never be translated (people's names, addresses, user input)
with `data-no-i18n`.

`pickLanguage()` takes `?lang=` (and remembers it), then the reader's stored choice, then Hebrew. It deliberately
ignores the browser's language: crawlers render with `en-US`, and would otherwise index your English page as the
Hebrew original.

## On Cloudflare Workers

```js
import { translateResponse } from "@qderai/hebrew-i18n/worker";
import en from "./en.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/en/")) {
      const hebrew = await env.ASSETS.fetch(new URL(url.pathname.slice(3), url));
      return translateResponse(hebrew, en, { lang: "en" });
    }
    return env.ASSETS.fetch(req);
  },
};
```

An HTMLRewriter pass with the same rules: text is buffered to whole text nodes before lookup, entities are read
decoded and untranslated text goes back byte for byte, JSON-LD is translated by **value** (never by key), and
`script`, `style`, `code`, `pre` and `[data-no-i18n]` are skipped.

## In code

```js
import { createTranslator, t } from "@qderai/hebrew-i18n";

const translate = createTranslator(en);
translate("הוספת פיצה להזמנה"); // "Add פיצה to the order"  (or null when nothing matches)
t(translate, "משהו אחר");       // falls back to the original text
```

## Example

`example/index.html` is a small Hebrew page with an English switch. Serve the folder (for example
`python -m http.server`) and open `/example/?lang=en`.

## Tests

```sh
npm test
```

## License

Apache-2.0. Copyright 2026 Qder AI. Issues and pull requests are welcome; see our
[contributing guide](https://github.com/qderai/.github/blob/main/CONTRIBUTING.md).
