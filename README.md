# A.T.L.A.S. — Ready to Publish (Version 7)

This is the full Aestra interactive ancient book, with the Supabase **public connection values already configured**. The Supabase database is already installed in the existing Aestra Character Tracker Supabase project, so **do not rerun** the original setup SQL.

## Create the GitHub Pages site

1. Sign into GitHub as **sladeykins-glitch** at https://github.com/new.
2. Name the new repository **aestra-atlas**, select **Public**, and create it. (Do not tick 'Add a README' if you want to upload these files into an empty repository.)
3. Open the new repository, select **Add file → Upload files**. Drag the actual files and `assets` directory from this extracted ZIP into GitHub; **do not upload the ZIP file itself**. Then click **Commit changes**.
4. Go to **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and click **Save**.
5. Open **https://sladeykins-glitch.github.io/aestra-atlas/** after GitHub reports the site has been published.

## Supabase Authentication (one-time dashboard setting)

Your project is: https://supabase.com/dashboard/project/pbsfiwzwdseslvnprcph

In **Authentication → URL Configuration**, set:

- **Leave the existing Site URL unchanged.** This Supabase project also hosts your Aestra Character Tracker, and replacing its site URL could affect that app.
- Under **Redirect URLs**, **add** this URL without deleting the others: `https://sladeykins-glitch.github.io/aestra-atlas/**`

The deployed A.T.L.A.S. version uses `emailRedirectTo` for sign-up confirmation emails, so it does not depend on changing the shared project's default Site URL.

In **Authentication → Providers → Email**, make sure email/password login is enabled. Keep email confirmation enabled where possible.

## Keeper login

1. Open the published site and click the keyhole to open the book.
2. Open **Archive**. Because the public project URL and publishable key are already configured, the book should connect automatically.
3. Sign in with the same Supabase Authentication user whose UID has role `gm` in the `atlas_members` table.
4. Check that **Keeper's approval desk** appears.

If you created your account through the Supabase Authentication dashboard instead of the website, use the corresponding email/password there.

## Players

Share the public website URL. Each player signs up and requests access using **Archive → Request access**. As Keeper, approve their names in **Archive → Keeper's approval desk**. Don't share your own password.

## Notes

- This is Version 7 (shared archive). Version 8 (freeform scrapbook) is planned next. No talking-AI character or world-map feature is included.
- GitHub Pages files are public. Do not put a service-role secret, SQL credentials, or private GM notes in any file.
- The publishable key included in `app.js` is deliberately public; Supabase Row Level Security and authenticated accounts protect actual data.
- The book's example entries are only local starter content, not preloaded into the shared database.
- Publish a backup using **Archive** to bring across local pages.
- This package prepares hosting but does not itself create the GitHub repository or change the Supabase Auth dashboard settings.