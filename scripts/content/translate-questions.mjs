import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSimplifiedChinese } from "./chinese-script.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const curatedPath = join(root, "content/work/curated.json");
const statePath = join(root, "content/work/translations.json");
const apiKey = process.env.DEVRUSHER_CONTENT_API_KEY?.trim();
const baseUrl = process.env.DEVRUSHER_CONTENT_BASE_URL?.trim();
const model = process.env.DEVRUSHER_CONTENT_MODEL?.trim();

function readNumberArgument(name, fallback) {
  const argument = process.argv.find(value => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

const batchSize = readNumberArgument("batch-size", 30);
const concurrency = readNumberArgument("concurrency", 8);
const limit = process.argv.some(value => value.startsWith("--limit="))
  ? readNumberArgument("limit", 1)
  : undefined;
const checkOnly = process.argv.includes("--check");
const requestTimeoutMs = Number(
  process.env.DEVRUSHER_CONTENT_REQUEST_TIMEOUT_MS ?? 150_000
);

const protectedTerms = [
  "LLM-as-a-Judge",
  "Kotlin Multiplatform",
  "React Native",
  "Spring Boot",
  "Stack Overflow",
  "Hugging Face",
  "Function Calling",
  "Objective-C",
  "GitHub Actions",
  "CI/CD",
  "Node.js",
  "Next.js",
  "JavaScript",
  "TypeScript",
  "WebSocket",
  "PostgreSQL",
  "Kubernetes",
  "Prometheus",
  "TensorFlow",
  "LangChain",
  "LangGraph",
  "ChatGPT",
  "DeepEval",
  "OpenAI",
  "GraphQL",
  "ArgoCD",
  "Playwright",
  "Selenium",
  "Terraform",
  "PyTorch",
  "MongoDB",
  "Android",
  "Flutter",
  "Kotlin",
  "Swift",
  "Xamarin",
  "Cypress",
  "TestNG",
  "JUnit",
  "Docker",
  "Grafana",
  "GitOps",
  "Spring",
  "jQuery",
  "Angular",
  "React",
  "Redis",
  "Kafka",
  "MySQL",
  "cuDNN",
  "OpenCL",
  "CUDA",
  "Ragas",
  "Transformer",
  "Attention",
  "DevOps",
  "NoSQL",
  "HTTPS",
  "HTTP",
  "Web API",
  "REST",
  "HTML",
  "CSS",
  "DOM",
  "JVM",
  "MVCC",
  "Agent",
  "LLM",
  "RAG",
  "MCP",
  "API",
  "TCP",
  "UDP",
  "SQL",
  "SRE",
  "GPU",
  "CPU",
  "Linux",
  "AWS",
  "Azure",
  "GCP",
  "Java",
  "Vue",
  "Helm",
].sort((left, right) => right.length - left.length);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(value, term) {
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9])${escapeRegExp(term)}(?=$|[^A-Za-z0-9])`,
    "i"
  );
  return pattern.test(value);
}

function getRequiredTerms(prompt) {
  const terms = new Set(
    protectedTerms.filter(term => containsTerm(prompt, term))
  );
  for (const match of prompt.matchAll(/`([^`]{1,120})`/g)) {
    terms.add(match[1]);
  }
  for (const match of prompt.matchAll(
    /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\([^)]{0,80}\)|_[A-Za-z0-9_$]+)+\b/g
  )) {
    if (
      !new Set(["e.g", "i.e", "v.s", "a.m", "p.m"]).has(match[0].toLowerCase())
    ) {
      terms.add(match[0]);
    }
  }
  return [...terms];
}

function getRequiredNumbers(prompt) {
  return [
    ...new Set(
      prompt.match(/\b\d+(?:\.\d+)*(?:%|ms|s|MB|GB|TB|QPS|TPS)?\b/gi) ?? []
    ),
  ];
}

function isEnglishOnlyPrompt(value) {
  const latin = value.match(/[A-Za-z]/g)?.length ?? 0;
  return latin >= 4 && !/[\u3400-\u9fff]/.test(value);
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

function normalizeTranslation(source, value) {
  let translation = String(value).replace(/\s+/g, " ").trim();
  if (/[?？]$/.test(source)) {
    translation = translation.replace(/[?？。.!！]+$/, "") + "？";
  }
  return translation;
}

function validateTranslation(source, translated) {
  if (!/[\u3400-\u9fff]/.test(translated)) return "missing-chinese";
  if (translated.length < 4 || translated.length > 700) {
    return "invalid-length";
  }
  if (/^(?:翻译|译文|以下是|这道题)/.test(translated)) {
    return "model-meta-output";
  }
  const missingTerms = getRequiredTerms(source).filter(
    term =>
      !translated
        .toLocaleLowerCase("en-US")
        .includes(term.toLocaleLowerCase("en-US"))
  );
  if (missingTerms.length) return `missing-terms:${missingTerms.join(",")}`;
  const missingNumbers = getRequiredNumbers(source).filter(
    number => !translated.includes(number)
  );
  if (missingNumbers.length) {
    return `missing-numbers:${missingNumbers.join(",")}`;
  }
  return undefined;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readState() {
  try {
    const value = await readJson(statePath);
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid translations checkpoint");
    }
    return value.items;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function requestTranslation(batch, attempt = 1) {
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
            content: `你是资深技术面试题翻译编辑。把英文题干等义翻译为自然、简洁的简体中文。

硬性规则：
1. 只翻译，不回答问题，不解释，不增加或删除条件、示例、限定词和追问。
2. 保持单题结构、疑问语气和技术准确性。
3. 框架名、产品名、协议名、API、类名、函数名、命令、代码、缩写及公认英文技术名词保留英文，例如 React、TypeScript、Kubernetes、LLM-as-a-Judge、torch.Tensor。输入中的 terms 数组列出了必须原样出现在译文中的词，不得省略或翻译。
4. 常见自然语言概念可以翻译，例如 process→进程、thread→线程；不要把专有名词生硬音译。
5. 返回严格 JSON，格式为 {"items":[{"id":"原 ID","translation":"中文题干"}]}，顺序和数量必须与输入一致。`,
          },
          {
            role: "user",
            content: JSON.stringify({
              items: batch.map(item => ({
                id: item.id,
                text: item.prompt,
                terms: [
                  ...getRequiredTerms(item.prompt),
                  ...getRequiredNumbers(item.prompt),
                ],
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
    const payload = await response.json();
    const parsed = parseJsonResponse(getResponseText(payload));
    if (!Array.isArray(parsed.items))
      throw new Error("Missing translated items");
    const outputById = new Map();
    for (const item of parsed.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.translation !== "string"
      ) {
        throw new Error("Invalid translated item shape");
      }
      if (outputById.has(item.id))
        throw new Error(`Duplicate output ${item.id}`);
      outputById.set(item.id, item.translation);
    }
    if (outputById.size !== batch.length) {
      throw new Error(`Translation count ${outputById.size}/${batch.length}`);
    }
    return batch.map(item => {
      if (!outputById.has(item.id))
        throw new Error(`Missing output ${item.id}`);
      const translatedPrompt = normalizeSimplifiedChinese(
        normalizeTranslation(item.prompt, outputById.get(item.id))
      );
      const rejection = validateTranslation(item.prompt, translatedPrompt);
      if (rejection) throw new Error(`${item.id}: ${rejection}`);
      return {
        id: item.id,
        sourcePrompt: item.prompt,
        translatedPrompt,
      };
    });
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise(resolve => setTimeout(resolve, 600 * 2 ** (attempt - 1)));
    return requestTranslation(batch, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

if (!apiKey || !baseUrl || !model) {
  throw new Error(
    "Missing DEVRUSHER_CONTENT_API_KEY, DEVRUSHER_CONTENT_BASE_URL or DEVRUSHER_CONTENT_MODEL"
  );
}

const curated = await readJson(curatedPath);
const sourceQuestions = curated.questions.filter(question =>
  isEnglishOnlyPrompt(question.prompt)
);
const existingItems = await readState();
const translations = new Map(
  existingItems
    .filter(item => typeof item?.id === "string")
    .map(item => [item.id, item])
);
const validExistingIds = new Set(
  sourceQuestions
    .filter(question => {
      const existing = translations.get(question.id);
      return (
        existing?.sourcePrompt === question.prompt &&
        !validateTranslation(question.prompt, existing.translatedPrompt)
      );
    })
    .map(question => question.id)
);
const pending = sourceQuestions.filter(
  question => !validExistingIds.has(question.id)
);

console.log(
  `English questions: ${sourceQuestions.length.toLocaleString("en-US")}; translated: ${validExistingIds.size.toLocaleString("en-US")}; pending: ${pending.length.toLocaleString("en-US")}.`
);
if (checkOnly) process.exit(0);

const selected = limit ? pending.slice(0, limit) : pending;
const batches = [];
for (let index = 0; index < selected.length; index += batchSize) {
  batches.push(selected.slice(index, index + batchSize));
}

await mkdir(dirname(statePath), { recursive: true });
let saveChain = Promise.resolve();
function persistState() {
  const snapshot = [...translations.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  saveChain = saveChain.then(async () => {
    const temporaryPath = `${statePath}.tmp`;
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
    await rename(temporaryPath, statePath);
  });
  return saveChain;
}

let nextBatch = 0;
let completed = 0;
const failures = [];
async function processBatch(batch) {
  try {
    const results = await requestTranslation(batch);
    for (const result of results) translations.set(result.id, result);
    completed += results.length;
    await persistState();
    console.log(
      `[translated] ${(validExistingIds.size + completed).toLocaleString("en-US")}/${sourceQuestions.length.toLocaleString("en-US")}`
    );
  } catch (error) {
    if (batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      await processBatch(batch.slice(0, middle));
      await processBatch(batch.slice(middle));
      return;
    }
    failures.push({
      id: batch[0]?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`[failed] ${batch[0]?.id}: ${failures.at(-1).error}`);
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

if (failures.length) {
  throw new Error(
    `Translation incomplete (${failures.length}): ${failures
      .slice(0, 20)
      .map(item => `${item.id} ${item.error}`)
      .join("; ")}`
  );
}
console.log(`Translated ${completed.toLocaleString("en-US")} questions.`);
