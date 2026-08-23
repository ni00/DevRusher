import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const [command, ...args] = process.argv.slice(2);

const scripts = {
  import: "import-real-sources.mjs",
  curate: "curate-final-dataset.mjs",
  translate: "translate-questions.mjs",
  extract: "extract-official-questions.mjs",
  build: "build.mjs",
};

const reviewScripts = {
  sources: "review-source-questions.mjs",
  derived: "review-derived-questions.mjs",
  core: "review-core-candidates.mjs",
};

function printHelp() {
  console.log(`Usage: pnpm content <command>

Commands:
  import                         Import and deduplicate confirmed sources
  curate [--clear]               Select the final question set
  translate                      Translate English questions into Chinese
  extract [--check]              Extract candidates from official sources
  review <sources|derived|core>  Review source, derived, or core questions
  build                          Generate the published content packs
  check                          Validate packs and run the content audit
  audit                          Print the detailed content audit report`);
}

function run(script, scriptArgs = []) {
  const result = spawnSync(
    process.execPath,
    [join(directory, script), ...scriptArgs],
    {
      env: process.env,
      stdio: "inherit",
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (
  !command ||
  command === "help" ||
  command === "--help" ||
  command === "-h"
) {
  printHelp();
  process.exit(0);
}

if (command === "check") {
  run("build.mjs", ["--check"]);
  run("audit.mjs");
  process.exit(0);
}

if (command === "audit") {
  run("audit.mjs", ["--report", ...args]);
  process.exit(0);
}

if (command === "review") {
  const [target, ...reviewArgs] = args;
  const script = reviewScripts[target];
  if (!script) {
    console.error("Review target must be one of: sources, derived, core.");
    process.exit(1);
  }
  run(script, reviewArgs);
  process.exit(0);
}

const script = scripts[command];
if (!script) {
  console.error(`Unknown content command: ${command}`);
  printHelp();
  process.exit(1);
}

run(script, args);
