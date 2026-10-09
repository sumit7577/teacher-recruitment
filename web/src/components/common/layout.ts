/**
 * The two className checks `Row` and `Column` make before adding their own
 * display and direction.
 *
 * **Why `hasBaseDirection` has to exist.** `<Row className="flex-col sm:flex-row">`
 * is the ordinary way to say "stacked on a phone, side by side on a laptop",
 * and until this check it did nothing at all. `Row` prepended its own
 * `flex-row`, so the element carried `flex flex-row flex-col sm:flex-row` — and
 * the order of classes in the attribute is not what decides a tie. Source order
 * in the stylesheet is, and Tailwind emits `.flex-row` *after* `.flex-col`:
 *
 *     24857  .flex-col{flex-direction:column}
 *     24889  .flex-row{flex-direction:row}
 *
 * So `flex-row` won at every width, on all 42 call sites that used the pattern.
 * The vacancy board put its filter sidebar beside a crushed results column on a
 * phone; every two-up form field stayed two-up at 360px.
 *
 * Responsive variants were never the problem — Tailwind emits those far later
 * (`sm:flex-row` at 38725, `lg:flex-row` at 40539), so they still win over a
 * base direction. Only the *unprefixed* direction collides, which is why that
 * is the only thing suppressed here: `<Row className="lg:flex-col">` keeps
 * `flex-row` as its base and flips at `lg`, exactly as it reads.
 */

const DIRECTIONS = new Set(["flex-row", "flex-row-reverse", "flex-col", "flex-col-reverse"]);

/** True when the caller sets a direction with no variant prefix of its own. */
export function hasBaseDirection(className: string): boolean {
  return className.split(/\s+/).some((token) => DIRECTIONS.has(token));
}

/**
 * True when the caller is using the container as a grid.
 *
 * Two conflicting `display` rules on one element make width-stretching
 * unreliable across browsers, so the flex display is dropped entirely.
 */
export function hasGridDisplay(className: string): boolean {
  return className.split(/\s+/).some(
    (token) =>
      token === "grid" ||
      token === "inline-grid" ||
      /^[a-z]+:grid$/.test(token) ||
      /^[a-z]+:inline-grid$/.test(token),
  );
}
