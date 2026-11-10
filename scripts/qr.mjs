import QRCode from "qrcode";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function generateQR() {
  const { url } = JSON.parse(
    await readFile(new URL("../site.config.json", import.meta.url), "utf8"),
  );
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(
      "Configure an HTTPS website URL without credentials or a fragment.",
    );
  }
  const directory = new URL("../print/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const options = {
    errorCorrectionLevel: "H",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  };
  const svg = await QRCode.toString(url, { ...options, type: "svg" });
  await writeFile(new URL("shirt-qr.svg", directory), svg);
  await QRCode.toFile(
    fileURLToPath(new URL("shirt-qr-2400.png", directory)),
    url,
    { ...options, width: 2400 },
  );
  await writeFile(new URL("destination.txt", directory), `${url}\n`);
  console.log(`Print QR generated for ${url}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await generateQR();
