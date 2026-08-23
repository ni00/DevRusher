import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const curatedPath = join(root, "content/work/curated.json");
const translationsPath = join(root, "content/work/translations.json");
const checkpointPath = join(root, "content/work/core-quality-reviews.json");
const apiKey = process.env.DEVRUSHER_CONTENT_API_KEY?.trim();
const baseUrl = process.env.DEVRUSHER_CONTENT_BASE_URL?.trim();
const model =
  process.env.DEVRUSHER_CONTENT_REVIEW_MODEL?.trim() ||
  process.env.DEVRUSHER_CONTENT_MODEL?.trim();
const requestTimeoutMs = Number(
  process.env.DEVRUSHER_CONTENT_REQUEST_TIMEOUT_MS ?? 180_000
);
const reviewVersion = 2;
const reasonCodes = new Set([
  "keep",
  "fragment",
  "malformed",
  "wrong-premise",
  "too-specific",
  "lookup",
  "outdated",
  "redundant",
  "low-leverage",
]);

const trackLabels = {
  fundamentals: "计算机通用基础",
  frontend: "前端工程",
  backend: "后端工程",
  mobile: "移动端工程",
  quality: "质量与测试",
  platform: "平台与运维",
  "llm-algorithm": "大模型算法",
  "agent-evaluation": "Agent 评测",
  "agent-engineering": "Agent 工程",
};

function readNumberArgument(name, fallback) {
  const argument = process.argv.find(value => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const parsed = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

const batchSize = readNumberArgument("batch-size", 40);
const concurrency = readNumberArgument("concurrency", 20);
const limit = process.argv.some(value => value.startsWith("--limit="))
  ? readNumberArgument("limit", 1)
  : undefined;
const checkOnly = process.argv.includes("--check");
const candidatesPerTopic = readNumberArgument("candidates-per-topic", 100);
const candidateLimitOverrides = {
  "mobile:kotlin-multiplatform": 180,
};

function getChatCompletionsUrl(value) {
  const url = new URL(value);
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions")
    ? path
    : `${path}/chat/completions`;
  return url.toString();
}

function getResponseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(item => (typeof item?.text === "string" ? item.text : ""))
    .join("");
}

function parseJsonResponse(value) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start)
      throw new Error("Model returned invalid JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function sourceScore(question) {
  const kinds = new Set(question.occurrences.map(item => item.sourceKind));
  if (kinds.has("official-documentation") || kinds.has("research-paper")) {
    return 24;
  }
  if (kinds.has("benchmark") || kinds.has("engineering-blog")) return 22;
  if (kinds.has("firsthand")) return 18;
  if (kinds.has("curated-repository")) return 14;
  return 8;
}

function heuristicScore(question, prompt) {
  const typeScores = {
    concept: 8,
    comparison: 14,
    coding: 12,
    practical: 12,
    scenario: 18,
    "system-design": 22,
    debugging: 13,
    testing: 14,
    operations: 15,
    behavioral: 3,
  };
  const difficultyScores = { 1: 2, 2: 8, 3: 14, 4: 12, 5: 9 };
  let score = sourceScore(question);
  score += typeScores[question.questionType] ?? 0;
  score += difficultyScores[question.difficulty] ?? 0;
  score += Math.min(12, (question.occurrences.length - 1) * 4);
  if (prompt.length >= 24 && prompt.length <= 180) score += 8;
  if (/为什么|如何|机制|原理|取舍|边界|失败|设计|排查|验证|比较/.test(prompt)) {
    score += 12;
  }
  if (
    /默认值|哪个参数|哪个文件|Content-Type|HTTP 端点|CLI|安装命令/i.test(prompt)
  ) {
    score -= 24;
  }
  if (/^(?:什么是|有哪些).{0,18}[？?]$/.test(prompt)) score -= 8;
  if (prompt.length < 14 || prompt.length > 260) score -= 15;
  return score;
}

async function readTranslations() {
  try {
    const value = JSON.parse(await readFile(translationsPath, "utf8"));
    return new Map(value.items.map(item => [item.id, item]));
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
}

async function readCheckpoint() {
  try {
    const value = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid core quality review checkpoint");
    }
    return value.items;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function effectivePrompt(question, translations) {
  const translation = translations.get(question.id);
  return translation?.sourcePrompt === question.prompt
    ? translation.translatedPrompt
    : question.prompt;
}

function selectCandidates(questions, translations) {
  const selected = new Map();
  for (const trackId of Object.keys(trackLabels)) {
    const trackQuestions = questions.filter(item => item.trackId === trackId);
    const byTopic = Object.groupBy(trackQuestions, item => item.topicId);
    for (const [topicId, topicQuestions] of Object.entries(byTopic)) {
      const candidateLimit =
        candidateLimitOverrides[`${trackId}:${topicId}`] ?? candidatesPerTopic;
      const ranked = topicQuestions
        .map(question => ({
          question,
          prompt: effectivePrompt(question, translations),
        }))
        .sort(
          (left, right) =>
            heuristicScore(right.question, right.prompt) -
              heuristicScore(left.question, left.prompt) ||
            left.question.id.localeCompare(right.question.id)
        )
        .slice(0, candidateLimit);
      for (const candidate of ranked) {
        selected.set(candidate.question.id, candidate);
      }
    }
    for (const question of trackQuestions.filter(item =>
      item.collectionIds.some(id => id.endsWith("-core"))
    )) {
      selected.set(question.id, {
        question,
        prompt: effectivePrompt(question, translations),
      });
    }
  }
  return [...selected.values()];
}

async function requestReview(batch, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(getChatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content: `你是资深技术课程负责人和严格的技术题编辑。请逐题判断候选题是否值得占用某技术方向“精选 100”中的一个名额。精选的目标是：用最少题目建立完整知识骨架，掌握高频机制、关键取舍、常见故障与验证方法；完整题库才负责扩展长尾知识。

评分标准（0–100）：
- 知识杠杆与覆盖价值 30：是否是该方向必须掌握、能连接多个知识点的主题。
- 可迁移性 25：能否迁移到不同框架、公司和业务，而非单一参数或产品 trivia。
- 技术深度 20：是否考察机制、边界、取舍、设计、排障或验证，而非纯查表。
- 科学与独立性 15：前提是否可靠，脱离来源能否独立理解。
- 学习性价比 10：是否值得占用仅 100 道的名额。

90–100：必选核心；75–89：优秀精选；60–74：适合完整题库；0–59：低价值、过窄、过时或表述不佳。
先假设题目只适合完整题库，只有同时具备高学习收益、独立完整、技术前提可靠和跨场景迁移价值时才提升到 75 分以上。不要因为题目来自真实面试、官方仓库或难度较高就自动加分。

分数上限规则：
- 带“追问 N”、不明代词、来源上下文残片、错误翻译、病句或错误前提：最高 30。
- 内部 fixture、环境变量、单个测试夹具、私有控制面约定、精确 API 默认值、安装步骤或一次性错误日志：最高 55。
- 单一产品配置、窄实现技巧、纯查表、过时工具细节：最高 69。
- 具体框架题只有在能考察广泛适用的机制、边界或工程取舍时，才可以达到 75。

reason 只能取：keep、fragment、malformed、wrong-premise、too-specific、lookup、outdated、redundant、low-leverage。score >= 75 时 reason 必须是 keep；reason 不是 keep 时 score 必须低于 75。

返回严格 JSON：{"items":[{"id":"...","score":整数,"decision":"core|full","reason":"上述枚举之一"}]}。不要输出额外解释。score >= 75 时 decision 才能是 core。`,
          },
          {
            role: "user",
            content: JSON.stringify({
              items: batch.map(({ question, prompt }) => ({
                id: question.id,
                track: trackLabels[question.trackId],
                topic: question.topicLabel,
                type: question.questionType,
                difficulty: question.difficulty,
                sourceKinds: [
                  ...new Set(question.occurrences.map(item => item.sourceKind)),
                ],
                question: prompt,
              })),
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    }
    const parsed = parseJsonResponse(getResponseText(await response.json()));
    if (!Array.isArray(parsed.items)) throw new Error("Missing review items");
    const byId = new Map(parsed.items.map(item => [item?.id, item]));
    if (byId.size !== batch.length) {
      throw new Error(`Review count ${byId.size}/${batch.length}`);
    }
    return batch.map(candidate => {
      const item = byId.get(candidate.question.id);
      if (
        !item ||
        !Number.isInteger(item.score) ||
        item.score < 0 ||
        item.score > 100 ||
        !new Set(["core", "full"]).has(item.decision) ||
        !reasonCodes.has(item.reason) ||
        (item.score >= 75 && item.decision !== "core") ||
        (item.score < 75 && item.decision !== "full") ||
        (item.score >= 75 && item.reason !== "keep") ||
        (item.score < 75 && item.reason === "keep")
      ) {
        throw new Error(`${candidate.question.id}: invalid review`);
      }
      return {
        id: candidate.question.id,
        reviewVersion,
        sourcePrompt: candidate.question.prompt,
        score: item.score,
        decision: item.decision,
        reason: item.reason,
      };
    });
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise(resolve => setTimeout(resolve, 800 * 2 ** (attempt - 1)));
    return requestReview(batch, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

if (!apiKey || !baseUrl || !model) {
  throw new Error("Missing content API configuration or review model");
}

const [curated, translations, checkpointItems] = await Promise.all([
  JSON.parse(await readFile(curatedPath, "utf8")),
  readTranslations(),
  readCheckpoint(),
]);
const candidates = selectCandidates(curated.questions, translations);
const reviews = new Map(
  checkpointItems
    .filter(item => item.reviewVersion === reviewVersion)
    .map(item => [item.id, item])
);
for (const candidate of candidates) {
  const review = reviews.get(candidate.question.id);
  if (review && review.sourcePrompt !== candidate.question.prompt) {
    reviews.delete(candidate.question.id);
  }
}
const pending = candidates.filter(item => !reviews.has(item.question.id));
const reviewedCandidateCount = candidates.length - pending.length;
console.log(
  `Core candidates: ${candidates.length.toLocaleString("en-US")}; reviewed: ${reviewedCandidateCount.toLocaleString("en-US")}; pending: ${pending.length.toLocaleString("en-US")}; stored: ${reviews.size.toLocaleString("en-US")}.`
);
if (checkOnly) process.exit(0);

const selected = limit ? pending.slice(0, limit) : pending;
const batches = [];
for (let index = 0; index < selected.length; index += batchSize) {
  batches.push(selected.slice(index, index + batchSize));
}
await mkdir(dirname(checkpointPath), { recursive: true });
let saveChain = Promise.resolve();
function persistReviews() {
  const snapshot = [...reviews.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  saveChain = saveChain.then(async () => {
    const temporaryPath = `${checkpointPath}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          items: snapshot,
        },
        null,
        2
      )}\n`
    );
    await rename(temporaryPath, checkpointPath);
  });
  return saveChain;
}

let nextBatch = 0;
let completed = 0;
const warnings = [];
async function processBatch(batch) {
  try {
    const results = await requestReview(batch);
    for (const result of results) reviews.set(result.id, result);
    completed += results.length;
    await persistReviews();
    console.log(`[core-reviewed] ${completed}/${selected.length}`);
  } catch (error) {
    if (batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      await processBatch(batch.slice(0, middle));
      await processBatch(batch.slice(middle));
      return;
    }
    warnings.push({
      id: batch[0].question.id,
      error: error instanceof Error ? error.message : String(error),
    });
    completed += 1;
    console.error(`[core-skipped] ${batch[0].question.id}`);
  }
}

async function worker() {
  while (nextBatch < batches.length) {
    const index = nextBatch;
    nextBatch += 1;
    await processBatch(batches[index]);
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
);
await saveChain;

const decisions = Object.groupBy([...reviews.values()], item => item.decision);
console.log(
  `Core-rated ${decisions.core?.length ?? 0}; full-only ${decisions.full?.length ?? 0}; warnings ${warnings.length}.`
);
