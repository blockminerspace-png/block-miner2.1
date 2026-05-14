import fs from "fs";

function readSecretFile(path) {
  const filePath = String(path || "").trim();
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

export function getSecretValue(name) {
  const direct = String(process.env[name] || "").trim();
  if (direct) return direct;
  return readSecretFile(process.env[`${name}_FILE`]);
}

