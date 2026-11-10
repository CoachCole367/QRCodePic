import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import jsQR from "jsqr";

async function watchCamera(page) {
  await page.addInitScript(() => {
    window.cameraCalls = [];
    window.cameraTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.cameraCalls.push(constraints);
      const stream = await original(constraints);
      window.cameraTracks.push(...stream.getTracks());
      return stream;
    };
  });
}

test("automatically captures real video pixels, stops camera, downloads, retakes and deletes", async ({
  page,
}) => {
  await watchCamera(page);
  const requests = [];
  page.on("request", (req) =>
    requests.push({ url: req.url(), method: req.method() }),
  );
  await page.goto("/");
  await expect(page.locator("#reveal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "THIS YOU?" })).toBeVisible();
  const result = await page.evaluate(async () => {
    const image = document.getElementById("photo");
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      hasPixels: pixels.some((value, i) => i % 4 !== 3 && value > 20),
      stopped: window.cameraTracks.every((t) => t.readyState === "ended"),
      calls: window.cameraCalls,
    };
  });
  expect(result.stopped).toBe(true);
  expect(result.hasPixels).toBe(true);
  expect(result.width / result.height).toBeCloseTo(0.8, 2);
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0]).toMatchObject({
    audio: false,
    video: { facingMode: "user" },
  });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: /Save the evidence/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("this-you.png");
  const png = PNG.sync.read(await readFile(await download.path()));
  expect(png.width).toBe(result.width);
  await page.getByRole("button", { name: /Retake/ }).click();
  await expect(page.locator("#reveal")).toBeVisible();
  expect(await page.evaluate(() => window.cameraCalls.length)).toBe(2);
  await page.getByRole("button", { name: "Delete my photo" }).click();
  await expect(page.locator("#setup")).toBeVisible();
  await expect(page.locator("#photo")).not.toHaveAttribute("src");
  await expect(page.locator("#download")).not.toHaveAttribute("href");
  expect(
    requests.every(
      (req) =>
        req.method === "GET" &&
        (req.url.startsWith("http://localhost:4173/") ||
          req.url.startsWith("blob:http://localhost:4173/")),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => [
      localStorage.length,
      sessionStorage.length,
      document.cookie,
    ]),
  ).toEqual([0, 0, ""]);
});

for (const [name, message] of [
  ["NotFoundError", "No camera found"],
  ["NotReadableError", "camera is busy"],
  ["AbortError", "interrupted"],
]) {
  test(`handles ${name}`, async ({ page }) => {
    await page.addInitScript((errorName) => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Test", errorName));
    }, name);
    await page.goto("/");
    await expect(page.locator("#status")).toContainText(message);
    await expect(page.locator("#start")).toBeEnabled();
    await expect(page.locator("#reveal")).toBeHidden();
  });
}

test("offers a manual capture when autoplay is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let first = true;
    HTMLMediaElement.prototype.play = function () {
      if (first) {
        first = false;
        return Promise.reject(
          new DOMException("Gesture needed", "NotAllowedError"),
        );
      }
      return play.call(this);
    };
  });
  await page.goto("/");
  await expect(page.locator("#capture")).toBeVisible();
  await page.locator("#capture").click();
  await expect(page.locator("#reveal")).toBeVisible();
});

test("stops a stream granted after leaving the page", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    window.cameraTracks = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.permissionRequested = true;
      await new Promise((resolve) => {
        window.grant = resolve;
      });
      const stream = await original(constraints);
      window.cameraTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.permissionRequested))
    .toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.evaluate(() => window.grant());
  await expect
    .poll(() => page.evaluate(() => window.cameraTracks.length))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      window.cameraTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
  await expect(page.locator("#reveal")).toBeHidden();
});

test("handles an unsupported browser", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined });
  });
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("cannot open the camera");
});

test("explains HTTPS requirements", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { value: false });
  });
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("needs HTTPS");
});

test("hiding the page stops a live manual camera and requires a deliberate restart", async ({
  page,
}) => {
  await watchCamera(page);
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new Error("Tap needed"));
  });
  await page.goto("/");
  await expect(page.locator("#capture")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(
    await page.evaluate(() =>
      window.cameraTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#status")).toContainText("Camera paused");
  expect(await page.evaluate(() => window.cameraCalls.length)).toBe(1);
});

test("missing video frames time out and release the camera", async ({
  page,
}) => {
  await watchCamera(page);
  await page.addInitScript(() => {
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      get: () => 0,
    });
  });
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("didn’t send a frame", {
    timeout: 12000,
  });
  expect(
    await page.evaluate(() =>
      window.cameraTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
});

test("pagehide clears the photo and cancels a pending request", async ({
  page,
}) => {
  await watchCamera(page);
  await page.goto("/");
  await expect(page.locator("#reveal")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.locator("#photo")).not.toHaveAttribute("src");
  expect(
    await page.evaluate(() =>
      window.cameraTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
});

test("narrow and desktop layouts fit without horizontal overflow", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("opening stays fully grey with no words while permission is pending", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.cameraRequestedAt = null;
    navigator.mediaDevices.getUserMedia = () => {
      window.cameraRequestedAt = performance.now();
      return new Promise(() => {});
    };
  });
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.cameraRequestedAt))
    .not.toBeNull();
  expect(await page.evaluate(() => window.cameraRequestedAt)).toBeLessThan(
    1000,
  );
  await expect(page.locator("header")).toBeHidden();
  await expect(page.locator("footer")).toBeHidden();
  await expect(page.locator("#reveal")).toBeHidden();
  await expect(page.locator("#start")).toBeHidden();
  await expect(page.locator("#status")).toBeHidden();
  await expect(page.locator(".consent")).toBeHidden();
  await expect(page.locator("#cancel")).toBeHidden();
  expect(await page.locator("body").innerText()).toBe("");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(128, 128, 128)",
  );
  const videoSize = await page.locator("#video").boundingBox();
  expect(videoSize.width).toBe(1);
  expect(videoSize.height).toBe(1);
  const screen = PNG.sync.read(await page.screenshot());
  expect(
    screen.data.every(
      (value, index) => value === (index % 4 === 3 ? 255 : 128),
    ),
  ).toBe(true);
});

test("permission denial replaces the page with the fictional ducks article", async ({
  page,
}) => {
  const destination = "https://en.wikipedia.org/wiki/List_of_fictional_ducks";
  await page.route(destination, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>List of fictional ducks</h1>",
    }),
  );
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.goto("/");
  await expect(page).toHaveURL(destination);
  await expect(
    page.getByRole("heading", { name: "List of fictional ducks" }),
  ).toBeVisible();
});

test("granting permission transitions directly from grey to the selfie reveal", async ({
  page,
}) => {
  await watchCamera(page);
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise((resolve) => {
        window.grantCamera = resolve;
      });
      return getUserMedia(constraints);
    };
  });
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => typeof window.grantCamera))
    .toBe("function");
  expect(await page.locator("body").innerText()).toBe("");
  await page.evaluate(() => window.grantCamera());
  await expect(page.locator("#reveal")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/pending/);
  expect(
    await page.evaluate(() =>
      window.cameraTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
});

test("printed PNG decodes to exactly the configured HTTPS destination", async () => {
  const { url } = JSON.parse(await readFile("site.config.json", "utf8"));
  const png = PNG.sync.read(await readFile("print/shirt-qr-2400.png"));
  expect(png.width).toBe(2400);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe(url);
});
