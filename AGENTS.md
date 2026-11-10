# QRCodePic

- Stack: static HTML/CSS/JavaScript; Node 20+ tooling. No runtime dependencies.
- Install: `npm ci`; browser tests: `npx playwright install chromium`.
- Dev: `npm run dev` (localhost:4173). Build: `npm run build` (dist/).
- Validate: `npm run lint`, `npm test`, `npm run build`.
- QR: edit site.config.json, then `npm run qr`; commit print/ outputs.
- Conventions: relative asset URLs for GitHub project Pages. Photos automatically upload only to the configured private archive; no analytics, fingerprinting, or photo commits to Git. The shirt must disclose automatic upload and retention. Always release camera tracks and object URLs. Respect reduced motion and keyboard access.
- Backend: dependency-free Worker in backend/worker.js, private R2 storage, owner password in hosting secrets only. Run `node --test backend/worker.test.mjs` for backend tests. Never commit archive credentials or photos.
- Done: relevant checks pass, camera success and failure paths tested, docs/config/QR agree, real-phone verification limits reported.
