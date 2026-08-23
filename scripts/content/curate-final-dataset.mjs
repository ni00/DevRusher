import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPromptCompletenessRisk,
  hasClientTechnologyCoreRelevance,
  hasKotlinMultiplatformCoreRelevance,
} from "./source-quality.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const curatedPath = join(root, "content/work/curated.json");
const translationsPath = join(root, "content/work/translations.json");
const priorityPaths = [
  "2026-official-stack-expansion.json",
  "official-ai-labs-2026.json",
  "emerging-agent-projects.json",
].map(file => join(root, "content/inbox", file));
const outputPath = join(root, "content/inbox/manual-curation.json");
const reportPath = join(root, "content/reports/curation.json");

const trackOrder = [
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

// These caps drive this curation pass only. The build and release checks do not
// enforce them as permanent publication gates.
const trackRules = {
  fundamentals: {
    limit: 900,
    topicCaps: {
      algorithms: 220,
      "engineering-practice": 150,
      networking: 130,
      "computer-systems": 120,
      databases: 150,
      "software-design": 130,
      "distributed-systems": 50,
    },
  },
  frontend: {
    limit: 1000,
    topicCaps: {
      "javascript-typescript": 230,
      "web-platform": 220,
      browser: 120,
      react: 140,
      vue: 100,
      "frontend-engineering": 100,
      "other-frameworks": 70,
      "frontend-performance": 70,
      "frontend-security": 35,
      "frontend-architecture": 25,
    },
  },
  backend: {
    limit: 920,
    topicCaps: {
      java: 190,
      nodejs: 170,
      cache: 100,
      go: 100,
      "distributed-systems": 110,
      messaging: 90,
      "relational-databases": 90,
      "backend-system-design": 140,
    },
  },
  mobile: {
    limit: 1000,
    topicCaps: {
      android: 140,
      ios: 140,
      "kotlin-multiplatform": 190,
      "cross-platform": 70,
      lynx: 70,
      "uni-app-x": 50,
      electron: 75,
      tauri: 50,
      qt: 40,
      flutter: 100,
      harmonyos: 70,
      "react-native": 75,
    },
  },
  quality: {
    limit: 925,
    topicCaps: {
      "test-automation": 180,
      "test-strategy": 150,
      "unit-testing": 120,
      "advanced-testing": 130,
      "integration-contract": 110,
      "performance-testing": 110,
      "security-testing": 120,
    },
  },
  platform: {
    limit: 910,
    topicCaps: {
      containers: 160,
      "delivery-iac": 160,
      "linux-automation": 120,
      observability: 270,
      kubernetes: 250,
      "sre-reliability": 40,
    },
  },
  "llm-algorithm": {
    limit: 915,
    topicCaps: {
      "model-architecture": 160,
      "gpu-kernels": 210,
      "ml-foundations": 130,
      "post-training": 180,
      "inference-serving": 200,
      "model-evaluation": 90,
    },
  },
  "agent-evaluation": {
    limit: 840,
    topicCaps: {
      "evaluation-design": 270,
      "search-browser-rag": 160,
      "datasets-benchmarks": 60,
      "online-regression": 50,
      "evaluation-platform": 35,
      "safety-robustness": 40,
      "trajectory-evaluation": 35,
      "coding-tool-evaluation": 240,
      "judge-human": 25,
      "efficiency-evaluation": 25,
    },
  },
  "agent-engineering": {
    limit: 890,
    topicCaps: {
      "agent-foundations": 230,
      "context-engineering": 100,
      "tool-engineering": 180,
      rag: 90,
      "agent-frameworks": 100,
      "agent-production": 80,
      "memory-state": 70,
      "multi-agent": 130,
      "agent-safety": 40,
    },
  },
};

const relevancePatterns = {
  fundamentals:
    /算法|数据结构|复杂度|网络|tcp|udp|http|quic|dns|线程|进程|内存|操作系统|cpu|数据库|事务|索引|分布式|一致性|编程语言|软件设计|缓存|锁|并发|algorithm|data structure|big o|sorting|search|tree|graph|database|networking|concurrency|oop|software architecture|operating system|distributed systems|compiler|runtime|wasm|wasi|ebpf|io_uring/i,
  frontend:
    /javascript|typescript|css|html|dom|浏览器|react|vue|angular|next\.?js|webpack|vite|rspack|rsbuild|rolldown|oxc|biome|webgpu|前端|组件|渲染|web|node|npm|pnpm|bun|deno|agent|mcp|streaming|流式|multimodal|多模态|\bui\b/i,
  backend:
    /后端|服务端|backend|architecture|java|spring|node\.?js|golang|\bgo\b|rust|python|api|rpc|grpc|数据库|context database|agent-as-a-service|mysql|postgres|redis|kafka|消息|缓存|事务|分布式|微服务|网关|限流|鉴权|并发|线程|进程|v8|serverless/i,
  mobile:
    /android|ios|swift|objective-c|kotlin|kmp|compose|flutter|dart|react native|lynx|harmony|鸿蒙|arkts|arkui|移动端|客户端|小程序|uni-?app|uniapp|\buts\b|uvue|electron|tauri|(?:^|\W)qt(?:\W|$)|qml|xamarin|ionic/i,
  quality:
    /测试|质量|用例|断言|mock|覆盖率|selenium|playwright|cypress|fuzz|模糊|mutation|变异|property|契约|压测|性能|可靠性|故障注入|回归|验证|code review|pre-pr|testing|test\b/i,
  platform:
    /linux|容器|docker|oci|kubernetes|k8s|helm|argo|gitops|terraform|opentofu|crossplane|\biac\b|ansible|ci\/cd|流水线|部署|发布|运维|devops|sre|可观测|监控|告警|日志|trace|opentelemetry|prometheus|grafana|ebpf|cilium|gateway api|sigstore|slsa|sbom|sandbox|microvm|snapshot|agentenv|云|gpu|dra/i,
  "llm-algorithm":
    /机器学习|深度学习|神经网络|transformer|attention|llm|大模型|语言模型|模型|agentic|多模态|强化学习|\brl\b|token|embedding|微调|训练|推理|inference|speculative|量化|vllm|sglang|cuda|gpu|triton|kv cache|pagedattention|radixattention|flashinfer|fp8|fp4|moe|评估|precision|recall|pytorch/i,
  "agent-evaluation":
    /agent|智能体|llm|大模型|模型|rag|检索|工具|tool|评测|评估|基准|benchmark|rubric|judge|轨迹|trace|回归|成功率|pass@|pass\^|成本|延迟|安全|鲁棒|幻觉|swe-bench|terminal-bench|osworld|tau|τ/i,
  "agent-engineering":
    /agent|智能体|llm|大模型|模型|rag|检索|tool|工具|mcp|a2a|prompt|上下文|memory|记忆|langgraph|langchain|graph engineering|agent graph|conditional edge|reducer|checkpoint|durable|runtime|harness|agent loop|function calling|token|embedding|skill|沙箱|多.?agent|codex|claude|gemini|opencode|vercel ai|编排|orchestrat|轨迹|对话|推理|生成/i,
};

const fragmentPatterns = [
  /^[✅☑️⚠️⭐🔹🔸💡📌🎯🚀]/u,
  /^L\d+（[^）]+）[-—]/i,
  /^(?:为什么这层重要|为什么这一步重要|设计中的关键考量|关键考量|关键考虑|实际答案|参考答案|面试提示|核心思想|解决方案|工作原理|基本概念|背景|目标|步骤|要点|注意事项)[？?。！!：:]*$/,
  /^(?:解释以下内容|定义所需的模式键|定义请求体模式|定义数据字典|定义数字列表)[。.]?$/,
  /^(?:define|declare|initialize|import|print|return|create|set up)\b.{0,40}$/i,
  /^(?:定义|声明|初始化|导入|打印|返回|创建|设置|获取)(?:一个|所需|以下)?[^，,；;：:？?]{0,20}[。.]?$/,
  /^(?:第\s*\d+\s*[章节部分]|chapter\s+\d+|section\s+\d+)/i,
  /^(?:示例|案例|总结|结论|答案|代码|输出|输入)[：:]?$/,
  /(?:如下|上面|下面|前面)(?:代码|表格|图片|示例|内容)[：:]?$/,
  /^(?:是|否|对|错|同上|略)[。.]?$/,
];

function hasChinese(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function effectivePrompt(question, translationById) {
  const translation = translationById.get(question.id);
  if (
    translation?.sourcePrompt === question.prompt &&
    hasChinese(translation.translatedPrompt)
  ) {
    return translation.translatedPrompt.trim();
  }
  return question.prompt.trim();
}

function rejectionReason(question, prompt) {
  if (getPromptCompletenessRisk(prompt)) return "incomplete-source-question";
  if (!hasChinese(prompt)) return "untranslated";
  if (prompt.length < 8) return "too-short";
  if (prompt.length > 500) return "too-long";
  if (fragmentPatterns.some(pattern => pattern.test(prompt))) {
    return "fragment-or-heading";
  }
  if (/[:：]$/.test(prompt) && !/[？?]/.test(prompt)) {
    return "dangling-colon";
  }
  const trustedDerivedSource = question.occurrences.some(item =>
    new Set([
      "official-documentation",
      "engineering-blog",
      "research-paper",
      "benchmark",
    ]).has(item.sourceKind)
  );
  const strictPromptRelevance =
    !trustedDerivedSource &&
    new Set(["llm-algorithm", "agent-evaluation", "agent-engineering"]).has(
      question.trackId
    );
  const relevanceText = strictPromptRelevance
    ? prompt
    : `${prompt} ${question.tags.join(" ")}`;
  if (!relevancePatterns[question.trackId]?.test(relevanceText)) {
    return "track-mismatch";
  }
  if (
    question.trackId === "backend" &&
    /npm|pnpm|yarn|package-lock|node_modules/i.test(prompt) &&
    !/服务|运行时|依赖安全|供应链|部署|生产/.test(prompt)
  ) {
    return "frontend-tooling-in-backend";
  }
  if (!/[？?]/.test(prompt) && prompt.length < 16) {
    return "incomplete-command";
  }
  return undefined;
}

function yearOf(question) {
  const values = question.occurrences
    .map(item => Number.parseInt(String(item.publishedAt ?? ""), 10))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : undefined;
}

function questionScore(question, prompt, priorityPrompts) {
  const kinds = new Set(question.occurrences.map(item => item.sourceKind));
  let score = kinds.has("firsthand")
    ? 80
    : kinds.has("official-documentation")
      ? 55
      : kinds.has("engineering-blog")
        ? 52
        : kinds.has("benchmark")
          ? 52
          : kinds.has("research-paper")
            ? 50
            : kinds.has("curated-repository")
              ? 40
              : 25;
  if (
    question.occurrences.some(item =>
      /官方|RFC|W3C|OpenJDK|Kubernetes|React|Node\.js|PostgreSQL|Apache Kafka|Redis|JetBrains|Apple|Huawei|Lynx|OpenTelemetry|Sigstore|vLLM|SGLang|NVIDIA|Model Context Protocol|A2A|LangGraph|SWE-bench|Terminal-Bench|OSWorld|τ/i.test(
        item.sourceTitle
      )
    )
  ) {
    score += 15;
  }
  score += Math.min(24, (question.occurrences.length - 1) * 8);
  if (question.collectionIds.some(id => id.endsWith("-core"))) score += 16;
  const year = yearOf(question);
  if (year && year >= 2025) score += 16;
  else if (year && year >= 2022) score += 10;
  else if (year && year >= 2018) score += 5;
  if (
    new Set([
      "scenario",
      "system-design",
      "debugging",
      "coding",
      "testing",
      "operations",
    ]).has(question.questionType)
  ) {
    score += 7;
  }
  if (question.difficulty >= 3 && question.difficulty <= 4) score += 5;
  if (prompt.length >= 20 && prompt.length <= 180) score += 6;
  if (/为什么|如何|怎样|区别|比较|取舍|边界|失败|排查|设计|实现/.test(prompt)) {
    score += 5;
  }
  if (
    question.trackId === "mobile" &&
    question.topicId === "kotlin-multiplatform"
  ) {
    score += hasKotlinMultiplatformCoreRelevance(prompt) ? 24 : -12;
  }
  if (
    question.trackId === "mobile" &&
    new Set(["electron", "lynx", "qt", "tauri", "uni-app-x"]).has(
      question.topicId
    )
  ) {
    score += hasClientTechnologyCoreRelevance(question.topicId, prompt)
      ? 24
      : -12;
  }
  if (priorityPrompts.has(question.prompt)) score += 100;
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

async function readPriorityPrompts() {
  const prompts = new Set();
  for (const path of priorityPaths) {
    try {
      const value = JSON.parse(await readFile(path, "utf8"));
      for (const item of value.items) prompts.add(item.prompt);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return prompts;
}

async function clearCuration() {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      { schemaVersion: 1, selectedQuestionIdsByTrack: {} },
      null,
      2
    )}\n`
  );
  console.log("Cleared one-time manual curation selections.");
}

async function curate() {
  const curated = JSON.parse(await readFile(curatedPath, "utf8"));
  const [translationById, priorityPrompts] = await Promise.all([
    readTranslations(),
    readPriorityPrompts(),
  ]);
  const selectedQuestionIdsByTrack = {};
  const reports = [];

  for (const trackId of trackOrder) {
    const rule = trackRules[trackId];
    const rejected = new Map();
    const candidates = [];
    for (const question of curated.questions.filter(
      item => item.trackId === trackId
    )) {
      const prompt = effectivePrompt(question, translationById);
      const reason = rejectionReason(question, prompt);
      if (reason) {
        rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
        continue;
      }
      candidates.push({
        question,
        prompt,
        score: questionScore(question, prompt, priorityPrompts),
      });
    }

    candidates.sort(
      (left, right) =>
        right.score - left.score ||
        right.question.occurrences.length - left.question.occurrences.length ||
        left.prompt.localeCompare(right.prompt, "zh-CN")
    );

    const topicCounts = new Map();
    const selected = [];
    const selectedIds = new Set();
    for (const candidate of candidates) {
      if (selected.length >= rule.limit) break;
      const topicId = candidate.question.topicId;
      const topicCap = rule.topicCaps[topicId] ?? rule.limit;
      const count = topicCounts.get(topicId) ?? 0;
      if (count >= topicCap) continue;
      selected.push(candidate);
      selectedIds.add(candidate.question.id);
      topicCounts.set(topicId, count + 1);
    }

    const minimumTarget = Math.min(rule.limit, candidates.length);
    if (selected.length < minimumTarget) {
      for (const candidate of candidates) {
        if (selected.length >= minimumTarget) break;
        if (selectedIds.has(candidate.question.id)) continue;
        selected.push(candidate);
        selectedIds.add(candidate.question.id);
        const topicId = candidate.question.topicId;
        topicCounts.set(topicId, (topicCounts.get(topicId) ?? 0) + 1);
      }
    }

    selectedQuestionIdsByTrack[trackId] = selected
      .map(item => item.question.id)
      .sort();
    reports.push({
      trackId,
      input: curated.questions.filter(item => item.trackId === trackId).length,
      eligible: candidates.length,
      selected: selected.length,
      rejected: Object.fromEntries(
        [...rejected.entries()].sort((left, right) =>
          left[0].localeCompare(right[0])
        )
      ),
      topicCounts: Object.fromEntries(
        [...topicCounts.entries()].sort((left, right) =>
          left[0].localeCompare(right[0])
        )
      ),
      minimumScore: selected.length
        ? Math.min(...selected.map(item => item.score))
        : undefined,
    });
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  await Promise.all([
    writeFile(
      outputPath,
      `${JSON.stringify(
        { schemaVersion: 1, selectedQuestionIdsByTrack },
        null,
        2
      )}\n`
    ),
    writeFile(
      reportPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          permanentReleaseGate: false,
          reports,
        },
        null,
        2
      )}\n`
    ),
  ]);
  for (const report of reports) {
    console.log(
      `${report.trackId}: selected ${report.selected}/${report.input} (${report.eligible} eligible)`
    );
  }
}

if (process.argv.includes("--clear")) await clearCuration();
else await curate();
