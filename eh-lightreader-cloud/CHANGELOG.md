# EH LightReader Cloud — CHANGELOG

## v1.4.0-pilot.2 · 2026-10-19

**Second fix:** The pilot.1 Worker dynamically modified the decompression bootstrap before serving it. This dependency was fragile and hard to verify across Cloudflare asset cache/deploy versions. Moved the valid cloud bridge script injection directly into `public/index.html` (cloud-only build), and changed the Worker to serve that static loader unchanged with `Cache-Control: no-store` for the homepage. No changes to R or the stable Userscripts 1.3.2.

**Tests:** Added a regression that executes the actual bootstrap injection and checks for an executable `</script>` element; verifies the Worker returns assets without rewriting. GitHub Actions passed. Cloudflare live deployment and real iPhone acceptance are still not verified.


## v1.4.0-pilot.1 · 2026-10-19

**Bug:** Opening a category or performing a search in the Cloudflare-hosted PWA still navigated to the original E-Hentai page. The user's iPhone recording confirmed that the old Userscripts handled that original page instead.

**Cause:** The Worker injected a script element into the decompressed HTML string but emitted a literal `<\/script>` instead of a real closing `</script>`. Consequently, the additive cloud navigation bridge could fail to load. The original PWA's `search.onsubmit` and `button.tile` handlers remained active and opened the original website.

**Fix:** Construct the closing script tag at JavaScript runtime using split string fragments, preserving the outer bootstrap script's HTML grammar and emitting a valid inner `<script src='/__ehr_cloud.js'></script>`. No changes to Userscripts 1.3.2 or R.

**Regression:** Added an offline test that executes the bridge-injection snippet and asserts a proper script close tag and absence of escaped `<\/script>`; added a route test for `/__ehr_cloud.js`. Cloud CI passed. Cloudflare redeploy and iPhone navigation retest are not verified in this report.

**Open risks:** E-Hentai upstream access, catalog compatibility, direct images and PWA offline navigation remain unverified on real iPhone.
