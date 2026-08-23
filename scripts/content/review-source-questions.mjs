import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPromptCompletenessRisk,
  getPromptContextRisk,
  getPromptPremiseRisk,
  getPromptScienceRisk,
  isKnownGeneratedTemplate,
} from "./source-quality.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = join(root, "content/inbox/technical-community.json");
const curatedPath = join(root, "content/work/curated.json");
const checkpointPath = join(root, "content/work/source-reviews.json");
const outputPath = join(
  root,
  "content/inbox/reviewed-technical-community.json"
);
const apiKey = process.env.DEVRUSHER_CONTENT_API_KEY?.trim();
const baseUrl = process.env.DEVRUSHER_CONTENT_BASE_URL?.trim();
const model =
  process.env.DEVRUSHER_CONTENT_REVIEW_MODEL?.trim() ||
  process.env.DEVRUSHER_CONTENT_MODEL?.trim();
const requestTimeoutMs = Number(
  process.env.DEVRUSHER_CONTENT_REQUEST_TIMEOUT_MS ?? 180_000
);

function readNumberArgument(name, fallback) {
  const argument = process.argv.find(value => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

const batchSize = readNumberArgument("batch-size", 20);
const concurrency = readNumberArgument("concurrency", 8);
const limit = process.argv.some(value => value.startsWith("--limit="))
  ? readNumberArgument("limit", 1)
  : undefined;
const checkOnly = process.argv.includes("--check");

const trackDescriptions = {
  fundamentals: "算法、网络、操作系统、数据库、分布式和软件设计基础",
  frontend: "浏览器、JavaScript/TypeScript、Web 平台、框架和前端工程",
  backend: "服务端语言、数据库、缓存、消息、分布式和后端系统设计",
  mobile: "Android、iOS、HarmonyOS 和跨端移动工程",
  quality: "测试策略、自动化、性能、安全、可靠性和质量工程",
  platform: "Linux、容器、Kubernetes、交付、SRE 和可观测性",
  "llm-algorithm": "大模型架构、训练、推理、GPU 算子和模型评估",
  "agent-evaluation": "Agent 任务、轨迹、工具、Judge、安全和在线评测",
  "agent-engineering": "Agent Runtime、工具、上下文、记忆、编排和生产工程",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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
    if (start < 0 || end <= start) {
      throw new Error("Model returned invalid JSON");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function normalizeQuestion(value) {
  const question = String(value).replace(/\s+/g, " ").trim();
  return question.replace(/[?？。.!！]+$/, "") + "？";
}

function validateQuestion(item, question) {
  if (!/[\u3400-\u9fff]/.test(question)) return "missing-chinese";
  if (question.length < 10 || question.length > 260) return "invalid-length";
  if (/^(?:以下是|改写为|这道题|面试题)/.test(question)) {
    return "model-meta-output";
  }
  if (isKnownGeneratedTemplate(question)) return "known-generated-template";
  return (
    getPromptContextRisk(question) ||
    getPromptCompletenessRisk(question) ||
    getPromptPremiseRisk(question) ||
    getPromptScienceRisk(question) ||
    (question.match(/[？?]/g)?.length > 3 ? "too-many-subquestions" : undefined)
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readCheckpoint() {
  try {
    const value = await readJson(checkpointPath);
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid source review checkpoint");
    }
    return value.items;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
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
            content: `你是严格的技术面试题来源编辑。输入来自真实技术社区页面，但原始标题可能是英文、残句、错误日志或缺少独立语境。

对每一项只能做以下两种决定：
- accept：在不改变原意、不增加事实前提的情况下，将它整理为自然、完整、可独立回答的简体中文面试问题。
- reject：来源标题不足以形成可靠问题、与指定方向无关、只是版本安装报错/账号问题/产品求助，或必须读取缺失代码图片才能理解。

硬性规则：
1. 每个来源最多输出一道问题，不回答问题。
2. 不得凭空加入规模、故障、业务场景、因果关系和最佳实践。
3. 可以把错误标题整理成“出现 X 时，应从哪些方面定位原因？”；但 X 必须来自原文。
4. 保留技术名词、版本、数字、API、命令和代码标识。
5. 问题必须属于指定方向，不能因为来源仓库叫 AI 就把普通 Python/算法题归入 Agent。
6. 问题以问号结尾，建议 20–160 字，最多三个紧密相关的追问。
7. 返回严格 JSON：{"items":[{"id":"...","decision":"accept|reject","question":"...","reason":"..."}]}。reject 时 question 为空字符串。`,
          },
          {
            role: "user",
            content: JSON.stringify({
              items: batch.map(item => ({
                id: item.reviewId,
                track: item.trackId,
                trackDescription: trackDescriptions[item.trackId],
                category: item.category,
                sourceTitle: item.sourceTitle,
                original: item.prompt,
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
    return batch.map(item => {
      const output = byId.get(item.reviewId);
      if (!output || !new Set(["accept", "reject"]).has(output.decision)) {
        throw new Error(`${item.reviewId}: invalid decision`);
      }
      if (output.decision === "reject") {
        return {
          id: item.reviewId,
          sourceFingerprint: item.sourceFingerprint,
          decision: "reject",
          reason: String(output.reason ?? "model-rejected").slice(0, 300),
        };
      }
      const question = normalizeQuestion(output.question);
      const rejection = validateQuestion(item, question);
      if (rejection) throw new Error(`${item.reviewId}: ${rejection}`);
      return {
        id: item.reviewId,
        sourceFingerprint: item.sourceFingerprint,
        decision: "accept",
        question,
        reason: String(output.reason ?? "source-grounded").slice(0, 300),
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
  throw new Error(
    "Missing DEVRUSHER_CONTENT_API_KEY, DEVRUSHER_CONTENT_BASE_URL or review model"
  );
}

const [source, curated, checkpointItems] = await Promise.all([
  readJson(sourcePath),
  readJson(curatedPath),
  readCheckpoint(),
]);
const representedUrls = new Set(
  curated.questions.flatMap(question =>
    question.occurrences.map(item => item.sourceUrl.toLocaleLowerCase("en-US"))
  )
);
const candidates = source.items
  .map((item, index) => {
    const sourceFingerprint = sha256(
      `${item.trackId}:${item.sourceUrl}:${item.prompt}`
    );
    return {
      ...item,
      sourceIndex: index,
      sourceFingerprint,
      reviewId: `review:${sourceFingerprint.slice(0, 20)}`,
    };
  })
  .filter(
    item =>
      !representedUrls.has(item.sourceUrl.toLocaleLowerCase("en-US")) &&
      trackDescriptions[item.trackId]
  );
const checkpoint = new Map(
  checkpointItems.map(item => [item.sourceFingerprint, item])
);
const pending = candidates.filter(
  item => !checkpoint.has(item.sourceFingerprint)
);
console.log(
  `Unrepresented sources: ${candidates.length.toLocaleString("en-US")}; reviewed: ${(candidates.length - pending.length).toLocaleString("en-US")}; pending: ${pending.length.toLocaleString("en-US")}.`
);
if (checkOnly) process.exit(0);

const selected = limit ? pending.slice(0, limit) : pending;
const batches = [];
for (let index = 0; index < selected.length; index += batchSize) {
  batches.push(selected.slice(index, index + batchSize));
}

await mkdir(dirname(checkpointPath), { recursive: true });
await mkdir(dirname(outputPath), { recursive: true });
let saveChain = Promise.resolve();
function persistCheckpoint() {
  const snapshot = [...checkpoint.values()].sort((left, right) =>
    left.sourceFingerprint.localeCompare(right.sourceFingerprint)
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
    for (const result of results)
      checkpoint.set(result.sourceFingerprint, result);
    completed += results.length;
    await persistCheckpoint();
    console.log(`[reviewed] ${completed}/${selected.length}`);
  } catch (error) {
    if (batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      await processBatch(batch.slice(0, middle));
      await processBatch(batch.slice(middle));
      return;
    }
    const failure = {
      id: batch[0]?.reviewId,
      error: error instanceof Error ? error.message : String(error),
    };
    warnings.push(failure);
    checkpoint.set(batch[0].sourceFingerprint, {
      id: batch[0].reviewId,
      sourceFingerprint: batch[0].sourceFingerprint,
      decision: "reject",
      reason: `review-failed:${failure.error}`.slice(0, 300),
    });
    completed += 1;
    await persistCheckpoint();
    console.error(`[rejected] ${failure.id}: ${failure.error}`);
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

const candidateByFingerprint = new Map(
  candidates.map(item => [item.sourceFingerprint, item])
);
const outputItems = [...checkpoint.values()]
  .filter(item => item.decision === "accept")
  .map(review => {
    const sourceItem = candidateByFingerprint.get(review.sourceFingerprint);
    if (!sourceItem) return undefined;
    return {
      prompt: review.question,
      originalPrompt: sourceItem.prompt,
      trackId: sourceItem.trackId,
      category: sourceItem.category,
      sourceKind: "technical-community",
      sourceTitle: sourceItem.sourceTitle,
      sourceUrl: sourceItem.sourceUrl,
      publishedAt: sourceItem.publishedAt,
    };
  })
  .filter(Boolean);
await writeFile(
  outputPath,
  `${JSON.stringify({ schemaVersion: 1, items: outputItems }, null, 2)}\n`
);

const counts = Object.groupBy(outputItems, item => item.trackId);
for (const trackId of Object.keys(trackDescriptions)) {
  console.log(`${trackId}: ${counts[trackId]?.length ?? 0} accepted reviews`);
}
if (warnings.length) {
  console.warn(
    `Rejected ${warnings.length} source item(s) after repeated invalid output.`
  );
}
console.log(
  `Wrote ${outputItems.length.toLocaleString("en-US")} reviewed questions.`
);
