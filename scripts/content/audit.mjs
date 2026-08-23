import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCoreSpecificityRisk,
  getPromptCompletenessRisk,
  getPromptContextRisk,
  getPromptPremiseRisk,
  getPromptScienceRisk,
  getSkeletonConcentration,
  isKnownGeneratedTemplate,
} from "./source-quality.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(
  await readFile(join(root, "public/content/manifest.json"), "utf8")
);
const seenPrompts = new Map();
const seenOccurrences = new Set();
const failures = [];
const reports = [];
const allQuestions = [];

function normalizePrompt(value) {
  return value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/^(请问|请说明|请介绍|介绍一下|说一下|谈谈|简述|如何理解)/, "")
    .replace(/[\s，。！？、；：,.!?;:()（）【】\[\]"'“”‘’`]/g, "");
}

function isEnglishOnlyPrompt(value) {
  const latin = value.match(/[A-Za-z]/g)?.length ?? 0;
  return latin >= 4 && !/[\u3400-\u9fff]/.test(value);
}

for (const track of manifest.tracks) {
  const pack = JSON.parse(
    await readFile(join(root, "public", track.file.replace(/^\//, "")), "utf8")
  );
  const difficultyCounts = {};
  const questionTypeCounts = {};
  const sourceKindCounts = {};
  const sourceHostCounts = {};
  let coreQuestions = 0;
  let firsthandQuestions = 0;
  allQuestions.push(...pack);

  for (const question of pack) {
    if (isEnglishOnlyPrompt(question.prompt)) {
      failures.push(`${question.id}: untranslated-english-prompt`);
    }
    difficultyCounts[question.difficulty] =
      (difficultyCounts[question.difficulty] ?? 0) + 1;
    questionTypeCounts[question.questionType] =
      (questionTypeCounts[question.questionType] ?? 0) + 1;
    const isCore = question.collectionIds.some(id => id.endsWith("-core"));
    if (isCore) {
      coreQuestions += 1;
      const coreSpecificityRisk = getCoreSpecificityRisk(question.prompt);
      if (coreSpecificityRisk) {
        failures.push(`${question.id}: ${coreSpecificityRisk}`);
      }
    }
    if (question.occurrences.some(item => item.sourceKind === "firsthand")) {
      firsthandQuestions += 1;
    }
    if (question.id.startsWith("curriculum:")) {
      failures.push(`${question.id}: generated curriculum id remains`);
    }
    if (isKnownGeneratedTemplate(question.prompt)) {
      failures.push(`${question.id}: known generated prompt template`);
    }
    const premiseRisk = getPromptPremiseRisk(question.prompt);
    if (premiseRisk) failures.push(`${question.id}: ${premiseRisk}`);
    const contextRisk = getPromptContextRisk(question.prompt);
    if (contextRisk) failures.push(`${question.id}: ${contextRisk}`);
    const completenessRisk = getPromptCompletenessRisk(question.prompt);
    if (completenessRisk) {
      failures.push(`${question.id}: ${completenessRisk}`);
    }
    const scienceRisk = getPromptScienceRisk(question.prompt);
    if (scienceRisk) failures.push(`${question.id}: ${scienceRisk}`);
    const questionMarks = question.prompt.match(/[？?]/g)?.length ?? 0;
    if (questionMarks > 4) {
      failures.push(`${question.id}: probable multi-question bundle`);
    }

    const duplicateKey = `${question.trackId}:${normalizePrompt(question.prompt)}`;
    const duplicateId = seenPrompts.get(duplicateKey);
    if (duplicateId) failures.push(`${question.id}: duplicates ${duplicateId}`);
    else seenPrompts.set(duplicateKey, question.id);

    for (const occurrence of question.occurrences) {
      if (seenOccurrences.has(occurrence.id)) {
        failures.push(`${question.id}: duplicate occurrence ${occurrence.id}`);
      }
      seenOccurrences.add(occurrence.id);
      sourceKindCounts[occurrence.sourceKind] =
        (sourceKindCounts[occurrence.sourceKind] ?? 0) + 1;
      const host = new URL(occurrence.sourceUrl).hostname;
      sourceHostCounts[host] = (sourceHostCounts[host] ?? 0) + 1;
    }
  }

  reports.push({
    trackId: track.id,
    questions: pack.length,
    coreQuestions,
    firsthandQuestions,
    occurrences: pack.reduce(
      (sum, question) => sum + question.occurrences.length,
      0
    ),
    difficultyCounts,
    questionTypeCounts,
    sourceKindCounts,
    sourceHostCounts,
  });
}

const skeletonConcentration = getSkeletonConcentration(allQuestions);
if (failures.length) {
  throw new Error(
    `Content audit failed (${failures.length}):\n${failures
      .slice(0, 80)
      .join("\n")}`
  );
}

if (process.argv.includes("--report")) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 2,
        contentVersion: manifest.contentVersion,
        totalQuestions: manifest.totalQuestions,
        coreQuestions: manifest.coreQuestions,
        totalOccurrences: manifest.totalOccurrences,
        skeletonConcentration,
        reports,
      },
      null,
      2
    )
  );
}
console.log(
  `Content audit passed: ${manifest.totalQuestions.toLocaleString("en-US")} canonical questions, ${manifest.totalOccurrences.toLocaleString("en-US")} sourced occurrences; ${(skeletonConcentration.repeatedRatio * 100).toFixed(1)}% in repeated language skeletons.`
);
