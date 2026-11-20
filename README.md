# A.T.L.A.S. — The Living Book of Aestra

Live site: https://sladeykins-glitch.github.io/aestra-atlas/

A shared fantasy campaign archive for the world of Aestra, built as an interactive book. Hosted on GitHub Pages and connected to Supabase Auth, Database, Realtime and private Storage.

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

