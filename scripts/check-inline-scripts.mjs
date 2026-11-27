import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const html = readFileSync("public/index.html", "utf8");
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
if (!scriptTags.length) {
  console.error("No script elements found in public/index.html");
  process.exit(1);
}

const tempDir = mkdtempSync(join(tmpdir(), "choco-frontend-js-"));
let failures = 0;
let checked = 0;

function checkSource(label, source) {
  const file = join(tempDir, `script-${checked + 1}.mjs`);
  writeFileSync(file, source, "utf8");
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  checked += 1;
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAIL ${label}:\n${result.stderr || result.stdout}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

try {
  for (const [index, match] of scriptTags.entries()) {
    const attributes = match[1] || "";
    const inlineSource = match[2] || "";
    const srcMatch = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i);

    if (srcMatch) {
      const src = srcMatch[1];
      if (/^https?:\/\//i.test(src) || src.startsWith("//")) {
        console.log(`SKIP external script syntax check: ${src}`);
        continue;
      }
      const relativePath = decodeURIComponent(src.split("?")[0]).replace(/^\/+/, "");
      const publicRoot = resolve("public");
      const sourcePath = resolve(publicRoot, relativePath);
      if (sourcePath !== publicRoot && !sourcePath.startsWith(publicRoot + sep)) {
        failures += 1;
        console.error(`FAIL script path escapes public directory: ${src}`);
        continue;
      }
      let source;
      try {
        source = readFileSync(sourcePath, "utf8");
      } catch {
        failures += 1;
        console.error(`FAIL missing local script: ${src}`);
        continue;
      }
      checkSource(`local script ${src}`, source);
    } else if (inlineSource.trim()) {
      checkSource(`inline script ${index + 1}`, inlineSource);
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (checked === 0) {
  console.error("No local or inline JavaScript was checked.");
  process.exitCode = 1;
} else if (failures) {
  process.exitCode = 1;
} else {
  console.log(`Frontend JavaScript syntax checks passed: ${checked} source(s).`);
}
