import type { SiteSettings } from "@/networking/types";

/**
 * The client's two colours, written into the page as CSS custom properties.
 *
 * This is what makes the proposal's branding promise literal — "their logo and
 * two colours go in and the whole site becomes theirs" — without a rebuild or a
 * deploy. The panel writes `accent_colour` and `deep_colour`; this overrides the
 * defaults from globals.css at the document root.
 *
 * Values are validated as hex before being interpolated. Anything from the
 * database that ends up inside a `<style>` tag is a stored-XSS hole if it is not
 * checked: `#fff; } body { background: url(...)` would otherwise close the rule
 * and open another.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function hex(value: string | undefined, fallback: string): string {
  return value && HEX.test(value.trim()) ? value.trim() : fallback;
}

export default function BrandStyle({ settings }: { settings: SiteSettings | null }) {
  if (!settings) return null;
  const accent = hex(settings.accent_colour, "#f0682b");
  const deep = hex(settings.deep_colour, "#14283f");
  // Only emit the override when it differs from the stylesheet default, so the
  // common case ships no inline style at all.
  if (accent === "#f0682b" && deep === "#14283f") return null;
  return (
    <style
      dangerouslySetInnerHTML={{ __html: `:root{--accent:${accent};--deep:${deep}}` }}
    />
  );
}
