# THIS YOU? 📸

A tiny, mobile-first QR shirt prank. Scan → allow front camera → automatic selfie → **THIS YOU?** No visitor account or app installation. Every capture automatically uploads a compact JPEG to a password-protected private archive; photos are never committed to GitHub.

## Run locally

Use Node.js 20 or newer:

```sh
npm ci
npm run dev
```

Open http://localhost:4173. Camera APIs work on localhost, but a phone visiting a computer's HTTP LAN address requires HTTPS instead. Test phones against the deployed HTTPS site.

## How it works

The opening screen is solid grey (#808080), without site text, branding, buttons, or a camera preview while permission is pending. Only the browser’s permission dialog appears. After the initial paint, it immediately asks the browser for camera permission using `getUserMedia({ audio: false, video: { facingMode: 'user', ... } })`. Granting access captures the first usable frame and shows the selfie reveal. A `NotAllowedError` redirects with `location.replace` to https://en.wikipedia.org/wiki/List_of_fictional_ducks; browsers may report denial, dismissal, or a policy block under this same error. Browsers control the permission prompt; a previously granted permission may skip it.

A visually hidden, muted inline video waits for the first usable frame, with no countdown or artificial capture delay. Branding and the meme design appear only after capture. Canvas crops and mirrors one portrait frame. It also encodes a JPEG for automatic archive upload, while keeping a PNG for the visitor’s optional download. All camera tracks stop immediately after the frame is drawn, before PNG encoding. A temporary blob URL displays the photo; retake/clear-preview replaces or revokes it. No photo is written to localStorage, sessionStorage, or cookies. The backend retains archived JPEGs until the owner deletes them. Download is an explicit action that saves a PNG to the visitor's device. “4K” is a joke, not a resolution guarantee; output depends on the camera and is capped at 1440 pixels wide.

Autoplay rejection offers a manual capture button. Unsupported browsers, camera contention, missing hardware, and frame timeouts show recovery messages. Permission denial redirects instead. Hiding/leaving the page cancels pending capture and stops the camera, including permission granted after cancellation. Returning never silently restarts it. Closing/leaving clears the browser preview; downloaded files and successfully archived photos remain. Clear this preview does not delete the server copy. Permission prompts themselves cannot be programmatically dismissed.

Page assets are served locally, and CSP allows photo uploads only to the configured archive origin. Camera denial still navigates to Wikipedia without a photo or referrer. No microphone, analytics, device fingerprinting, or application IP collection. Hosting providers may retain their own request logs. The shirt **must clearly disclose automatic selfie capture, upload, private retention, and who operates the archive** before people scan. The grey permission screen deliberately displays no site notice; update the shirt before using this feature publicly.

## Automatic private archive

Backend: **https://this-you-private-archive-cole367.coachcole.chatgpt.site/archive**. It uses a dependency-free Cloudflare Worker hosted through Sites and a private R2 bucket. Uploads are anonymous writes from the QR site; reading, listing, and deleting photos require the owner password. The archive is not a public gallery.

The owner login is saved locally in `.archive-owner.txt` (ignored by Git). Username: `owner`. Do not commit, screenshot, or share that file. The production password is a Sites secret named `ARCHIVE_PASSWORD`, not browser code. Losing the file requires rotating that secret and redeploying the backend. HTTP Basic authentication is sent over HTTPS; close the browser window to clear its cached login.

The reveal does not wait for the network. Each capture, including retakes, starts an upload in the background. It retries transient failures up to three times using the same random capture ID to avoid duplicate photos. A visible save status and retry button report failure. Closing the page, losing connectivity, permission refusal, or a full archive can prevent saving; the application cannot guarantee every capture is delivered. There is no offline queue or automatic upload after the tab closes. Tests intercept synthetic photo uploads, so test photos never reach production except an explicitly identified end-to-end smoke-test fixture.

JPEG uploads are limited to 4 MiB. The archive stops accepting new IDs once its listing reaches 1,000 photos; concurrent requests may slightly overshoot this capacity guard. Owner deletion frees capacity. The upload route is public by design: CORS restricts browser origins but does not authenticate a visitor or prove that an image came from a camera. The app stores no uploader identity/IP and performs no face recognition. Do not expose the underlying R2 bucket or remove gallery authentication.

Main backend files: `backend/worker.js` (upload and private gallery), `backend/worker.test.mjs` (authorization, validation, idempotency, capacity and deletion checks), `backend/hosting.json` (Sites identity/storage), and `backend/build.mjs` (dependency-free publishing build). The ignored `.archive-host/` checkout is the Sites source repository; its contents are mirrored from these files for deployment. It contains no owner credentials or photos. `app.js`, the HTML CSP, and `_headers` contain only the public upload origin. If that origin changes, update all three together and increment the asset query versions in HTML. The QR destination stays the existing GitHub Pages URL.

For archive changes, sync `backend/worker.js` → `.archive-host/worker/index.js`, `backend/build.mjs` → `.archive-host/scripts/build.mjs`, and `backend/hosting.json` → `.archive-host/.openai/hosting.json`. Use the Sites source helper from that checkout to build with `["node","scripts/build.mjs"]` and validate with `["node","scripts/validate-artifact.mjs"]`, then publish the saved source version. Sites provisions the `BUCKET` R2 binding. No new npm dependency is required. Keep the platform upload service reachable anonymously while preserving password authorization on every archive/image route.


## Deploy on GitHub Pages (free)

1. Push this project to `CoachCole367/QRCodePic`, default branch `main`.
2. In the repository, open **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
3. Run **Actions → Check and deploy Pages → Run workflow**, or push to `main`. It checks syntax, builds the QR and static files, runs Chromium camera tests, and deploys `dist/` only after checks pass. Pull requests only run checks.
4. Verify the Actions deployment succeeds and open **https://coachcole367.github.io/QRCodePic/** on your phone. If the repository/account name changes, update `site.config.json` and regenerate the QR.

GitHub Pages needs to be enabled by a repository administrator. Source code and QR files alone do not prove the URL is deployed. Relative asset paths support the `/QRCodePic/` project path. GitHub Pages uses the HTML CSP; Cloudflare additionally applies `_headers`.

## Deploy on Cloudflare Pages (free)

Create a Pages project connected to this GitHub repository. Select no framework preset, production branch `main`, build command `npm run build`, output directory `dist`, and Node.js 22 (`NODE_VERSION=22` if needed). Build dependencies must be installed, including devDependencies, because QR generation uses `qrcode`. Alternatively run `npm ci && npm run build` locally and upload `dist/` through Pages Direct Upload. No Worker, database, secrets, or environment bindings are needed.

Once Cloudflare gives you an HTTPS `*.pages.dev` URL (or you attach your domain), set it in `site.config.json`, run `npm run qr`, commit updated config and print files, and redeploy. Disable optional Cloudflare Web Analytics and avoid adding third-party tracking. For a long-lived T-shirt, using a domain you control lets you change hosts without reprinting the QR.

## Configure and print the QR

`site.config.json` is the single source of truth for the QR destination. Default: `https://coachcole367.github.io/QRCodePic/`.

```sh
npm run qr
```

Outputs:

- `print/shirt-qr.svg` — resolution-independent vector, preferred for printers.
- `print/shirt-qr-2400.png` — 2400 × 2400 pixels.
- `print/destination.txt` — exact encoded destination.

Build also regenerates these files and copies them to `dist/print/`. Generation happens locally; it never calls a QR web service. Codes use high error correction and a four-module white quiet zone. Print solid black on an opaque white rectangle, preserving the full white border. Avoid stretching, folds, texture, logos, or reversing colors. Start around 12–15 cm wide on a shirt and test actual viewing distances. **Open the deployed URL and scan a full-size physical proof on both an iPhone and Android before printing clothing.** A decoded URL is not evidence of a working deployment.

## Checks

```sh
npx playwright install chromium
npm run lint
npm run build
npm test
```

Backend tests exercise private access, input limits, CORS, retries and deletion. Browser tests use a synthetic camera in Chromium, exercise automatic/manual capture, track shutdown, cancellation, errors, download, retake/delete, responsive widths, configured upload-only requests, automatic saving and retries, and decode the generated PNG. The project has no bundler or compilation step; `build` copies the explicitly listed assets to `dist/`. `lint` is a JavaScript syntax check.

Real-device signoff remains necessary: iOS Safari and Android Chrome permission UI, front lens selection, rotation, repeat permission/retake, switching tabs during a prompt, denied permission recovery, in-app browser fallback, and image save behavior. Automated Chromium tests do not certify physical camera hardware or mobile OS permission policy.

## Main files

- `index.html`, `styles.css`, `app.js`: experience and privacy-preserving camera lifecycle.
- `site.config.json`, `scripts/qr.mjs`, `print/`: configurable print assets.
- `scripts/build.mjs`, `_headers`, `.github/workflows/pages.yml`: static deployment.
- `tests/experience.spec.js`: automated browser and QR checks.
