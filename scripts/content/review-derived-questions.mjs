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
const inputPath = join(root, "content/inbox/official-source-questions.json");
const outputPath = join(
  root,
  "content/inbox/official-source-questions-reviewed.json"
);
const checkpointPath = join(
  root,
  "content/work/official-question-reviews.json"
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
  const parsed = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

const batchSize = readNumberArgument("batch-size", 24);
const concurrency = readNumberArgument("concurrency", 16);
const limit = process.argv.some(value => value.startsWith("--limit="))
  ? readNumberArgument("limit", 1)
  : undefined;
const checkOnly = process.argv.includes("--check");
const finalizeOnly = process.argv.includes("--finalize");

function getDocumentationTriviaRisk(question) {
  const value = String(question).trim();
  if (
    /(?:哪个|什么)(?:\s*HTTP)?\s*端点|Content-Type\s*(?:是|为)什么/i.test(value)
  ) {
    return "endpoint-or-content-type-lookup";
  }
  if (
    /(?:默认值|默认命令|默认参数|设置为多少|分别设置为多少|多少个\s*CPU|多少内存|文件名是什么|在哪个文件|哪个环境变量|哪个参数)/i.test(
      value
    )
  ) {
    return "configuration-lookup";
  }
  if (
    /--[a-z0-9-]+.{0,80}(?:有何作用|覆盖关系|默认|是否需要|需要加|调大|调小)/i.test(
      value
    )
  ) {
    return "cli-flag-lookup";
  }
  if (
    /(?:参数|字段).{0,40}(?:起什么作用|默认按哪个|取值分别|优先级是怎样|覆盖关系)/i.test(
      value
    )
  ) {
    return "field-semantics-lookup";
  }
  if (
    /该任务.{0,50}(?:多少|超时|CPU|内存)|expert time|agent timeout/i.test(value)
  ) {
    return "benchmark-fixture-lookup";
  }
  return undefined;
}

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
    if (start < 0 || end <= start)
      throw new Error("Model returned invalid JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function normalizeQuestion(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?？。.!！]+$/, "")
    .concat("？");
}

function validateQuestion(question) {
  if (!/[\u3400-\u9fff]/.test(question)) return "missing-chinese";
  if (question.length < 14 || question.length > 260) return "invalid-length";
  if (/^(?:根据|按照|在本文|本章节|这段|上述|以下|文档中)/.test(question)) {
    return "source-dependent-wording";
  }
  if (isKnownGeneratedTemplate(question)) return "known-generated-template";
  return (
    getPromptContextRisk(question) ||
    getPromptCompletenessRisk(question) ||
    getPromptPremiseRisk(question) ||
    getPromptScienceRisk(question)
  );
}

async function readCheckpoint() {
  try {
    const value = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid derived question review checkpoint");
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
            content: `你是技术面试题终审编辑。每道候选题已经从可信章节提炼，但可能仍是文档查表题、安装配置题、单个测试夹具细节或不可迁移的实现 trivia。

请做 accept、repair 或 reject：
- accept：能考察可迁移的机制、架构、取舍、排障、可靠性、安全或验证能力。
- repair：问题有价值，但依赖“上述/本文”等语境；只允许在原始证据范围内补齐对象，不得增加新前提。
- reject：只问具体端点、Content-Type、CLI 参数默认值、文件名、某个命令开关、安装步骤、单个测试数据格式，或答案只需查文档一行。

规则：
1. 不回答问题，不改变技术事实和约束。
2. 不得把查表题强行扩写成来源未提到的架构场景。
3. accept 可原样返回；repair 返回完整自然的简体中文问题；reject 的 question 为空。
4. 返回严格 JSON：{"items":[{"id":"...","decision":"accept|repair|reject","question":"..."}]}。不要输出理由，reject 的 question 为空字符串。`,
          },
          {
            role: "user",
            content: JSON.stringify({
              items: batch.map(item => ({
                id: item.reviewId,
                track: item.trackId,
                question: item.prompt,
                evidence: item.originalPrompt,
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
      if (
        !output ||
        !new Set(["accept", "repair", "reject"]).has(output.decision)
      ) {
        throw new Error(`${item.reviewId}: invalid decision`);
      }
      if (output.decision === "reject") {
        return {
          id: item.reviewId,
          fingerprint: item.fingerprint,
          decision: "reject",
          reason: String(output.reason ?? "low-transfer-value").slice(0, 300),
        };
      }
      const question =
        output.decision === "accept"
          ? item.prompt
          : normalizeQuestion(output.question);
      const rejection = validateQuestion(question);
      if (rejection) throw new Error(`${item.reviewId}: ${rejection}`);
      return {
        id: item.reviewId,
        fingerprint: item.fingerprint,
        decision: output.decision,
        question,
        reason: String(output.reason ?? "transferable").slice(0, 300),
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

const input = JSON.parse(await readFile(inputPath, "utf8"));
const candidates = input.items.map((item, index) => {
  const fingerprint = sha256(
    `${item.trackId}:${item.sourceUrl}:${item.prompt}:${item.originalPrompt}`
  );
  return {
    ...item,
    inputIndex: index,
    fingerprint,
    reviewId: `derived:${fingerprint.slice(0, 20)}`,
  };
});
const checkpoint = new Map(
  (await readCheckpoint()).map(item => [item.fingerprint, item])
);
const pending = candidates.filter(item => !checkpoint.has(item.fingerprint));
console.log(
  `Derived questions: ${candidates.length.toLocaleString("en-US")}; reviewed: ${(candidates.length - pending.length).toLocaleString("en-US")}; pending: ${pending.length.toLocaleString("en-US")}.`
);
if (checkOnly) process.exit(0);

const selected = finalizeOnly ? [] : limit ? pending.slice(0, limit) : pending;
const batches = [];
for (let index = 0; index < selected.length; index += batchSize) {
  batches.push(selected.slice(index, index + batchSize));
}
await mkdir(dirname(checkpointPath), { recursive: true });
await mkdir(dirname(outputPath), { recursive: true });
let saveChain = Promise.resolve();
function persistCheckpoint() {
  const snapshot = [...checkpoint.values()].sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint)
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
    for (const result of results) checkpoint.set(result.fingerprint, result);
    completed += results.length;
    await persistCheckpoint();
    console.log(`[quality-reviewed] ${completed}/${selected.length}`);
  } catch (error) {
    if (batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      await processBatch(batch.slice(0, middle));
      await processBatch(batch.slice(middle));
      return;
    }
    const failure = error instanceof Error ? error.message : String(error);
    warnings.push({ id: batch[0].reviewId, error: failure });
    checkpoint.set(batch[0].fingerprint, {
      id: batch[0].reviewId,
      fingerprint: batch[0].fingerprint,
      decision: "reject",
      reason: `review-failed:${failure}`.slice(0, 300),
    });
    completed += 1;
    await persistCheckpoint();
    console.error(`[quality-rejected] ${batch[0].reviewId}: ${failure}`);
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

const reviewByFingerprint = checkpoint;
let deterministicRejected = 0;
let unreviewedAccepted = 0;
const outputItems = candidates.flatMap(item => {
  const review = reviewByFingerprint.get(item.fingerprint);
  if (review?.decision === "reject") return [];
  if (!review) {
    if (getDocumentationTriviaRisk(item.prompt)) {
      deterministicRejected += 1;
      return [];
    }
    unreviewedAccepted += 1;
  }
  const {
    inputIndex: _inputIndex,
    fingerprint: _fingerprint,
    reviewId: _reviewId,
    ...sourceItem
  } = item;
  return [{ ...sourceItem, prompt: review?.question ?? item.prompt }];
});
await writeFile(
  outputPath,
  `${JSON.stringify({ schemaVersion: 1, items: outputItems }, null, 2)}\n`
);
const decisions = Object.groupBy(
  [...checkpoint.values()],
  item => item.decision
);
console.log(
  `Accepted ${decisions.accept?.length ?? 0}, repaired ${decisions.repair?.length ?? 0}, rejected ${decisions.reject?.length ?? 0}.`
);
console.log(
  `Deterministic fallback: accepted ${unreviewedAccepted}, rejected ${deterministicRejected} documentation trivia.`
);
if (warnings.length) {
  console.warn(`Rejected ${warnings.length} item(s) after invalid output.`);
}
console.log(
  `Wrote ${outputItems.length.toLocaleString("en-US")} reviewed items.`
);
