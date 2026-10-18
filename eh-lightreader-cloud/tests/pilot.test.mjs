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
test("HTML loader keeps original app and adds cloud sidecar", async () => {
  const fixture = "<!doctype html><body><script>let page='hi';document.open();document.write(page);document.close()</script></body>";
  const response = await cloud.fetch(new Request("https://example.workers.dev/"), {
    ASSETS: {fetch: async () => new Response(fixture, {headers: {"content-type":"text/html"}})}
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes("/__ehr_cloud.js"));
  assert.ok(html.includes("document.write(page)"));
});
test("non-home static assets are delegated unchanged", async () => {
  const response = await cloud.fetch(new Request("https://example.workers.dev/assets/part-0.b64"), {
    ASSETS: {fetch: async () => new Response("raw static asset")}
  });
  assert.equal(await response.text(), "raw static asset");
});
