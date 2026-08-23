import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isNormalizedSimplifiedChinese,
  normalizeSimplifiedChinese,
} from "./chinese-script.mjs";
import { topicTaxonomy } from "./topic-taxonomy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checkOnly = process.argv.includes("--check");
const trackIds = [
  "fundamentals",
  "frontend",
  "backend",
  "mobile",
  "quality",
  "platform",
  "llm-algorithm",
  "agent-evaluation",
  "agent-engineering",
];
const sourceKinds = new Set([
  "firsthand",
  "curated-repository",
  "technical-community",
  "official-documentation",
  "engineering-blog",
  "research-paper",
  "benchmark",
]);
const questionTypes = new Set([
  "concept",
  "comparison",
  "coding",
  "practical",
  "scenario",
  "system-design",
  "debugging",
  "testing",
  "operations",
  "behavioral",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePrompt(value) {
  return value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s，。！？、；：,.!?;:()（）【】\[\]"'“”‘’`]/g, "");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalTranslations() {
  try {
    const value = await readJson(join(root, "content/work/translations.json"));
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid question translations workspace");
    }
    return value.items;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readOptionalCoreReviews() {
  try {
    const value = await readJson(
      join(root, "content/work/core-quality-reviews.json")
    );
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid core quality review workspace");
    }
    return value.items.filter(item => item.reviewVersion === 2);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function validateOccurrence(occurrence) {
  if (!occurrence?.id || !occurrence.sourceId) return "invalid-occurrence-id";
  if ("company" in occurrence) return "removed-company-field";
  if ("interviewStage" in occurrence) return "removed-interview-stage-field";
  if (!sourceKinds.has(occurrence.sourceKind)) return "invalid-source-kind";
  if (!occurrence.sourceTitle?.trim()) return "missing-source-title";
  if (!occurrence.originalPrompt?.trim()) return "missing-original-prompt";
  try {
    const sourceUrl = new URL(occurrence.sourceUrl);
    if (!new Set(["http:", "https:"]).has(sourceUrl.protocol)) {
      return "invalid-source-url";
    }
  } catch {
    return "invalid-source-url";
  }
  return undefined;
}

function validateQuestion(question) {
  if (
    "audiences" in question ||
    "company" in question ||
    "interviewStage" in question
  ) {
    return "removed-classification-field";
  }
  if (!question?.id || !question.id.startsWith("real:")) {
    return "invalid-real-id";
  }
  if (!trackIds.includes(question.trackId)) return "invalid-track";
  if (!question.prompt?.trim() || question.prompt.length < 4) {
    return "invalid-prompt";
  }
  if (question.prompt.length > 1_000) return "prompt-too-long";
  if (!isNormalizedSimplifiedChinese(question.prompt)) {
    return "non-simplified-prompt";
  }
  if (!questionTypes.has(question.questionType)) {
    return "invalid-question-type";
  }
  if (
    !Number.isInteger(question.difficulty) ||
    question.difficulty < 1 ||
    question.difficulty > 5
  ) {
    return "invalid-difficulty";
  }
  if (!Array.isArray(question.tags) || question.tags.length > 12) {
    return "invalid-tags";
  }
  if (
    !Array.isArray(question.collectionIds) ||
    !question.collectionIds.length
  ) {
    return "missing-collection";
  }
  if (!Array.isArray(question.occurrences) || !question.occurrences.length) {
    return "missing-provenance";
  }
  const canonicalTopic = topicTaxonomy[question.trackId]?.find(
    topic => topic.id === question.topicId
  );
  if (!canonicalTopic || canonicalTopic.label !== question.topicLabel) {
    return "invalid-topic";
  }
  return question.occurrences.map(validateOccurrence).find(Boolean);
}

function mergeExactDuplicates(questions) {
  const accepted = new Map();
  for (const question of questions) {
    const key = `${question.trackId}:${normalizePrompt(question.prompt)}`;
    const existing = accepted.get(key);
    if (!existing) {
      accepted.set(key, structuredClone(question));
      continue;
    }
    existing.collectionIds = [
      ...new Set([...existing.collectionIds, ...question.collectionIds]),
    ];
    existing.occurrences = [
      ...new Map(
        [...existing.occurrences, ...question.occurrences].map(occurrence => [
          occurrence.id,
          occurrence,
        ])
      ).values(),
    ];
  }
  return [...accepted.values()];
}

async function verifyPublishedContent() {
  const manifest = await readJson(join(root, "public/content/manifest.json"));
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.tracks)) {
    throw new Error("Invalid v2 content manifest");
  }
  const collectionIds = new Set(manifest.collections?.map(item => item.id));
  const seenQuestionIds = new Set();
  const seenOccurrenceIds = new Set();
  const seenPrompts = new Map();
  let totalQuestions = 0;
  let coreQuestions = 0;
  let totalOccurrences = 0;

  for (const track of manifest.tracks) {
    const packPath = join(root, "public", track.file.replace(/^\//, ""));
    const serialized = await readFile(packPath, "utf8");
    const pack = JSON.parse(serialized);
    if (!Array.isArray(pack) || pack.length !== track.count) {
      throw new Error(`${track.id}: pack count mismatch`);
    }
    if (sha256(serialized) !== track.checksum) {
      throw new Error(`${track.id}: checksum mismatch`);
    }
    const corePackPath = join(
      root,
      "public",
      track.coreFile.replace(/^\//, "")
    );
    const coreSerialized = await readFile(corePackPath, "utf8");
    const corePack = JSON.parse(coreSerialized);
    if (!Array.isArray(corePack) || corePack.length !== track.coreCount) {
      throw new Error(`${track.id}: core pack count mismatch`);
    }
    if (sha256(coreSerialized) !== track.coreChecksum) {
      throw new Error(`${track.id}: core pack checksum mismatch`);
    }

    let trackCoreCount = 0;
    let trackOccurrenceCount = 0;
    for (const question of pack) {
      const rejection = validateQuestion(question);
      if (rejection) throw new Error(`${question.id}: ${rejection}`);
      if (question.trackId !== track.id) {
        throw new Error(`${question.id}: wrong pack`);
      }
      if (seenQuestionIds.has(question.id)) {
        throw new Error(`Duplicate id ${question.id}`);
      }
      seenQuestionIds.add(question.id);
      for (const collectionId of question.collectionIds) {
        if (!collectionIds.has(collectionId)) {
          throw new Error(`${question.id}: unknown collection ${collectionId}`);
        }
      }
      const promptKey = `${question.trackId}:${normalizePrompt(question.prompt)}`;
      if (seenPrompts.has(promptKey)) {
        throw new Error(
          `${question.id}: duplicate prompt ${seenPrompts.get(promptKey)}`
        );
      }
      seenPrompts.set(promptKey, question.id);
      for (const occurrence of question.occurrences) {
        if (seenOccurrenceIds.has(occurrence.id)) {
          throw new Error(`Duplicate occurrence ${occurrence.id}`);
        }
        seenOccurrenceIds.add(occurrence.id);
      }
      if (question.collectionIds.some(id => id.endsWith("-core"))) {
        trackCoreCount += 1;
      }
      trackOccurrenceCount += question.occurrences.length;
    }

    const topicCount = new Set(pack.map(question => question.topicId)).size;
    if (track.coreCount !== trackCoreCount) {
      throw new Error(`${track.id}: core count mismatch`);
    }
    if (track.occurrenceCount !== trackOccurrenceCount) {
      throw new Error(`${track.id}: occurrence count mismatch`);
    }
    if (track.topicCount !== topicCount) {
      throw new Error(`${track.id}: topic count mismatch`);
    }
    const expectedCorePack = pack.filter(question =>
      question.collectionIds.some(id => id.endsWith("-core"))
    );
    if (JSON.stringify(corePack) !== JSON.stringify(expectedCorePack)) {
      throw new Error(`${track.id}: core pack content mismatch`);
    }
    totalQuestions += pack.length;
    coreQuestions += trackCoreCount;
    totalOccurrences += trackOccurrenceCount;
  }

  if (manifest.totalQuestions !== totalQuestions) {
    throw new Error("Manifest total mismatch");
  }
  if (manifest.coreQuestions !== coreQuestions) {
    throw new Error("Manifest core total mismatch");
  }
  if (manifest.totalOccurrences !== totalOccurrences) {
    throw new Error("Manifest occurrence total mismatch");
  }
  if (
    manifest.coreQuality &&
    (manifest.coreQuality.reviewVersion !== 2 ||
      manifest.coreQuality.reviewedQuestions !== coreQuestions ||
      manifest.coreQuality.minimumScore < 75 ||
      manifest.coreQuality.averageScore < manifest.coreQuality.minimumScore ||
      manifest.coreQuality.averageScore > 100)
  ) {
    throw new Error("Invalid core quality attestation");
  }
  for (const collection of manifest.collections) {
    const actual = manifest.tracks.reduce(
      (sum, track) =>
        sum + (track.questionsInCollections?.[collection.id] ?? 0),
      0
    );
    if (actual !== collection.questionCount) {
      throw new Error(`${collection.id}: collection count mismatch`);
    }
  }
  console.log(
    `Content check passed: ${totalQuestions.toLocaleString("en-US")} canonical questions, ${coreQuestions.toLocaleString("en-US")} core questions, ${totalOccurrences.toLocaleString("en-US")} sourced occurrences.`
  );
}

async function buildContent() {
  const curatedPath = join(root, "content/work/curated.json");
  let curated;
  try {
    curated = await readJson(curatedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "缺少 content/work/curated.json，请先运行 pnpm content import。"
      );
    }
    throw error;
  }
  if (curated.schemaVersion !== 1 || !Array.isArray(curated.questions)) {
    throw new Error("Invalid curated content workspace");
  }

  const [translations, coreReviewItems] = await Promise.all([
    readOptionalTranslations(),
    readOptionalCoreReviews(),
  ]);
  const translationById = new Map(translations.map(item => [item.id, item]));
  const sourceQuestions = mergeExactDuplicates(curated.questions);
  let coreQuality;
  if (coreReviewItems.length) {
    const reviewById = new Map(coreReviewItems.map(item => [item.id, item]));
    const coreScores = sourceQuestions
      .filter(question =>
        question.collectionIds.some(id => id.endsWith("-core"))
      )
      .map(question => {
        const review = reviewById.get(question.id);
        if (
          review?.sourcePrompt !== question.prompt ||
          review.reason !== "keep" ||
          review.decision !== "core" ||
          !Number.isInteger(review.score) ||
          review.score < 75
        ) {
          throw new Error(`${question.id}: missing strict core review`);
        }
        return review.score;
      });
    coreQuality = {
      reviewVersion: 2,
      reviewedQuestions: coreScores.length,
      minimumScore: Math.min(...coreScores),
      averageScore: Number(
        (
          coreScores.reduce((sum, score) => sum + score, 0) / coreScores.length
        ).toFixed(1)
      ),
    };
  }
  const translatedQuestions = sourceQuestions.map(question => {
    const translation = translationById.get(question.id);
    if (!translation) return question;
    if (translation.sourcePrompt !== question.prompt) {
      throw new Error(`${question.id}: stale translation source`);
    }
    if (
      typeof translation.translatedPrompt !== "string" ||
      !/[\u3400-\u9fff]/.test(translation.translatedPrompt)
    ) {
      throw new Error(`${question.id}: invalid Chinese translation`);
    }
    return { ...question, prompt: translation.translatedPrompt.trim() };
  });
  const questions = mergeExactDuplicates(
    translatedQuestions.map(question => ({
      ...question,
      prompt: normalizeSimplifiedChinese(question.prompt),
    }))
  );
  const collectionDefinitions = new Map(
    curated.collections.map(collection => [collection.id, collection])
  );
  const packArtifacts = [];

  for (const trackId of trackIds) {
    const pack = questions
      .filter(question => question.trackId === trackId)
      .sort((left, right) => {
        const leftCore = left.collectionIds.some(id => id.endsWith("-core"));
        const rightCore = right.collectionIds.some(id => id.endsWith("-core"));
        if (leftCore !== rightCore) {
          return Number(rightCore) - Number(leftCore);
        }
        return String(right.collectedAt ?? "").localeCompare(
          String(left.collectedAt ?? "")
        );
      });
    for (const question of pack) {
      const rejection = validateQuestion(question);
      if (rejection) throw new Error(`${question.id}: ${rejection}`);
      for (const collectionId of question.collectionIds) {
        if (!collectionDefinitions.has(collectionId)) {
          throw new Error(`${question.id}: unknown collection ${collectionId}`);
        }
      }
    }
    const serialized = JSON.stringify(pack);
    const coreSerialized = JSON.stringify(
      pack.filter(question =>
        question.collectionIds.some(id => id.endsWith("-core"))
      )
    );
    const questionsInCollections = {};
    for (const question of pack) {
      for (const collectionId of question.collectionIds) {
        questionsInCollections[collectionId] =
          (questionsInCollections[collectionId] ?? 0) + 1;
      }
    }
    packArtifacts.push({
      id: trackId,
      count: pack.length,
      coreCount: pack.filter(question =>
        question.collectionIds.some(id => id.endsWith("-core"))
      ).length,
      occurrenceCount: pack.reduce(
        (sum, question) => sum + question.occurrences.length,
        0
      ),
      topicCount: new Set(pack.map(question => question.topicId)).size,
      questionsInCollections,
      serialized,
      coreSerialized,
      checksum: sha256(serialized),
      coreChecksum: sha256(coreSerialized),
    });
  }

  const contentHash = sha256(
    packArtifacts.map(artifact => artifact.serialized).join("\n")
  );
  const contentVersion = `v2-${contentHash.slice(0, 12)}`;
  const outputDirectory = join(root, "public/content/packs", contentVersion);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    packArtifacts.flatMap(artifact => [
      writeFile(
        join(outputDirectory, `${artifact.id}.json`),
        artifact.serialized
      ),
      writeFile(
        join(outputDirectory, `${artifact.id}.core.json`),
        artifact.coreSerialized
      ),
    ])
  );

  const tracks = packArtifacts.map(
    ({
      serialized: _serialized,
      coreSerialized: _coreSerialized,
      ...artifact
    }) => ({
      ...artifact,
      file: `/content/packs/${contentVersion}/${artifact.id}.json`,
      coreFile: `/content/packs/${contentVersion}/${artifact.id}.core.json`,
    })
  );
  const collectionCounts = new Map();
  for (const track of tracks) {
    for (const [collectionId, count] of Object.entries(
      track.questionsInCollections
    )) {
      collectionCounts.set(
        collectionId,
        (collectionCounts.get(collectionId) ?? 0) + count
      );
    }
  }
  const collections = curated.collections
    .map(collection => ({
      ...collection,
      questionCount: collectionCounts.get(collection.id) ?? 0,
    }))
    .filter(collection => collection.questionCount > 0);
  const manifest = {
    schemaVersion: 2,
    contentVersion,
    generatedAt: new Date().toISOString(),
    totalQuestions: tracks.reduce((sum, track) => sum + track.count, 0),
    coreQuestions: tracks.reduce((sum, track) => sum + track.coreCount, 0),
    totalOccurrences: tracks.reduce(
      (sum, track) => sum + track.occurrenceCount,
      0
    ),
    ...(coreQuality ? { coreQuality } : {}),
    collections,
    tracks,
  };

  await mkdir(join(root, "public/content"), { recursive: true });
  await mkdir(join(root, "content/reports"), { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "public/content/manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    ),
    writeFile(
      join(root, "content/reports/latest.json"),
      `${JSON.stringify(
        {
          schemaVersion: 2,
          contentVersion,
          importedAt: curated.importedAt,
          rawOccurrences: curated.stats?.rawOccurrences,
          translations: translations.length,
          canonicalQuestions: manifest.totalQuestions,
          coreQuestions: manifest.coreQuestions,
          coreQuality,
          totalOccurrences: manifest.totalOccurrences,
          tracks: tracks.map(
            ({
              checksum: _checksum,
              coreChecksum: _coreChecksum,
              file: _file,
              coreFile: _coreFile,
              ...track
            }) => track
          ),
        },
        null,
        2
      )}\n`
    ),
  ]);
  console.log(
    `Published ${manifest.totalQuestions.toLocaleString("en-US")} canonical questions from ${manifest.totalOccurrences.toLocaleString("en-US")} sourced occurrences.`
  );
}

if (checkOnly) await verifyPublishedContent();
else {
  await buildContent();
  await verifyPublishedContent();
}
