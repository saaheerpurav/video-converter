import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const build = packageJson.build;
const failures = [];

if (!build?.mac) {
  failures.push("Missing build.mac config.");
}

if (build?.mac?.target !== "dmg") {
  failures.push("build.mac.target must be dmg.");
}

if (build?.mac?.category !== "public.app-category.video") {
  failures.push("build.mac.category must be public.app-category.video.");
}

if (build?.mac?.icon !== "build/icon.icns") {
  failures.push("build.mac.icon must be build/icon.icns.");
}

const iconPath = path.join(root, "build", "icon.icns");

if (!fs.existsSync(iconPath)) {
  failures.push("Missing build/icon.icns.");
} else {
  const header = fs.readFileSync(iconPath).subarray(0, 4).toString("ascii");

  if (header !== "icns") {
    failures.push("build/icon.icns is not a valid ICNS container.");
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("macOS packaging config is valid.");
