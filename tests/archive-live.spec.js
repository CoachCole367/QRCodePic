import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Explicit opt-in only: creates one synthetic camera photo, then deletes it.
test("live archive accepts a synthetic selfie and keeps it owner-only", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.LIVE_ARCHIVE !== "1",
    "Run explicitly with the local owner credential file.",
  );
  const origin =
    "https://this-you-private-archive-cole367.coachcole.chatgpt.site";
  const credentials = await readFile(".archive-owner.txt", "utf8");
  const password = credentials.match(/^Password: (.+)$/m)?.[1];
  if (!password) throw new Error("Local owner credentials are missing.");
  const authorization = `Basic ${Buffer.from(`owner:${password}`).toString("base64")}`;
  let id;
  try {
    // Use the production frontend origin for CORS, with the pending local build.
    const frontend = "https://coachcole367.github.io/QRCodePic/";
    await page.route(frontend, async (route) =>
      route.fulfill({
        contentType: "text/html",
        body: await readFile("index.html", "utf8"),
      }),
    );
    await page.route(`${frontend}app.js?v=4`, async (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: await readFile("app.js", "utf8"),
      }),
    );
    const uploadRequest = page.waitForRequest(`${origin}/uploads`);
    await page.goto(frontend);
    const request = await uploadRequest;
    id = request.headers()["x-capture-id"];
    await expect(page.locator("#reveal")).toBeVisible();
    await expect(page.locator("#archive-status")).toContainText("Saved to", {
      timeout: 20000,
    });
    expect((await fetch(`${origin}/archive`)).status).toBe(401);
    expect((await fetch(`${origin}/photo/${id}.jpg`)).status).toBe(401);
    const stored = await fetch(`${origin}/photo/${id}.jpg`, {
      headers: { authorization },
    });
    expect(stored.status).toBe(200);
    expect(
      Buffer.from(await stored.arrayBuffer()).equals(request.postDataBuffer()),
    ).toBe(true);
    const gallery = await fetch(`${origin}/archive`, {
      headers: { authorization },
    });
    expect(gallery.status).toBe(200);
    expect((await gallery.text()).includes(id)).toBe(true);
    // Exercise the actual form, not a Node POST with a manually supplied Origin.
    const ownerContext = await browser.newContext({
      httpCredentials: { username: "owner", password, origin },
    });
    try {
      const ownerPage = await ownerContext.newPage();
      const ownerResponse = await ownerPage.goto(`${origin}/archive`);
      expect(ownerResponse.headers()["referrer-policy"]).toBe("same-origin");
      ownerPage.on("dialog", (dialog) => dialog.accept());
      const form = ownerPage
        .locator("form")
        .filter({ has: ownerPage.locator(`input[name="id"][value="${id}"]`) });
      const submitted = ownerPage.waitForResponse(
        (response) =>
          response.url() === `${origin}/archive/delete` &&
          response.request().method() === "POST",
      );
      await form.getByRole("button", { name: "Delete photo" }).click();
      const deletion = await submitted;
      expect(deletion.request().headers().origin).toBe(origin);
      expect(deletion.status()).toBe(303);
      await expect(
        ownerPage.locator(`input[name="id"][value="${id}"]`),
      ).toHaveCount(0);
      expect(
        (
          await fetch(`${origin}/photo/${id}.jpg`, {
            headers: { authorization },
          })
        ).status,
      ).toBe(404);
    } finally {
      await ownerContext.close();
    }
  } finally {
    if (id) {
      const deletion = await fetch(`${origin}/archive/delete`, {
        method: "POST",
        redirect: "manual",
        headers: { authorization, Origin: origin },
        body: new URLSearchParams({ id }),
      });
      expect(deletion.status).toBe(303);
      expect(
        (
          await fetch(`${origin}/photo/${id}.jpg`, {
            headers: { authorization },
          })
        ).status,
      ).toBe(404);
    }
  }
});
