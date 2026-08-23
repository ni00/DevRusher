import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPromptCompletenessRisk,
  getPromptContextRisk,
  getPromptPremiseRisk,
  getPromptScienceRisk,
  isKnownGeneratedTemplate,
} from "./source-quality.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inbox = join(root, "content/inbox");
const checkpointPath = join(root, "content/work/official-extractions.json");
const outputPath = join(root, "content/inbox/official-source-questions.json");
const apiKey = process.env.DEVRUSHER_CONTENT_API_KEY?.trim();
const baseUrl = process.env.DEVRUSHER_CONTENT_BASE_URL?.trim();
const model =
  process.env.DEVRUSHER_CONTENT_REVIEW_MODEL?.trim() ||
  process.env.DEVRUSHER_CONTENT_MODEL?.trim();
const requestTimeoutMs = Number(
  process.env.DEVRUSHER_CONTENT_REQUEST_TIMEOUT_MS ?? 180_000
);

const sourceConfigs = [
  {
    directory: "curated-system-design-primer",
    repository: "donnemartin/system-design-primer",
    branch: "master",
    trackId: "fundamentals",
    category: "Software Architecture",
    sourceKind: "curated-repository",
    maxSections: 250,
  },
  {
    directory: "official-opentelemetry",
    repository: "open-telemetry/opentelemetry.io",
    branch: "main",
    trackId: "platform",
    category: "OpenTelemetry Observability",
    sourceKind: "official-documentation",
    maxSections: 120,
  },
  {
    directory: "official-cilium",
    repository: "cilium/cilium",
    branch: "main",
    trackId: "platform",
    category: "Cilium eBPF Observability",
    sourceKind: "official-documentation",
    maxSections: 120,
  },
  {
    directory: "official-vllm",
    repository: "vllm-project/vllm",
    branch: "main",
    trackId: "llm-algorithm",
    category: "vLLM Inference Serving",
    sourceKind: "official-documentation",
    maxSections: 100,
  },
  {
    directory: "official-sglang",
    repository: "sgl-project/sglang",
    branch: "main",
    trackId: "llm-algorithm",
    category: "SGLang Inference Serving",
    sourceKind: "official-documentation",
    maxSections: 120,
  },
  {
    directory: "official-flashinfer",
    repository: "flashinfer-ai/flashinfer",
    branch: "main",
    trackId: "llm-algorithm",
    category: "FlashInfer CUDA GPU Kernel",
    sourceKind: "official-documentation",
    maxSections: 60,
  },
  {
    directory: "official-transformer-engine",
    repository: "NVIDIA/TransformerEngine",
    branch: "main",
    trackId: "llm-algorithm",
    category: "NVIDIA FP8 FP4 GPU",
    sourceKind: "official-documentation",
    maxSections: 70,
  },
  {
    directory: "official-terminal-bench",
    repository: "harbor-framework/terminal-bench",
    branch: "main",
    trackId: "agent-evaluation",
    category: "Agent Evaluation",
    sourceKind: "benchmark",
    maxSections: 120,
  },
  {
    directory: "official-tau2-bench",
    repository: "sierra-research/tau2-bench",
    branch: "main",
    trackId: "agent-evaluation",
    category: "Tool Agent Evaluation",
    sourceKind: "benchmark",
    maxSections: 100,
  },
  {
    directory: "official-osworld",
    repository: "xlang-ai/OSWorld",
    branch: "main",
    trackId: "agent-evaluation",
    category: "OSWorld Browser Agent Evaluation",
    sourceKind: "benchmark",
    maxSections: 80,
  },
  {
    directory: "official-swe-bench",
    repository: "SWE-bench/SWE-bench",
    branch: "main",
    trackId: "agent-evaluation",
    category: "SWE-bench Coding Agent Evaluation",
    sourceKind: "benchmark",
    maxSections: 80,
  },
  {
    directory: "official-mcp",
    repository: "modelcontextprotocol/modelcontextprotocol",
    branch: "main",
    trackId: "agent-engineering",
    category: "MCP Tool Protocol Agent Runtime",
    sourceKind: "official-documentation",
    maxSections: 110,
  },
  {
    directory: "official-a2a",
    repository: "a2aproject/A2A",
    branch: "main",
    trackId: "agent-engineering",
    category: "A2A Multi-Agent Protocol",
    sourceKind: "official-documentation",
    maxSections: 80,
  },
  {
    directory: "official-langgraph",
    repository: "langchain-ai/langgraph",
    branch: "main",
    trackId: "agent-engineering",
    category: "LangGraph Agent Runtime Framework",
    sourceKind: "official-documentation",
    maxSections: 60,
  },
  {
    directory: "curated-system-design-primer",
    repository: "donnemartin/system-design-primer",
    branch: "master",
    trackId: "backend",
    category: "Backend System Design",
    sourceKind: "curated-repository",
    maxSections: 120,
    fingerprintScope: "backend-system-design",
  },
  {
    directory: "official-nowinandroid",
    repository: "android/nowinandroid",
    branch: "main",
    trackId: "mobile",
    category: "Android Architecture",
    sourceKind: "official-documentation",
    maxSections: 50,
  },
  {
    directory: "official-swift-book",
    repository: "swiftlang/swift-book",
    branch: "main",
    trackId: "mobile",
    category: "iOS Swift",
    sourceKind: "official-documentation",
    maxSections: 100,
  },
  {
    directory: "official-flutter-docs",
    repository: "flutter/website",
    branch: "main",
    trackId: "mobile",
    category: "Flutter",
    sourceKind: "official-documentation",
    maxSections: 100,
  },
  {
    directory: "official-react-native-docs",
    repository: "facebook/react-native-website",
    branch: "main",
    trackId: "mobile",
    category: "React Native",
    sourceKind: "official-documentation",
    maxSections: 100,
  },
  {
    directory: "official-kmp-docs",
    repository: "JetBrains/kotlin-multiplatform-dev-docs",
    branch: "master",
    trackId: "mobile",
    category: "Kotlin Multiplatform",
    sourceKind: "official-documentation",
    maxSections: 180,
  },
  {
    directory: "official-electron-docs",
    repository: "electron/electron",
    branch: "main",
    trackId: "mobile",
    category: "Electron",
    sourceKind: "official-documentation",
    maxSections: 140,
  },
  {
    directory: "official-lynx-docs",
    repository: "lynx-family/lynx-website",
    branch: "main",
    trackId: "mobile",
    category: "Lynx",
    sourceKind: "official-documentation",
    maxSections: 160,
  },
  {
    directory: "official-tauri-docs",
    repository: "tauri-apps/tauri-docs",
    branch: "v2",
    trackId: "mobile",
    category: "Tauri",
    sourceKind: "official-documentation",
    maxSections: 150,
  },
  {
    directory: "official-qt-docs",
    repository: "qt/qtdoc",
    branch: "dev",
    trackId: "mobile",
    category: "Qt QML",
    sourceKind: "official-documentation",
    maxSections: 150,
  },
  {
    directory: "official-uniapp-x-docs",
    repository: "dcloudio/unidocs-uni-app-x-zh",
    branch: "master",
    trackId: "mobile",
    category: "uni-app x UTS UVue",
    sourceKind: "official-documentation",
    maxSections: 160,
  },
  {
    directory: "official-deer-flow",
    repository: "bytedance/deer-flow",
    branch: "main",
    trackId: "agent-engineering",
    category: "DeerFlow Agent Framework Harness",
    sourceKind: "curated-repository",
    maxSections: 70,
  },
  {
    directory: "official-pi-mono",
    repository: "badlogic/pi-mono",
    branch: "main",
    trackId: "agent-engineering",
    category: "Pi Coding Agent Framework Harness",
    sourceKind: "curated-repository",
    maxSections: 70,
  },
  {
    directory: "official-eve",
    repository: "vercel/eve",
    branch: "main",
    trackId: "agent-engineering",
    category: "Eve Durable Agent Framework",
    sourceKind: "curated-repository",
    maxSections: 60,
  },
  {
    directory: "official-flue",
    repository: "withastro/flue",
    branch: "main",
    trackId: "agent-engineering",
    category: "Flue Sandbox Agent Framework",
    sourceKind: "curated-repository",
    maxSections: 50,
  },
  {
    directory: "official-mem0",
    repository: "mem0ai/mem0",
    branch: "main",
    trackId: "agent-engineering",
    category: "Agent Memory Mem0",
    sourceKind: "curated-repository",
    maxSections: 60,
  },
  {
    directory: "official-mom",
    repository: "momhq/mom",
    branch: "main",
    trackId: "agent-engineering",
    category: "Agent Memory Ledger",
    sourceKind: "curated-repository",
    maxSections: 30,
  },
  {
    directory: "official-hermes-agent",
    repository: "NousResearch/hermes-agent",
    branch: "main",
    trackId: "agent-engineering",
    category: "Hermes Self Improving Agent",
    sourceKind: "curated-repository",
    maxSections: 60,
  },
  {
    directory: "official-openclaw",
    repository: "openclaw/openclaw",
    branch: "main",
    trackId: "agent-engineering",
    category: "OpenClaw Personal Agent Framework",
    sourceKind: "curated-repository",
    maxSections: 60,
  },
  {
    directory: "official-agentenv",
    repository: "kvcache-ai/AgentENV",
    branch: "main",
    trackId: "agent-evaluation",
    category: "Agent Evaluation Environment",
    sourceKind: "benchmark",
    maxSections: 60,
  },
  {
    directory: "official-microsandbox",
    repository: "superradcompany/microsandbox",
    branch: "main",
    trackId: "agent-engineering",
    category: "MicroVM Agent Sandbox",
    sourceKind: "curated-repository",
    maxSections: 50,
  },
  {
    directory: "official-agent-infra-sandbox",
    repository: "agent-infra/sandbox",
    branch: "main",
    trackId: "agent-engineering",
    category: "Agent Browser Shell Sandbox",
    sourceKind: "curated-repository",
    maxSections: 50,
  },
  {
    directory: "official-k8s-agent-sandbox",
    repository: "kubernetes-sigs/agent-sandbox",
    branch: "main",
    trackId: "agent-engineering",
    category: "Kubernetes Agent Sandbox",
    sourceKind: "official-documentation",
    maxSections: 60,
  },
  {
    directory: "official-oci-runtime-spec",
    repository: "opencontainers/runtime-spec",
    branch: "main",
    trackId: "platform",
    category: "OCI Runtime Security",
    sourceKind: "official-documentation",
    maxSections: 50,
  },
  {
    directory: "official-openviking",
    repository: "volcengine/OpenViking",
    branch: "main",
    trackId: "agent-engineering",
    category: "OpenViking Agent Memory Context Database",
    sourceKind: "curated-repository",
    maxSections: 60,
  },
  {
    directory: "official-agentscope",
    repository: "agentscope-ai/agentscope",
    branch: "main",
    trackId: "agent-engineering",
    category: "AgentScope Runtime Framework",
    sourceKind: "curated-repository",
    maxSections: 70,
  },
  {
    directory: "official-owasp-wstg",
    repository: "OWASP/wstg",
    branch: "master",
    trackId: "quality",
    category: "Security Testing",
    sourceKind: "official-documentation",
    maxSections: 120,
  },
  {
    directory: "official-owasp-wstg",
    repository: "OWASP/wstg",
    branch: "master",
    trackId: "frontend",
    category: "Frontend Security",
    sourceKind: "official-documentation",
    maxSections: 40,
    fingerprintScope: "frontend-security",
  },
  {
    directory: "official-playwright-docs",
    repository: "microsoft/playwright.dev",
    branch: "main",
    trackId: "quality",
    category: "Test Automation Playwright",
    sourceKind: "official-documentation",
    maxSections: 100,
  },
  {
    directory: "official-k6-docs",
    repository: "grafana/k6-docs",
    branch: "main",
    trackId: "quality",
    category: "Performance Testing k6",
    sourceKind: "official-documentation",
    maxSections: 80,
  },
  {
    directory: "official-kubernetes-docs",
    repository: "kubernetes/website",
    branch: "main",
    trackId: "platform",
    category: "Kubernetes SRE Reliability",
    sourceKind: "official-documentation",
    maxSections: 140,
  },
  {
    directory: "official-react-docs",
    repository: "reactjs/react.dev",
    branch: "main",
    trackId: "frontend",
    category: "React Architecture",
    sourceKind: "official-documentation",
    maxSections: 100,
  },
];

function readNumberArgument(name, fallback) {
  const argument = process.argv.find(value => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const parsed = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

const batchSize = readNumberArgument("batch-size", 8);
const concurrency = readNumberArgument("concurrency", 12);
const limit = process.argv.some(value => value.startsWith("--limit="))
  ? readNumberArgument("limit", 1)
  : undefined;
const checkOnly = process.argv.includes("--check");
const finalizeOnly = process.argv.includes("--finalize");

const ignoredPathPattern =
  /(?:^|\/)(?:node_modules|vendor|generated|translations|locale|i18n|changelog|release[-_]?notes?|contributing|code_of_conduct|security\.md)(?:\/|$)/i;
const ignoredHeadingPattern =
  /^(?:installation|install|quickstart|quick start|getting started|prerequisites|requirements|table of contents|overview|introduction|references|see also|license|contributing|acknowledg|目录|安装|快速开始|简介|概述|参考|贡献)/i;

function categoryForQuestion(section, question) {
  const value = `${section.heading} ${question}`;
  if (section.trackId === "fundamentals") {
    if (
      /算法|复杂度|graph|tree|bfs|dfs|sort|algorithm|mapreduce/i.test(value)
    ) {
      return "Algorithms";
    }
    if (/网络|http|dns|cdn|tcp|udp|network|load balanc/i.test(value)) {
      return "Networking";
    }
    if (/数据库|sql|索引|事务|database|storage/i.test(value)) {
      return "Databases";
    }
    if (
      /分布式|一致性|复制|分片|distributed|consistency|replication|shard/i.test(
        value
      )
    ) {
      return "Distributed Systems";
    }
    return "Software Architecture";
  }
  if (section.trackId === "platform") {
    if (/sre|reliability|incident|capacity|slo|可靠性|事故|容量/i.test(value)) {
      return "SRE Reliability";
    }
    if (/kubernetes|k8s|pod|service|cluster|operator/i.test(value)) {
      return "Kubernetes";
    }
    return "OpenTelemetry eBPF Observability";
  }
  return section.category;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function cleanHeading(value) {
  return String(value)
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBody(value) {
  return String(value)
    .replace(/^---\s*[\s\S]*?\s*---\s*/m, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownSections(content) {
  const lines = content.split(/\r?\n/);
  const markers = [];
  for (let index = 0; index < lines.length; index += 1) {
    const markdown = /^(#{1,4})\s+(.+)$/.exec(lines[index]);
    if (markdown) {
      markers.push({
        line: index,
        contentStart: index + 1,
        heading: cleanHeading(markdown[2]),
      });
      continue;
    }
    if (
      index + 1 < lines.length &&
      lines[index].trim().length >= 4 &&
      /^[=\-~^"']{3,}\s*$/.test(lines[index + 1])
    ) {
      markers.push({
        line: index,
        contentStart: index + 2,
        heading: cleanHeading(lines[index]),
      });
      index += 1;
    }
  }
  return markers.map((marker, index) => ({
    heading: marker.heading,
    line: marker.line + 1,
    body: cleanBody(
      lines
        .slice(marker.contentStart, markers[index + 1]?.line ?? lines.length)
        .join("\n")
    ),
  }));
}

function qdocSections(content) {
  const lines = content.split(/\r?\n/);
  const markers = [];
  for (let index = 0; index < lines.length; index += 1) {
    const marker = /^\s*\\(?:title|section[1-4])\s+(.+)$/.exec(lines[index]);
    if (!marker) continue;
    markers.push({
      line: index,
      contentStart: index + 1,
      heading: cleanHeading(marker[1]),
    });
  }
  return markers.map((marker, index) => {
    const body = lines
      .slice(marker.contentStart, markers[index + 1]?.line ?? lines.length)
      .join("\n")
      .replace(/^\s*\\(?:li|value|row|header)\s+/gm, "")
      .replace(
        /^\s*\\(?:brief|note|warning|since|ingroup|keyword|target|sa)\s+/gm,
        ""
      )
      .replace(
        /^\s*\\(?:list|endlist|code|endcode|quotation|endquotation)\b.*$/gm,
        ""
      );
    return {
      heading: marker.heading,
      line: marker.line + 1,
      body: cleanBody(body),
    };
  });
}

function sectionScore(section, path) {
  let score = Math.min(20, Math.floor(section.body.length / 250));
  if (
    /architecture|design|runtime|evaluation|benchmark|security|performance|cache|scheduling|memory|stream|protocol|failure|reliability|trace|attention|quant|parallel|agent|tool|state|架构|设计|评测|安全|性能|故障|协议/i.test(
      `${section.heading} ${path}`
    )
  ) {
    score += 20;
  }
  if (/api reference|class |function |参数列表|索引$/i.test(section.heading)) {
    score -= 10;
  }
  return score;
}

async function discoverSections() {
  const discovered = [];
  for (const config of sourceConfigs) {
    const base = join(inbox, config.directory);
    const files = (await walk(base)).filter(path => {
      const relativePath = relative(base, path).split(sep).join("/");
      return (
        new Set([".md", ".mdx", ".rst", ".qdoc"]).has(
          extname(path).toLowerCase()
        ) && !ignoredPathPattern.test(relativePath)
      );
    });
    const candidates = [];
    for (const path of files) {
      const relativePath = relative(base, path).split(sep).join("/");
      const content = await readFile(path, "utf8");
      const sections =
        extname(path).toLowerCase() === ".qdoc"
          ? qdocSections(content)
          : markdownSections(content);
      for (const section of sections) {
        if (
          section.heading.length < 4 ||
          section.body.length < 220 ||
          ignoredHeadingPattern.test(section.heading)
        ) {
          continue;
        }
        const excerpt = section.body.slice(0, 4_500);
        const fingerprint = sha256(
          `${config.fingerprintScope ? `${config.fingerprintScope}:` : ""}${config.repository}:${relativePath}:${section.line}:${excerpt}`
        );
        candidates.push({
          id: `section:${fingerprint.slice(0, 20)}`,
          fingerprint,
          trackId: config.trackId,
          category: config.category,
          sourceKind: config.sourceKind,
          sourceTitle: `${config.repository} · ${relativePath} · ${section.heading}`,
          sourceUrl: `https://github.com/${config.repository}/blob/${config.branch}/${encodeURI(relativePath)}#L${section.line}`,
          heading: section.heading,
          excerpt,
          score: sectionScore(section, relativePath),
        });
      }
    }
    candidates.sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id)
    );
    discovered.push(...candidates.slice(0, config.maxSections));
  }
  return discovered;
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
    getPromptScienceRisk(question) ||
    ((question.match(/[？?]/g)?.length ?? 0) > 3
      ? "too-many-subquestions"
      : undefined)
  );
}

async function requestExtraction(batch, attempt = 1) {
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
            content: `你是严格的技术面试题编辑。请从每个官方文档、原始 Benchmark 或可信工程资料章节中提炼 0–2 道简体中文面试问题。

硬性规则：
1. 每道题的事实、对象和约束必须能从输入章节直接得到；不得补充章节没有的规模、故障、性能结论或业务设定。
2. 只提问题，不回答；问题必须脱离文档也能独立理解，禁止“根据本文”“上述代码”等指代。
3. 优先考察机制、取舍、边界、诊断、验证或迁移；如果章节只有安装步骤、命令清单或宣传文案，返回空数组。
4. 同一章节最多两道，二者必须考察不同决策；不要把一句话换词后重复。
5. 保留技术名词、版本、API、协议、类名、数字和代码标识。
6. 每题建议 20–180 字，以问号结束，最多三个紧密相关追问。
7. 返回严格 JSON：{"items":[{"id":"章节 ID","questions":["问题1","问题2"]}]}，顺序与输入一致。`,
          },
          {
            role: "user",
            content: JSON.stringify({
              items: batch.map(item => ({
                id: item.id,
                track: item.trackId,
                heading: item.heading,
                source: item.excerpt,
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
    if (!Array.isArray(parsed.items))
      throw new Error("Missing extraction items");
    const byId = new Map(parsed.items.map(item => [item?.id, item]));
    if (byId.size !== batch.length) {
      throw new Error(`Extraction count ${byId.size}/${batch.length}`);
    }
    return batch.map(item => {
      const output = byId.get(item.id);
      if (!output || !Array.isArray(output.questions)) {
        throw new Error(`${item.id}: invalid questions`);
      }
      const questions = [
        ...new Set(output.questions.slice(0, 2).map(normalizeQuestion)),
      ];
      for (const question of questions) {
        const rejection = validateQuestion(question);
        if (rejection) throw new Error(`${item.id}: ${rejection}`);
      }
      return {
        id: item.id,
        fingerprint: item.fingerprint,
        questions,
      };
    });
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise(resolve => setTimeout(resolve, 800 * 2 ** (attempt - 1)));
    return requestExtraction(batch, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

async function readCheckpoint() {
  try {
    const value = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid official extraction checkpoint");
    }
    return value.items;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

if (!apiKey || !baseUrl || !model) {
  throw new Error("Missing content API configuration or review model");
}

const sections = await discoverSections();
const checkpoint = new Map(
  (await readCheckpoint())
    .filter(item => !/HTTP 429|GoUsageLimitError/.test(item.warning ?? ""))
    .map(item => [item.fingerprint, item])
);
const pending = sections.filter(item => !checkpoint.has(item.fingerprint));
const sectionCounts = Object.groupBy(sections, item => item.trackId);
console.log(
  `Source sections: ${sections.length.toLocaleString("en-US")}; reviewed: ${(sections.length - pending.length).toLocaleString("en-US")}; pending: ${pending.length.toLocaleString("en-US")}.`
);
for (const trackId of Object.keys(sectionCounts)) {
  console.log(`${trackId}: ${sectionCounts[trackId].length} sections`);
}
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
    const results = await requestExtraction(batch);
    for (const result of results) checkpoint.set(result.fingerprint, result);
    completed += results.length;
    await persistCheckpoint();
    console.log(`[extracted] ${completed}/${selected.length}`);
  } catch (error) {
    if (batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      await processBatch(batch.slice(0, middle));
      await processBatch(batch.slice(middle));
      return;
    }
    const failure = error instanceof Error ? error.message : String(error);
    warnings.push({ id: batch[0].id, error: failure });
    checkpoint.set(batch[0].fingerprint, {
      id: batch[0].id,
      fingerprint: batch[0].fingerprint,
      questions: [],
      warning: failure.slice(0, 300),
    });
    completed += 1;
    await persistCheckpoint();
    console.error(`[skipped] ${batch[0].id}: ${failure}`);
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

const sectionByFingerprint = new Map(
  sections.map(item => [item.fingerprint, item])
);
const outputItems = [...checkpoint.values()].flatMap(extraction => {
  const section = sectionByFingerprint.get(extraction.fingerprint);
  if (!section) return [];
  return extraction.questions.map(question => ({
    prompt: question,
    originalPrompt: `${section.heading}\n${section.excerpt.slice(0, 800)}`,
    trackId: section.trackId,
    category: categoryForQuestion(section, question),
    sourceKind: section.sourceKind,
    sourceTitle: section.sourceTitle,
    sourceUrl: section.sourceUrl,
  }));
});
await writeFile(
  outputPath,
  `${JSON.stringify({ schemaVersion: 1, items: outputItems }, null, 2)}\n`
);
const outputCounts = Object.groupBy(outputItems, item => item.trackId);
for (const trackId of Object.keys(outputCounts)) {
  console.log(`${trackId}: ${outputCounts[trackId].length} questions`);
}
if (warnings.length) {
  console.warn(`Skipped ${warnings.length} section(s) after invalid output.`);
}
console.log(`Wrote ${outputItems.length.toLocaleString("en-US")} questions.`);
