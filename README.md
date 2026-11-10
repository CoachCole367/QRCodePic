# THIS YOU? 📸

A tiny, mobile-first QR shirt prank. Scan → allow front camera → automatic selfie → **THIS YOU?** No account, installation, backend, runtime dependencies, analytics, or photo uploads.

## Run locally

Use Node.js 20 or newer:

```sh
npm ci
npm run dev
```

Open http://localhost:4173. Camera APIs work on localhost, but a phone visiting a computer's HTTP LAN address requires HTTPS instead. Test phones against the deployed HTTPS site.

## How it works

The opening screen is nearly blank, with only a small camera/privacy notice and cancel control at the bottom. After the initial paint, it immediately asks the browser for camera permission using `getUserMedia({ audio: false, video: { facingMode: 'user', ... } })`. Visitors may cancel or press Allow camera themselves. Browsers control the permission prompt; a previously granted permission may skip it.

A visually hidden, muted inline video waits for the first usable frame, with no countdown or artificial capture delay. Branding and the meme design appear only after capture. Canvas crops and mirrors one portrait frame. All camera tracks stop immediately after the frame is drawn, before PNG encoding. A temporary blob URL displays the photo; retake/delete replaces or revokes it. No photo is written to browser storage. Download is an explicit action that saves a PNG to the visitor's device. “4K” is a joke, not a resolution guarantee; output depends on the camera and is capped at 1440 pixels wide.

Autoplay rejection offers a manual capture button. Permission denial, unsupported browsers, camera contention, missing hardware, and frame timeouts have recovery messages. Hiding/leaving the page cancels pending capture and stops the camera, including permission granted after cancellation. Returning never silently restarts it. Closing/leaving clears the photo; saved downloads remain on the device. Permission prompts themselves cannot be programmatically dismissed.

All page assets are served locally. CSP blocks application network connections. No microphone, cookies, analytics, device fingerprinting, application IP collection, or server photo handling. GitHub/Cloudflare may maintain their own standard request logs; the application cannot control hosting infrastructure logs. The page does not prevent screenshots.

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

Tests use a synthetic camera in Chromium, exercise automatic/manual capture, track shutdown, cancellation, errors, download, retake/delete, responsive widths, local-only requests, and decode the generated PNG. The project has no bundler or compilation step; `build` copies the explicitly listed assets to `dist/`. `lint` is a JavaScript syntax check.

Real-device signoff remains necessary: iOS Safari and Android Chrome permission UI, front lens selection, rotation, repeat permission/retake, switching tabs during a prompt, denied permission recovery, in-app browser fallback, and image save behavior. Automated Chromium tests do not certify physical camera hardware or mobile OS permission policy.

## Main files

- `index.html`, `styles.css`, `app.js`: experience and privacy-preserving camera lifecycle.
- `site.config.json`, `scripts/qr.mjs`, `print/`: configurable print assets.
- `scripts/build.mjs`, `_headers`, `.github/workflows/pages.yml`: static deployment.
- `tests/experience.spec.js`: automated browser and QR checks.
