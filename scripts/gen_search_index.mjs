import fs from "fs";
import path from "path";

const ROOT = process.cwd(); // запускать из client-gethome
const PROJECTS_DIR = path.join(ROOT, "data", "projects");
const OUT_FILE = path.join(ROOT, "data", "search", "search_index.json");

/** ---------------- helpers ---------------- */

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    console.warn(`⚠️ JSON parse error: ${path.basename(filePath)} — skipped`);
    return null;
  }
}

function toStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toLowerStr(v) {
  return toStr(v).toLowerCase();
}

function normalizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => toLowerStr(x)).filter(Boolean);
}

function parseIntSafe(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number.parseInt(s.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function warnMissing(filePath, missing) {
  if (!missing.length) return;
  console.warn(`⚠️ Missing in ${path.basename(filePath)}: ${missing.join(", ")}`);
}

/** ---------------- token builder ---------------- */

function buildTokens(p, indexItem) {
  const t = new Set();

  // базовые токены
  if (p?.project_key) t.add(toLowerStr(p.project_key));
  if (p?.slug) t.add(toLowerStr(p.slug));

  // developer/emirate/area
  if (indexItem.developer) t.add(toLowerStr(indexItem.developer));
  if (indexItem.emirate) t.add(toLowerStr(indexItem.emirate));
  if (indexItem.area) t.add(toLowerStr(indexItem.area));

  // property types
  for (const pt of indexItem.property_types || []) t.add(pt);

  // спальни
  if (Number.isFinite(indexItem.bedrooms_min) && Number.isFinite(indexItem.bedrooms_max)) {
    for (let b = indexItem.bedrooms_min; b <= indexItem.bedrooms_max; b++) t.add(`${b}br`);
  }

  // глобальное
  t.add("uae");

  return Array.from(t).filter(Boolean);
}

/** ---------------- index item builder (ultra-soft) ---------------- */

function toIndexItem(p, filePath) {
  const missing = [];

  // _search может отсутствовать вообще — норм
  const s = (p && typeof p._search === "object" && p._search) ? p._search : {};

  // если project_key не задан — используем slug, а если и его нет — имя файла
  const fallbackSlugFromFile = path.basename(filePath, ".json");
  const slug = toStr(p?.slug) || fallbackSlugFromFile;
  if (!toStr(p?.slug)) missing.push("slug (fallback used)");

  const key = toStr(p?.project_key) || slug;
  if (!toStr(p?.project_key)) missing.push("project_key (fallback used)");

  const emirate = toLowerStr(s.emirate);
  if (!emirate) missing.push("_search.emirate");

  const city = toLowerStr(s.city);
  if (!city) missing.push("_search.city");

  const area = toLowerStr(s.area);
  if (!area) missing.push("_search.area");

  const developer = toLowerStr(s.developer);
  if (!developer) missing.push("_search.developer");

  const property_types = normalizeArray(s.property_types);
  if (!property_types.length) missing.push("_search.property_types");

  const bedrooms_min = parseIntSafe(s.bedrooms_min);
  if (bedrooms_min === null) missing.push("_search.bedrooms_min");

  const bedrooms_max = parseIntSafe(s.bedrooms_max);
  if (bedrooms_max === null) missing.push("_search.bedrooms_max");

  const handover_year = parseIntSafe(s.handover_year);
  if (handover_year === null) missing.push("_search.handover_year");

  const price_from_aed = parseIntSafe(s.price_from_aed);
  if (price_from_aed === null) missing.push("_search.price_from_aed");

  const size_from_sqft = parseIntSafe(s.size_from_sqft);
  // size может реально быть неизвестен — не спамим предупреждениями
  // if (size_from_sqft === null) missing.push("_search.size_from_sqft");

  warnMissing(filePath, missing);

  const item = {
    key,
    slug,

    emirate: emirate || "",
    city: city || "",
    area: area || "",

    developer: developer || "",
    property_types: property_types || [],

    bedrooms_min,
    bedrooms_max,

    handover_year,
    price_from_aed,
    size_from_sqft,

    tokens: []
  };

  item.tokens = buildTokens(p, item);
  return item;
}

/** ---------------- main ---------------- */

function main() {
  const files = listJsonFiles(PROJECTS_DIR);

  const projects = [];
  for (const f of files) {
    const p = readJson(f);
    if (!p) continue;
    projects.push(toIndexItem(p, f));
  }

  const out = {
    version: 1,
    generated_at: new Date().toISOString(),
    projects
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Generated ${projects.length} projects -> ${OUT_FILE}`);
}

main();
