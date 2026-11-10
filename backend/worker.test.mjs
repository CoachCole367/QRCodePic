import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const origin = "https://archive.example";
const uploadOrigin = "https://coachcole367.github.io";
const password = "test-only-password-not-a-real-secret-123456789";
const authorization = `Basic ${btoa(`owner:${password}`)}`;
const id = "12345678-1234-4123-8123-123456789abc";
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

function environment() {
  const photos = new Map();
  return {
    ARCHIVE_PASSWORD: password,
    photos,
    BUCKET: {
      async head(key) {
        return photos.has(key) ? { key } : null;
      },
      async put(key, bytes) {
        photos.set(key, { bytes, uploaded: new Date() });
      },
      async get(key) {
        return photos.has(key) ? { body: photos.get(key).bytes } : null;
      },
      async delete(key) {
        photos.delete(key);
      },
      async list() {
        return {
          objects: [...photos].map(([key, value]) => ({
            key,
            uploaded: value.uploaded,
          })),
          truncated: false,
        };
      },
    },
  };
}

function request(path, options = {}) {
  return new Request(origin + path, options);
}
function upload(body = jpeg, headers = {}) {
  return request("/uploads", {
    method: "POST",
    body,
    headers: {
      Origin: uploadOrigin,
      "Content-Type": "image/jpeg",
      "X-Capture-Id": id,
      ...headers,
    },
  });
}

test("uploads automatically, saves privately, and reuses capture IDs on retries", async () => {
  const env = environment();
  const first = await worker.fetch(upload(), env);
  assert.equal(first.status, 201);
  assert.equal(first.headers.get("Access-Control-Allow-Origin"), uploadOrigin);
  assert.deepEqual(await first.json(), { saved: true, id });
  assert.equal((await worker.fetch(upload(), env)).status, 201);
  assert.equal(env.photos.size, 1);
  for (const path of [
    "/archive",
    "/archive.css",
    "/archive.js",
    `/photo/${id}.jpg`,
  ]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
});

test("owner can list and read images while an incorrect password cannot", async () => {
  const env = environment();
  await worker.fetch(upload(), env);
  const gallery = await worker.fetch(
    request("/archive", { headers: { authorization } }),
    env,
  );
  assert.equal(gallery.status, 200);
  assert.match(await gallery.text(), /PRIVATE ARCHIVE/);
  const photo = await worker.fetch(
    request(`/photo/${id}.jpg`, { headers: { authorization } }),
    env,
  );
  assert.equal(photo.status, 200);
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), jpeg);
  assert.equal(
    photo.headers.get("Cross-Origin-Resource-Policy"),
    "same-origin",
  );
  assert.equal(
    (
      await worker.fetch(
        request("/archive", { headers: { authorization: "Basic wrong" } }),
        env,
      )
    ).status,
    401,
  );
});

test("rejects disallowed origins, methods, MIME types, signatures and capture IDs", async () => {
  const env = environment();
  for (const [req, code] of [
    [upload(jpeg, { Origin: "https://attacker.example" }), 403],
    [upload(jpeg, { Origin: "" }), 403],
    [request("/uploads", { headers: { Origin: uploadOrigin } }), 405],
    [upload(jpeg, { "Content-Type": "text/html" }), 415],
    [upload(new TextEncoder().encode("<script>bad</script>")), 415],
    [upload(jpeg, { "X-Capture-Id": "../bad" }), 400],
    [upload(jpeg, { "Content-Length": String(5 * 1024 * 1024) }), 413],
    [upload(new Uint8Array(4 * 1024 * 1024 + 1)), 413],
  ])
    assert.equal((await worker.fetch(req, env)).status, code);
  assert.equal(env.photos.size, 0);
});

test("CORS preflight authorizes only upload headers on the configured origin", async () => {
  const response = await worker.fetch(
    request("/uploads", {
      method: "OPTIONS",
      headers: { Origin: uploadOrigin },
    }),
    environment(),
  );
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Headers"),
    "Content-Type, X-Capture-Id",
  );
});

test("owner deletion requires authentication, POST, and same-origin CSRF check", async () => {
  const env = environment();
  await worker.fetch(upload(), env);
  assert.equal(
    (await worker.fetch(request("/archive/delete", { method: "POST" }), env))
      .status,
    401,
  );
  const badOrigin = await worker.fetch(
    request("/archive/delete", {
      method: "POST",
      headers: { authorization, Origin: "https://attacker.example" },
      body: new URLSearchParams({ id }),
    }),
    env,
  );
  assert.equal(badOrigin.status, 403);
  assert.equal(env.photos.size, 1);
  const response = await worker.fetch(
    request("/archive/delete", {
      method: "POST",
      headers: { authorization, Origin: origin },
      body: new URLSearchParams({ id }),
    }),
    env,
  );
  assert.equal(response.status, 303);
  assert.equal(env.photos.size, 0);
});

test("missing storage or owner secret fails closed", async () => {
  const env = environment();
  delete env.ARCHIVE_PASSWORD;
  assert.equal((await worker.fetch(upload(), env)).status, 503);
  assert.equal(
    (
      await worker.fetch(
        request("/archive", { headers: { authorization } }),
        env,
      )
    ).status,
    401,
  );
  assert.deepEqual(await (await worker.fetch(request("/health"), env)).json(), {
    ready: false,
  });
});

test("archive capacity blocks new photos while accepting existing capture retries", async () => {
  const env = environment();
  await worker.fetch(upload(), env);
  env.BUCKET.list = async () => ({
    objects: Array.from({ length: 1000 }, () => ({})),
    truncated: true,
  });
  assert.equal(
    (
      await worker.fetch(
        upload(jpeg, {
          "X-Capture-Id": "22345678-1234-4123-8123-123456789abc",
        }),
        env,
      )
    ).status,
    507,
  );
  assert.equal((await worker.fetch(upload(), env)).status, 201);
});
