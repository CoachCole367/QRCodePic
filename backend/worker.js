const ALLOWED_ORIGIN = "https://coachcole367.github.io";
const LIMIT_BYTES = 4 * 1024 * 1024;
const LIMIT_PHOTOS = 1000;
const ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();

function reply(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      ...headers,
    },
  });
}

function cors(request) {
  return request.headers.get("Origin") === ALLOWED_ORIGIN
    ? {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        Vary: "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Capture-Id",
      }
    : null;
}

async function authorized(request, password) {
  if (!password || password.length < 32) return false;
  const actual = request.headers.get("Authorization") || "";
  const expected = `Basic ${btoa(`owner:${password}`)}`;
  const [a, b] = await Promise.all(
    [actual, expected].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
  let difference = 0;
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function readImage(request) {
  if (request.headers.get("Content-Type") !== "image/jpeg")
    return { error: 415 };
  if (Number(request.headers.get("Content-Length")) > LIMIT_BYTES)
    return { error: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { error: 400 };
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > LIMIT_BYTES) {
      await reader.cancel();
      return { error: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Only raster JPEGs are accepted; HTML, SVG, and arbitrary file types are rejected.
  if (
    length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[length - 2] !== 0xff ||
    bytes[length - 1] !== 0xd9
  )
    return { error: 415 };
  return { bytes };
}

const archiveStyle = `:root{color-scheme:dark;font-family:Arial,sans-serif;background:#111210;color:#f7f8ef}*{box-sizing:border-box}body{margin:0 auto;max-width:1200px;padding:30px 20px}header{display:flex;justify-content:space-between;gap:15px;align-items:center}h1{font-size:clamp(32px,6vw,64px);letter-spacing:-2px;margin:0}p{color:#a5aa9e;line-height:1.6}a{color:#d4ff58}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;margin:25px 0}figure{margin:0;border:1px solid #35382f;background:#1a1c18}img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}figcaption{padding:14px;font-size:12px}form{margin:12px 0 0}button{font:inherit;background:#d4ff58;color:#111;border:0;padding:12px 18px;cursor:pointer}nav{display:flex;gap:20px;margin:30px 0}input{display:none}`;
const archiveScript = `document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{if(!confirm('Permanently delete this archived photo?'))event.preventDefault();}));`;

async function gallery(request, env) {
  const page = Math.max(
    0,
    Math.min(
      41,
      Number.parseInt(new URL(request.url).searchParams.get("page"), 10) || 0,
    ),
  );
  const listing = await env.BUCKET.list({
    prefix: "photos/",
    limit: LIMIT_PHOTOS,
  });
  const photos = listing.objects
    .filter(
      (object) =>
        ID.test(object.key.slice(7, -4)) && object.key.endsWith(".jpg"),
    )
    .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  const visible = photos.slice(page * 24, page * 24 + 24);
  const cards = visible
    .map((object) => {
      const id = object.key.slice(7, -4);
      const time = new Date(object.uploaded).toISOString();
      return `<figure><a href="/photo/${id}.jpg" target="_blank" rel="noopener"><img src="/photo/${id}.jpg" loading="lazy" alt="Archived selfie"></a><figcaption><time>${time}</time><form action="/archive/delete" method="post"><input name="id" value="${id}"><input name="page" value="${page}"><button type="submit">Delete photo</button></form></figcaption></figure>`;
    })
    .join("");
  return reply(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Wall of Fame</title><link rel="stylesheet" href="/archive.css"><script src="/archive.js" defer></script><header><h1>WALL OF FAME.</h1><span>PRIVATE ARCHIVE</span></header><p>${photos.length} / ${LIMIT_PHOTOS} photos. Only someone with your owner password can see these. Close your browser window to clear its saved HTTP login.</p><div class="grid">${cards || "<p>No photos yet.</p>"}</div><nav>${page > 0 ? `<a href="/archive?page=${page - 1}">← Previous</a>` : ""}${(page + 1) * 24 < photos.length ? `<a href="/archive?page=${page + 1}">Next →</a>` : ""}</nav></html>`,
    200,
    { "Content-Type": "text/html; charset=utf-8" },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const uploadCors = path === "/uploads" ? cors(request) : null;
    try {
      if (path === "/health")
        return reply(
          JSON.stringify({
            ready: Boolean(env.BUCKET && env.ARCHIVE_PASSWORD?.length >= 32),
          }),
          200,
          { "Content-Type": "application/json" },
        );
      if (path === "/uploads") {
        if (!uploadCors) return reply("Forbidden", 403);
        if (request.method === "OPTIONS") return reply(null, 204, uploadCors);
        if (request.method !== "POST")
          return reply("Method not allowed", 405, uploadCors);
        if (
          !env.BUCKET ||
          !env.ARCHIVE_PASSWORD ||
          env.ARCHIVE_PASSWORD.length < 32
        )
          return reply("Archive not configured", 503, uploadCors);
        const id = request.headers.get("X-Capture-Id") || "";
        if (!ID.test(id)) return reply("Invalid capture ID", 400, uploadCors);
        const image = await readImage(request);
        if (image.error)
          return reply("Invalid or oversized JPEG", image.error, uploadCors);
        const key = `photos/${id}.jpg`;
        // Capture IDs make network retries idempotent without storing identity or IPs.
        if (!(await env.BUCKET.head(key))) {
          const current = await env.BUCKET.list({
            prefix: "photos/",
            limit: LIMIT_PHOTOS,
          });
          if (current.objects.length >= LIMIT_PHOTOS || current.truncated)
            return reply("Archive is full", 507, uploadCors);
          await env.BUCKET.put(key, image.bytes, {
            httpMetadata: { contentType: "image/jpeg" },
          });
        }
        return reply(JSON.stringify({ saved: true, id }), 201, {
          ...uploadCors,
          "Content-Type": "application/json",
        });
      }
      if (path === "/") return reply(null, 302, { Location: "/archive" });
      if (
        path === "/archive" ||
        path.startsWith("/archive.") ||
        path === "/archive/delete" ||
        path.startsWith("/photo/")
      ) {
        if (!(await authorized(request, env.ARCHIVE_PASSWORD)))
          return reply("Owner login required", 401, {
            "WWW-Authenticate":
              'Basic realm="Private photo archive", charset="UTF-8"',
          });
        if (!env.BUCKET) return reply("Archive not configured", 503);
        if (path === "/archive" && request.method === "GET")
          return gallery(request, env);
        if (path === "/archive.css" && request.method === "GET")
          return reply(archiveStyle, 200, { "Content-Type": "text/css" });
        if (path === "/archive.js" && request.method === "GET")
          return reply(archiveScript, 200, {
            "Content-Type": "text/javascript",
          });
        if (path === "/archive/delete" && request.method === "POST") {
          if (request.headers.get("Origin") !== url.origin)
            return reply("Forbidden", 403);
          const form = await request.formData();
          const id = form.get("id");
          if (typeof id !== "string" || !ID.test(id))
            return reply("Invalid ID", 400);
          await env.BUCKET.delete(`photos/${id}.jpg`);
          return reply(null, 303, { Location: "/archive" });
        }
        const photo = path.match(/^\/photo\/([0-9a-f-]+)\.jpg$/);
        if (photo && ID.test(photo[1]) && request.method === "GET") {
          const object = await env.BUCKET.get(`photos/${photo[1]}.jpg`);
          if (!object) return reply("Not found", 404);
          return reply(object.body, 200, {
            "Content-Type": "image/jpeg",
            "Cross-Origin-Resource-Policy": "same-origin",
          });
        }
      }
      return reply("Not found", 404);
    } catch {
      // Never log photo bytes, credentials, request headers, or visitor identifiers.
      return reply("Archive temporarily unavailable", 503, uploadCors || {});
    }
  },
};
