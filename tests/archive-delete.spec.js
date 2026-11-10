import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import worker from "../backend/worker.js";

const password = "browser-test-only-not-an-owner-credential-12345";
const id = "12345678-1234-4123-8123-123456789abc";
test.use({ httpCredentials: { username: "owner", password } });

test("owner can delete through the browser form with its actual privacy headers", async ({
  page,
}) => {
  let present = true;
  const env = {
    ARCHIVE_PASSWORD: password,
    BUCKET: {
      async list() {
        return {
          objects: present
            ? [{ key: `photos/${id}.jpg`, uploaded: new Date() }]
            : [],
        };
      },
      async get() {
        return present ? { body: new Uint8Array([255, 216, 255, 217]) } : null;
      },
      async delete(key) {
        if (key === `photos/${id}.jpg`) present = false;
      },
    },
  };
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(
        `http://127.0.0.1:${server.address().port}${incoming.url}`,
        {
          method: incoming.method,
          headers: incoming.headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        },
      );
      const response = await worker.fetch(request, env);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(`${origin}/archive`);
    page.on("dialog", (dialog) => dialog.accept());
    const submitted = page.waitForResponse(
      (response) =>
        response.url() === `${origin}/archive/delete` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Delete photo" }).click();
    const deletion = await submitted;
    expect(deletion.request().headers().origin).toBe(origin);
    expect(deletion.status()).toBe(303);
    await expect(page.getByText("No photos yet.")).toBeVisible();
    expect(present).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
