# EH LightReader Cloud — CHANGELOG

## v1.4.0-pilot.1 · 2026-10-19

**Bug:** Opening a category or performing a search in the Cloudflare-hosted PWA still navigated to the original E-Hentai page. The user's iPhone recording confirmed that the old Userscripts handled that original page instead.

**Cause:** The Worker injected a script element into the decompressed HTML string but emitted a literal `<\/script>` instead of a real closing `</script>`. Consequently, the additive cloud navigation bridge could fail to load. The original PWA's `search.onsubmit` and `button.tile` handlers remained active and opened the original website.

**Fix:** Construct the closing script tag at JavaScript runtime using split string fragments, preserving the outer bootstrap script's HTML grammar and emitting a valid inner `<script src='/__ehr_cloud.js'></script>`. No changes to Userscripts 1.3.2 or R.

**Regression:** Added an offline test that executes the bridge-injection snippet and asserts a proper script close tag and absence of escaped `<\/script>`; added a route test for `/__ehr_cloud.js`. Cloud CI passed. Cloudflare redeploy and iPhone navigation retest are not verified in this report.

**Open risks:** E-Hentai upstream access, catalog compatibility, direct images and PWA offline navigation remain unverified on real iPhone.
