import test from "node:test";
import assert from "node:assert/strict";
import cloud from "../src/index.js";
import {bridgeScript} from "../src/bridge.js";

test("the additive cloud sidecar parses", () => {
  assert.doesNotThrow(() => new Function(bridgeScript));
});
test("cloud health identifies separate worker", async () => {
  const result = await cloud.fetch(new Request("https://example.workers.dev/api/health"), {});
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.ok, true);
  assert.equal(data.r_unchanged, true);
});
test("API rejects arbitrary page proxy hosts and bad gallery ids", async () => {
  const a = await cloud.fetch(new Request("https://example.workers.dev/api/page?url=https%3A%2F%2Fevil.example%2Fs%2Fa%2F1-2"), {});
  assert.equal(a.status, 400);
  const b = await cloud.fetch(new Request("https://example.workers.dev/api/gallery?gid=hello&token=a"), {});
  assert.equal(b.status, 400);
});
test("cloud bootstrap injects valid bridge script after decompression", async () => {
  const {readFileSync} = await import("node:fs");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const start = html.indexOf("<script>") + 8;
  const end = html.indexOf("</script>",start);
  assert.ok(start >= 8 && end > start, "bootstrap inline JS present");
  const script = html.slice(start,end);
  assert.doesNotThrow(() => new Function(script));
  const anchor = script.indexOf('page=page.replace("</body>"');
  assert.ok(anchor >= 0, "cloud bridge loaded from static bootstrap");
  const transform = script.slice(anchor,script.indexOf("document.open();",anchor));
  const result = new Function("page",transform + "return page;")("<html><body>Hello</body></html>");
  assert.ok(result.includes("<script src='/__ehr_cloud.js?v=1402'></script>"), "valid tag emitted");
  assert.equal(result.includes("<\\/script>"),false, "no escaped closing script tag");
});

test("cloud app loader is no longer rewritten at runtime", async () => {
  const fixture = "<!doctype html><html><body>Already instrumented</body></html>";
  const response = await cloud.fetch(new Request("https://example.workers.dev/"), {
    ASSETS: {fetch: async () => new Response(fixture, {headers: {"content-type":"text/html"}})}
  });
  assert.equal(response.status,200);
  assert.equal(await response.text(),fixture);
  assert.ok((response.headers.get("cache-control")||"").includes("no-store"));
});

test("non-home static assets are delegated unchanged", async () => {
  const response = await cloud.fetch(new Request("https://example.workers.dev/assets/part-0.b64"), {
    ASSETS: {fetch: async () => new Response("raw static asset")}
  });
  assert.equal(await response.text(), "raw static asset");
});

test("cloud bridge JavaScript is served directly", async () => {
  const response = await cloud.fetch(new Request("https://example.workers.dev/__ehr_cloud.js"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/);
  assert.match(await response.text(), /ehr-cloud/);
});
