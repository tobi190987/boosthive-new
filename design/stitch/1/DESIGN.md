# Design System Document: Sophisticated Light Editorial

## 1. Overview & Creative North Star: "The Digital Curator"
The Creative North Star for this design system is **The Digital Curator**. Unlike standard SaaS platforms that feel like rigid spreadsheets, this system treats data as high-end editorial content. We move away from "boxed-in" layouts toward a fluid, layered experience that breathes.

**Breaking the Template:**
To move beyond a "stock" look, we prioritize **intentional asymmetry** and **tonal depth**. Large display typography should be paired with generous whitespace (using the `16` and `20` spacing tokens) to create a sense of luxury and calm. Elements should overlap slightly—such as a glassmorphic card partially covering a vibrant gradient header—to create a sense of physical three-dimensionality.

---

## 2. Colors: Tonal Atmosphere
We avoid the harshness of `#ffffff` and the sterility of pure black. Our palette is built on soft slates and deep, oceanic indigos.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. 
Boundaries must be defined solely through background color shifts. For example, a `surface_container_low` sidebar should sit against a `surface` main content area. This creates a "molded" look rather than a "drawn" one.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of frosted glass.
- **Base Layer:** `surface` (#f6fafe) — Use for the widest background areas.
- **Mid Layer:** `surface_container` (#eaeef2) — Use for primary content groupings.
- **Top Layer:** `surface_container_lowest` (#ffffff) — Reserved for cards or active elements that need to "pop" forward.

### The "Glass & Gradient" Rule
To inject "soul" into the interface, primary CTAs and hero sections should utilize a linear gradient: `primary` (#004bc8) to `primary_container` (#2664ec). For floating navigation or modal overlays, use a **Glassmorphic** effect:
- **Background:** `surface` at 70% opacity.
- **Backdrop-blur:** 12px to 20px.
- **Border:** `outline_variant` at 20% opacity (The "Ghost Border").

---

## 3. Typography: The Editorial Voice
We use a dual-typeface system to balance character with legibility.

*   **Display & Headlines (Manrope):** Geometric, modern, and authoritative. Use `display-lg` for high-impact landing moments and `headline-md` for dashboard section titles. The wide apertures of Manrope convey openness and trust.
*   **Body & UI (Inter):** Highly legible and functional. Use `body-md` for standard text. The neutral nature of Inter ensures that complex SaaS data remains the focus.

**Hierarchy as Identity:**
Always lead with a strong "Display" or "Headline" style followed by generous `3.5` (1.2rem) spacing. This "Editorial Gap" signals to the user that the information is premium and curated, not cluttered.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are often messy. We achieve depth through the **Layering Principle**.

*   **Natural Lift:** Place a `surface_container_lowest` card on a `surface_container_low` background. The shift from #f0f4f8 to #ffffff provides a soft, natural lift without a single pixel of shadow.
*   **Ambient Shadows:** When a "floating" effect is required (e.g., a dropdown), use an extra-diffused shadow: `0 20px 40px rgba(23, 28, 31, 0.06)`. The tint is derived from `on_surface`, making it feel like ambient light rather than a gray smudge.
*   **The Ghost Border Fallback:** If a container requires a border for accessibility, use the `outline_variant` token at **15% opacity**. This provides a hint of structure without breaking the soft aesthetic.

---

## 5. Components: Tactile Minimalism

### Buttons
- **Primary:** Gradient from `primary` to `primary_container`. Roundedness: `md` (0.75rem). Use a subtle inner-glow (1px white at 10% opacity) on the top edge for a tactile, "pressed" quality.
- **Secondary:** `surface_container_highest` background with `on_surface` text. No border.

### Cards & Lists
- **Forbid Dividers:** Do not use horizontal lines to separate list items. Use the `spacing-2` (0.7rem) or `spacing-3` (1rem) tokens to create separation via whitespace.
- **Glass Cards:** For featured content, use `surface` at 60% opacity with a `20px` backdrop blur and a `lg` (1rem) corner radius.

### Input Fields
- **Default State:** `surface_container_low` background, no border.
- **Focus State:** `surface_container_lowest` background with a 2px `primary` "Ghost Border" (20% opacity).
- **Corner Radius:** `md` (0.75rem).

### Navigation Rails
Instead of a solid bar, use a floating rail with `surface` glassmorphism. Active states should be indicated by a `secondary_fixed` (#e1e0ff) pill shape behind the icon, using the `full` roundedness scale.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use `surface_bright` to highlight the most important interactive area on a page.
*   **Do** allow elements to "bleed" or overlap to create a custom, high-end feel.
*   **Do** use the `20` (7rem) spacing token for major section breaks to emphasize the "Editorial" vibe.

### Don’t:
*   **Don’t** use pure black (#000000) for text; always use `on_surface` (#171c1f) to maintain the "Sophisticated Light" softness.
*   **Don’t** use the `none` or `sm` roundedness tokens for containers. We want a friendly, tactile feel; stick to `md`, `lg`, or `xl`.
*   **Don’t** use high-contrast dividers. If you feel the need for a line, try a background color shift instead.