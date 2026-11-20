# A.T.L.A.S. — The Living Book of Aestra

Live site: https://sladeykins-glitch.github.io/aestra-atlas/

A shared fantasy campaign archive for the world of Aestra, built as an interactive book. Hosted on GitHub Pages and connected to Supabase Auth, Database, Realtime and private Storage.

## Version 8.2 — Scrapbook Workshop

The separate scrapbook editor now offers decorative paper and photo treatments, adjustable rotation and front/back layering. Select an element to change its appearance or rotate it from -18° to +18°.

- **Text styles:** Simple parchment (original appearance), torn parchment, field label and old letter paper.
- **Image styles:** Simple border (original appearance), brass pin, wax seal, paper clip and torn edges.
- **Layering:** Bring to front / Send to back, so pictures and notes can overlap.
- **Duplication:** Duplicate a selected note or illustration (within the existing 32-piece / 12-image limits).
- **Undo / redo:** 50 steps of in-editor history for changes to elements, including position, size, text, appearance, rotation, layering, duplication and deletion. Toolbar buttons are available; Ctrl/Cmd+Z and Ctrl/Cmd+Y work when focus is outside form fields.

Appearance and rotation are stored as `style` and `angle` per item in the existing `scrapbook_layout` JSONB. Existing scrapbook items without these values keep their original styling. **Classic Pages remain unchanged.**

## Version 8.1 — Adventurer's Scrapbook

**Two separate page types are available:**

- **Classic Page** — the original book page with its existing text editor, illustration, ink, image zoom, scrolling and page-turn mechanics. The classic editor and layouts have not been redesigned.
- **Scrapbook Page** — click **✦ Scrapbook** in the top toolbar to create a freeform page. Give it a title and chapter, then add movable text boxes and illustrations. Select an item and drag to reposition it, or drag the turquoise corner to resize. Edit text in the selected item's inspector. Save to publish the layout to approved travellers.

Scrapbook pages support multiple private illustrations, GM-only visibility, revision history, mobile layout and live multi-user read access. **Do not assume two people can edit the same page simultaneously without a conflict**: the revision check protects the most recent saved layout.

Current limits: 32 elements / 12 pictures per scrapbook; image uploads must be PNG, JPG, WebP or GIF, no more than 5 MB each. Layouts use a portrait canvas. The decorative pinned-paper styles and advanced collaborative co-editing remain later enhancements.

### Storage / schema

The existing `public.atlas_entries` table has additive columns `page_kind` (default `classic`) and `scrapbook_layout` (default `[]`), preserving old entries. The audit trigger also copies these fields into `atlas_entry_revisions`. Scrapbook images are uploaded to the existing private `atlas-images` bucket; a dedicated SELECT policy allows authorized readers to obtain signed links for images referenced by visible scrapbook pages.

`scrapbook.js` contains the separate layout editor. The existing Classic Page entry markup and editing logic remain in `app.js`.

## Keeper and party accounts

1. Open A.T.L.A.S. and click the glowing keyhole.
2. Under **⚙ Archive**, sign in with your Supabase account.
3. Players use **Request access**. The Keeper approves them under **Keeper's Approval Desk**.
4. Approved players can read, write and collaborate on shared party pages. Only the Keeper can read GM-only pages.

Supabase project: https://supabase.com/dashboard/project/pbsfiwzwdseslvnprcph

Leave the Supabase Auth Site URL unchanged because the project is shared with another app. The A.T.L.A.S. URL should be an allowed Auth redirect under **Authentication → URL Configuration**:

`https://sladeykins-glitch.github.io/aestra-atlas/**`

## Site files

- `index.html` — book structure and dialogs
- `styles.css` — parchment and book visual design
- `app.js` — classic pages, auth, shared archive and page turning
- `ink.js` — handwritten magical ink
- `scrapbook.js` — V8 scrapbook page editor and rendering
- `assets/` — original cover and parchment images

All website files are public, so **never commit Supabase service-role keys, database passwords, or secret campaign content**. The frontend uses a public publishable key; actual data access is enforced by Supabase RLS.

### Deployment

Changes to the GitHub `main` branch deploy via GitHub Pages. The default publish folder is the repository root.

