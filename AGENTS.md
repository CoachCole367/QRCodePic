# QRCodePic

- Stack: static HTML/CSS/JavaScript; Node 20+ tooling. No runtime dependencies.
- Install: `npm ci`; browser tests: `npx playwright install chromium`.
- Dev: `npm run dev` (localhost:4173). Build: `npm run build` (dist/).
- Validate: `npm run lint`, `npm test`, `npm run build`.
- QR: edit site.config.json, then `npm run qr`; commit print/ outputs.
- Conventions: relative asset URLs for GitHub project Pages; no third-party requests, storage, analytics, or photo uploads. Always release camera tracks and object URLs. Respect reduced motion and keyboard access.
- Done: relevant checks pass, camera success and failure paths tested, docs/config/QR agree, real-phone verification limits reported.
