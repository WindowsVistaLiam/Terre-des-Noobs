import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const folder of ["src", "scripts", "test"]) {
  for (const file of await readdir(folder)) {
    if (!file.endsWith(".js")) continue;
    const result = spawnSync(
      process.execPath,
      ["--check", `${folder}/${file}`],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(1);
  }
}
console.log("Syntaxe JavaScript vérifiée.");
