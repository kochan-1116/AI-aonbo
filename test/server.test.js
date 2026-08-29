import test from "node:test";
import assert from "node:assert/strict";
import { createStaticServer } from "../server.js";

async function withServer(run) {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("本番サーバーはアプリとヘルスチェックを配信する", async () => {
  await withServer(async (origin) => {
    const app = await fetch(`${origin}/`);
    assert.equal(app.status, 200);
    assert.match(await app.text(), /緊急車両セーフティナビ/);
    assert.equal(app.headers.get("permissions-policy"), "geolocation=(self), camera=(), microphone=()");
    assert.match(app.headers.get("content-security-policy"), /tile\.openstreetmap\.org/);

    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
  });
});

test("本番サーバーは非公開ファイル・不正メソッドを拒否する", async () => {
  await withServer(async (origin) => {
    assert.equal((await fetch(`${origin}/package.json`)).status, 404);
    assert.equal((await fetch(`${origin}/..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${origin}/`, { method: "POST" })).status, 405);
  });
});
