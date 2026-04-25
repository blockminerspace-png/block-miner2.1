/**
 * One-off merge: replaces `landing` in en / pt-BR / es locale files.
 * Run from repo root: node client/scripts/merge-landing-locales.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { landingEn } from "./landing-en.mjs";
import { landingPt } from "./landing-pt.mjs";
import { landingEs } from "./landing-es.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/i18n/locales");

function patch(file, landing) {
  const p = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  data.landing = landing;
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("updated", file);
}

patch("en.json", landingEn);
patch("pt-BR.json", landingPt);
patch("es.json", landingEs);
