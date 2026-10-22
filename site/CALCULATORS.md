# Adding your own calculator

The `/calculators` index already lists three slots for your existing calculators: income tax, electricity bill and construction cost. Each is marked "coming soon" until you add its page. The same steps work for any new calculator.

## 1. Create the page (Bengali and English)

```
site/src/views/calculators/IncomeTax.astro     ← the form, results and script (shared by both languages)
site/src/pages/calculators/income-tax.astro    ← Bengali page at /calculators/income-tax
site/src/pages/en/calculators/income-tax.astro ← English page at /en/calculators/income-tax
```

A static file such as `income-tax.astro` takes precedence over the built-in `[slug].astro` route, so it doesn't clash with anything.

Each page file wraps the view in the site layout:

```astro
---
import Base from '../../layouts/Base.astro';
import { getLatest } from '../../lib/data';
import IncomeTax from '../../views/calculators/IncomeTax.astro';

const latest = await getLatest();
---

<Base lang="bn" path="/calculators/income-tax" title="আয়কর ক্যালকুলেটর | bdrate" description="…" generatedAt={latest.generated_at}>
  <IncomeTax lang="bn" />
</Base>
```

For the English file, use `lang="en"` and import from `../../../`.

## 2. Build the view from the shared parts

Copy `views/calculators/Emi.astro` as a starting point. It shows the whole pattern:

- `components/calc/Shell.astro` adds the breadcrumbs, the heading, the intro text, the card, and a `notes` slot for caveats and sources.
- `components/calc/Field.astro` is a text input that accepts Bengali (০–৯) and Latin digits plus commas. Use `suffix` for units and `hint` for help text.
- `components/calc/Select.astro` is a dropdown.
- `components/calc/Result.astro` is an output. Mark the main answer with `primary`.
- `lib/calc-ui.ts` → `bindCalculator(form, compute)` reruns `compute` on every input, and also when the visitor switches between Bengali and Latin digits. Inside `compute`:
  - `c.num('name')` reads a number;
  - `c.str('name')` reads raw text;
  - `c.out('name', text)` writes a result;
  - `c.taka(n)` formats money as "১,২৩৪ টাকা" or "Tk 1,234".

Put the pure arithmetic in `lib/calc.ts` (or a file of its own) and add a test next to it (see `lib/calc.test.ts`), so `npm test -w site` catches mistakes.

If your existing calculators are plain HTML/JS, paste the markup into the view, then replace their `<input>`s with `Field` (or keep yours and read them in `compute`). Keep the arithmetic as it is.

## 3. Switch it on in the index

In `site/src/lib/calculators.ts`, set `ready: true` on its `CUSTOM_CALCULATORS` entry. Adjust the names or descriptions there if needed. A new calculator gets a new entry.

## 4. Check

```bash
npm test -w site
npm run build -w site
```

Then open `site/dist/calculators/income-tax.html`. Pushing to `main` deploys it.

## Rules the built-in calculators follow

- All computation happens in the browser. Nothing a visitor types is sent anywhere.
- Rates that change, such as tax slabs or tariffs, sit in one constant with the date and source URL beside them. The notes say which period they cover.
- Show the result in the visitor's digit preference: always format through `c.taka()` or `formatNumber(…, c.digits)`.
