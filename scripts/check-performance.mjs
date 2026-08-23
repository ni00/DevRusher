import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextDirectory = join(root, ".next");
const serverAppDirectory = join(nextDirectory, "server/app");
const failures = [];

const routeBudgets = [
  { route: "/", html: "index.html", gzipBudget: 320 * 1024 },
  {
    route: "/questions",
    html: "questions.html",
    gzipBudget: 320 * 1024,
  },
  {
    route: "/interview",
    html: "interview.html",
    gzipBudget: 320 * 1024,
  },
  {
    route: "/settings",
    html: "settings.html",
    gzipBudget: 320 * 1024,
  },
];

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function routeAssets(html) {
  return [
    ...new Set(
      Array.from(
        html.matchAll(/(?:src|href)="\/_next\/([^"?]+\.(?:js|css))"/g),
        match => join(nextDirectory, ...match[1].split("/"))
      )
    ),
  ];
}

if (!existsSync(serverAppDirectory)) {
  throw new Error("缺少生产构建，请先运行 pnpm build。");
}

for (const budget of routeBudgets) {
  const htmlPath = join(serverAppDirectory, budget.html);
  if (!existsSync(htmlPath)) {
    failures.push(`${budget.route}: 缺少 ${budget.html}`);
    continue;
  }

  const html = readFileSync(htmlPath, "utf8");
  const assets = routeAssets(html);
  const missingAssets = assets.filter(path => !existsSync(path));
  if (missingAssets.length) {
    failures.push(`${budget.route}: 引用了不存在的静态资源`);
    continue;
  }

  const gzipBytes =
    gzipSize(htmlPath) +
    assets.reduce((total, assetPath) => total + gzipSize(assetPath), 0);
  console.log(
    `${budget.route.padEnd(12)} 首屏 HTML/JS/CSS ${formatKiB(gzipBytes)} / ${formatKiB(budget.gzipBudget)}`
  );
  if (gzipBytes > budget.gzipBudget) {
    failures.push(
      `${budget.route}: 首屏 ${formatKiB(gzipBytes)} 超过 ${formatKiB(budget.gzipBudget)}`
    );
  }

  if (
    budget.route === "/questions" &&
    assets.some(assetPath =>
      readFileSync(assetPath, "utf8").includes("全能教练")
    )
  ) {
    failures.push("/questions: 题目解析对话框进入了首屏资源");
  }
  if (html.includes("pdf.worker")) {
    failures.push(`${budget.route}: PDF worker 进入了首屏资源`);
  }
}

const manifest = JSON.parse(
  readFileSync(join(root, "public/content/manifest.json"), "utf8")
);
const corePackPaths = manifest.tracks.map(track =>
  join(root, "public", ...track.coreFile.replace(/^\//, "").split("/"))
);
const fullPackPaths = manifest.tracks.map(track =>
  join(root, "public", ...track.file.replace(/^\//, "").split("/"))
);
const missingPacks = [...corePackPaths, ...fullPackPaths].filter(
  path => !existsSync(path)
);
if (missingPacks.length) {
  failures.push(`缺少 ${missingPacks.length} 个题包`);
} else {
  const coreGzipBytes = corePackPaths.reduce(
    (total, path) => total + gzipSize(path),
    0
  );
  const fullGzipBytes = fullPackPaths.reduce(
    (total, path) => total + gzipSize(path),
    0
  );
  const coreBudget = 256 * 1024;
  const fullBudget = 2 * 1024 * 1024;
  console.log(
    `精选题包     ${formatKiB(coreGzipBytes)} / ${formatKiB(coreBudget)}`
  );
  console.log(
    `完整题包     ${formatKiB(fullGzipBytes)} / ${formatKiB(fullBudget)}`
  );
  if (coreGzipBytes > coreBudget) {
    failures.push(
      `精选题包 ${formatKiB(coreGzipBytes)} 超过 ${formatKiB(coreBudget)}`
    );
  }
  if (fullGzipBytes > fullBudget) {
    failures.push(
      `完整题包 ${formatKiB(fullGzipBytes)} 超过 ${formatKiB(fullBudget)}`
    );
  }
}

const mediaDirectory = join(nextDirectory, "static/media");
const fontPaths = existsSync(mediaDirectory)
  ? readdirSync(mediaDirectory)
      .filter(name => /\.(?:woff2?|ttf|otf)$/.test(name))
      .map(name => join(mediaDirectory, name))
  : [];
const fontBytes = fontPaths.reduce(
  (total, path) => total + statSync(path).size,
  0
);
const fontBudget = 128 * 1024;
console.log(
  `字体产物     ${fontPaths.length} 个 / ${formatKiB(fontBytes)} / ${formatKiB(fontBudget)}`
);
if (fontPaths.length > 8 || fontBytes > fontBudget) {
  failures.push(
    `字体产物 ${fontPaths.length} 个、${formatKiB(fontBytes)} 超过预算`
  );
}

if (failures.length) {
  throw new Error(`性能预算失败：\n- ${failures.join("\n- ")}`);
}

console.log("Performance budgets passed.");
