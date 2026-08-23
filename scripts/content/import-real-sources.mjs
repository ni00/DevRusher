import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCoreSpecificityRisk,
  getPromptCompletenessRisk,
  getPromptContextRisk,
  getPromptPremiseRisk,
  getPromptScienceRisk,
  hasClientTechnologyCoreRelevance,
  hasKotlinMultiplatformCoreRelevance,
  isKnownGeneratedTemplate,
} from "./source-quality.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inbox = join(root, "content/inbox");
const output = join(root, "content/work/curated.json");

const collections = [
  ["fundamentals-library", "计算机基础完整题库", "有明确来源的计算机基础题目"],
  ["fundamentals-core", "计算机基础精选", "适合优先完成的计算机基础题目"],
  ["frontend-library", "前端完整题库", "来自社区题库和真实面经的前端问题"],
  ["frontend-core", "前端精选", "从完整题库中选出的前端核心问题"],
  ["backend-library", "后端完整题库", "来自真实面经和可信仓库的后端问题"],
  ["backend-core", "后端精选", "适合优先完成的后端问题"],
  [
    "mobile-library",
    "客户端与移动端完整题库",
    "有明确来源的移动端与多端客户端问题",
  ],
  ["mobile-core", "客户端与移动端精选", "适合优先完成的移动端与多端客户端问题"],
  ["quality-library", "质量与测试完整题库", "有明确来源的质量与测试问题"],
  ["quality-core", "质量与测试精选", "适合优先完成的质量与测试问题"],
  ["platform-library", "平台与运维完整题库", "有明确来源的平台与运维问题"],
  ["platform-core", "平台与运维精选", "适合优先完成的平台与运维问题"],
  [
    "llm-algorithm-library",
    "大模型算法完整题库",
    "来自面经、官方材料和论文的问题",
  ],
  ["llm-algorithm-core", "大模型算法精选", "适合优先完成的大模型算法问题"],
  [
    "agent-evaluation-library",
    "Agent 评测完整题库",
    "来自面经、Benchmark 和工程材料的 Agent 评测问题",
  ],
  ["agent-evaluation-core", "Agent 评测精选", "适合优先完成的 Agent 评测问题"],
  [
    "agent-engineering-library",
    "Agent 工程完整题库",
    "来自面经、官方文档和工程材料的 Agent 工程问题",
  ],
  ["agent-engineering-core", "Agent 工程精选", "适合优先完成的 Agent 工程问题"],
].map(([id, label, description]) => ({ id, label, description }));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanPrompt(value) {
  return String(value)
    .replace(/^面试官[：:]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\?+$/g, "？")
    .trim();
}

function looksLikeExplicitQuestion(value) {
  const prompt = String(value).trim();
  if (/[？?]$/.test(prompt)) return true;
  if (
    /^(explain|describe|define|design|implement|write|compare|discuss|walk me through|tell me|given)\b/i.test(
      prompt
    )
  ) {
    return true;
  }
  if (
    /^(what|why|how|when|where|which|who)\s+(?:is|are|do|does|did|can|could|would|should|will|has|have)\b/i.test(
      prompt
    )
  ) {
    return true;
  }
  if (/^(can|could|would|should|do|does|did|is|are|has|have)\b/i.test(prompt)) {
    return true;
  }
  return /^(什么|为什么|如何|怎样|哪些|是否|解释|说明|设计|实现|请)/.test(
    prompt
  );
}

function semanticText(value) {
  return cleanPrompt(value)
    .toLocaleLowerCase("zh-CN")
    .replace(
      /^(请问|请你|请|谈谈|聊聊|说说|简述|介绍一下|解释一下|如何理解|你知道|你了解)/,
      ""
    )
    .replace(/你对|你的|一下|分别|具体|简单|详细/g, "")
    .replace(/[\s，。！？、；：,.!?;:()（）【】\[\]"'“”‘’`]/g, "");
}

function bigrams(value) {
  const items = new Set();
  for (let index = 0; index < value.length - 1; index += 1) {
    items.add(value.slice(index, index + 2));
  }
  return items;
}

function isSemanticDuplicate(left, right) {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 7) return false;
  if (left.includes(right) || right.includes(left)) {
    return (
      Math.min(left.length, right.length) /
        Math.max(left.length, right.length) >=
      0.78
    );
  }
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  let intersection = 0;
  for (const item of leftGrams) if (rightGrams.has(item)) intersection += 1;
  const union = leftGrams.size + rightGrams.size - intersection;
  return union > 0 && intersection / union >= 0.76;
}

function inferQuestionType(prompt) {
  if (
    /手写|写一个|实现|代码|算法题|编程|implement|write (?:a|an|the)|code/i.test(
      prompt
    )
  ) {
    return "coding";
  }
  if (
    /排查|定位|故障|异常|为什么.*失败|debug|troubleshoot|failure/i.test(prompt)
  ) {
    return "debugging";
  }
  if (/测试|用例|验证|\btest(?:ing)?\b|verification|validation/i.test(prompt)) {
    return "testing";
  }
  if (
    /系统设计|架构|设计一个|如何设计|system design|architecture|design (?:a|an)/i.test(
      prompt
    )
  ) {
    return "system-design";
  }
  if (
    /部署|发布|监控|告警|运维|deploy|release|monitor|operations/i.test(prompt)
  ) {
    return "operations";
  }
  if (
    /区别|对比|异同|相比|差异|difference|compare|versus|\bvs\.?\b/i.test(prompt)
  ) {
    return "comparison";
  }
  if (/项目|经历|规划|协作|优点|缺点|离职|为什么选择/.test(prompt)) {
    return "behavioral";
  }
  if (
    /如果|假设|场景|你会怎么|如何处理|怎么办|how would|what would|suppose|scenario/i.test(
      prompt
    )
  ) {
    return "scenario";
  }
  return "concept";
}

function inferDifficulty(prompt, questionType) {
  const challengeSignals = [
    /一致性|consistency/i,
    /并发|concurrency/i,
    /故障|恢复|failure|recovery/i,
    /隔离|安全|security|isolation/i,
    /性能|延迟|吞吐|performance|latency|throughput/i,
    /成本|预算|cost|budget/i,
    /迁移|兼容|migration|compatib/i,
    /调度|分片|复制|scheduling|shard|replication/i,
  ].filter(pattern => pattern.test(prompt)).length;
  if (
    (questionType === "system-design" && prompt.length >= 85) ||
    (prompt.length >= 120 && challengeSignals >= 2)
  ) {
    return 5;
  }
  if (
    prompt.length >= 70 &&
    /形式化|证明.{0,20}正确性|无锁.{0,30}内存序|编译器.{0,30}优化.{0,30}正确|内核.{0,30}调度|跨区域.{0,30}一致性|CUDA.{0,30}(?:内核|算子).{0,30}(?:优化|调度)|分布式.{0,30}(?:恢复|共识).{0,30}(?:证明|保证)/i.test(
      prompt
    )
  ) {
    return 5;
  }
  if (
    /源码|底层|内核|架构|一致性|并发控制|系统设计|性能瓶颈|故障|internals|kernel|architecture|consistency|concurrency|bottleneck/i.test(
      prompt
    )
  ) {
    return 4;
  }
  if (
    new Set([
      "coding",
      "debugging",
      "scenario",
      "testing",
      "operations",
      "system-design",
    ]).has(questionType)
  ) {
    return 3;
  }
  if (
    /原理|机制|实现|流程|取舍|优缺点|mechanism|implementation|trade-?off|lifecycle/i.test(
      prompt
    )
  ) {
    return 3;
  }
  if (
    /^(?:什么是|请定义|定义)(?!.*(?:为什么|如何|区别|原理|机制|实现|边界|取舍|场景)).{2,30}[？?]$/i.test(
      prompt
    )
  ) {
    return 1;
  }
  if (/是什么|有哪些|作用|区别|^what |^which |^define /i.test(prompt)) return 2;
  return 2;
}

function topicForSource(trackId, category, prompt) {
  const value = `${category} ${prompt}`.toLocaleLowerCase("zh-CN");

  if (trackId === "fundamentals") {
    if (
      /算法|leetcode|数据结构|二叉|链表|排序|查找|algorithm|data structure|tree|graph|linked list|sorting|big[- ]?o/.test(
        value
      )
    ) {
      return ["algorithms", "数据结构与算法"];
    }
    if (/tcp|udp|http|https|网络|dns|websocket|network/.test(value)) {
      return ["networking", "计算机网络"];
    }
    if (
      /线程|进程|操作系统|内存|锁|cas|aqs|concurrency|thread|process|operating system|memory/.test(
        value
      )
    ) {
      return ["computer-systems", "操作系统与计算机体系"];
    }
    if (/database|sql|数据库|primary key|index/.test(value)) {
      return ["databases", "数据库基础"];
    }
    if (/distributed|cap theorem|load balanc|分布式|一致性/.test(value)) {
      return ["distributed-systems", "分布式系统"];
    }
    if (
      /oop|object.?oriented|software architecture|design pattern|软件设计/.test(
        value
      )
    ) {
      return ["software-design", "编程语言与软件设计"];
    }
    if (/项目|经历|规划|优点|缺点/.test(value)) {
      return ["behavioral-interview", "项目与行为面试"];
    }
    return ["engineering-practice", "工程实践"];
  }

  if (trackId === "frontend") {
    if (/react|next\.js|nextjs/.test(value))
      return ["react", "React 与 Next.js"];
    if (/vue/.test(value)) return ["vue", "Vue"];
    if (/angular|jquery/.test(value))
      return ["other-frameworks", "其他前端框架"];
    if (/安全|xss|csrf|csp/.test(value))
      return ["frontend-security", "前端安全"];
    if (/性能|白屏|首屏|缓存|懒加载|web vitals/.test(value)) {
      return ["frontend-performance", "前端性能与可靠性"];
    }
    if (/webpack|vite|rspack|babel|eslint|工程化|构建|部署|git/.test(value)) {
      return ["frontend-engineering", "前端工程化与质量"];
    }
    if (
      /浏览器|渲染|事件循环|event loop|存储|cookie|同源|cors|http|url/.test(
        value
      )
    ) {
      return ["browser", "浏览器原理"];
    }
    if (/html|css|dom|布局|样式|web平台/.test(value)) {
      return ["web-platform", "HTML、CSS 与 Web 平台"];
    }
    if (/架构|微前端|低代码|组件设计/.test(value)) {
      return ["frontend-architecture", "前端架构与系统设计"];
    }
    return ["javascript-typescript", "JavaScript 与 TypeScript"];
  }

  if (trackId === "backend") {
    if (/redis|缓存/.test(value)) return ["cache", "缓存与 Redis"];
    if (/kafka|message queue|消息队列/.test(value)) {
      return ["messaging", "消息队列与事件流"];
    }
    if (/mysql|数据库|mvcc|事务|sql/.test(value)) {
      return ["relational-databases", "关系数据库"];
    }
    if (/分布式|一致性|事务|distributed|consistency/.test(value))
      return ["distributed-systems", "分布式系统"];
    if (/nodejs|node\.js/.test(value)) return ["nodejs", "Node.js 服务工程"];
    if (/golang|\bgo\b/.test(value)) return ["go", "Go 服务工程"];
    if (/系统设计|架构|网关|system design|architecture/.test(value))
      return ["backend-system-design", "后端系统设计"];
    return ["java", "Java 服务工程"];
  }

  if (trackId === "mobile") {
    if (
      /kotlin.?multiplatform|\bkmp\b|\bkmm\b|compose.?multiplatform/.test(value)
    ) {
      return ["modern-cross-platform", "现代跨端框架"];
    }
    if (/electron/.test(value)) return ["electron", "Electron"];
    if (/tauri/.test(value)) return ["tauri", "Tauri"];
    if (/(?:^|\W)qt(?:\W|$)|qml|qt quick/.test(value)) {
      return ["qt", "Qt 与 QML"];
    }
    if (/lynx|reactlynx|rspeedy/.test(value)) return ["lynx", "Lynx"];
    if (/uni-?app(?:\s*x)?|uniapp(?:\s*x)?|\buts\b|uvue/.test(value)) {
      return ["uni-app-x", "uni-app 与 uni-app x"];
    }
    if (/harmony|arkts|arkui/.test(value)) return ["harmonyos", "HarmonyOS"];
    if (/android|kotlin/.test(value)) return ["android", "Android"];
    if (/ios|swift|objective-c/.test(value)) return ["ios", "iOS"];
    if (/flutter/.test(value)) return ["flutter", "Flutter"];
    if (/react native/.test(value)) return ["react-native", "React Native"];
    return ["cross-platform", "小程序与跨端"];
  }

  if (trackId === "quality") {
    if (/performance|load test|stress test|性能/.test(value)) {
      return ["performance-testing", "性能测试"];
    }
    if (/security|安全/.test(value)) return ["security-testing", "安全测试"];
    if (/fuzz|mutation|property.?based|model.?based/.test(value)) {
      return ["advanced-testing", "高级测试技术"];
    }
    if (/selenium|playwright|cypress|automation|自动化/.test(value)) {
      return ["test-automation", "测试自动化"];
    }
    if (/unit|component|单元|组件/.test(value)) {
      return ["unit-testing", "单元与组件测试"];
    }
    if (/integration|contract|api test|集成|契约/.test(value)) {
      return ["integration-contract", "集成与契约测试"];
    }
    return ["test-strategy", "测试策略与设计"];
  }

  if (trackId === "platform") {
    if (/kubernetes|k8s/.test(value)) return ["kubernetes", "Kubernetes"];
    if (/docker|container|oci/.test(value)) return ["containers", "容器与 OCI"];
    if (
      /observability|prometheus|grafana|opentelemetry|ebpf|trace|metric|logging/.test(
        value
      )
    ) {
      return ["observability", "可观测性"];
    }
    if (/sre|reliability|incident|disaster|capacity/.test(value)) {
      return ["sre-reliability", "SRE 与可靠性工程"];
    }
    if (/ci\/cd|cicd|gitops|terraform|ansible|iac|delivery/.test(value)) {
      return ["delivery-iac", "持续交付、GitOps 与 IaC"];
    }
    return ["linux-automation", "Linux 与系统自动化"];
  }

  if (trackId === "llm-algorithm") {
    if (
      /model.?evaluation|metric|accuracy|precision|recall|f1|roc|auc/.test(
        value
      )
    ) {
      return ["model-evaluation", "模型评估与可解释性"];
    }
    if (/cuda|gpu|kernel|triton/.test(value)) {
      return ["gpu-kernels", "GPU 算子与内核优化"];
    }
    if (/评测|指标|效果评估/.test(value))
      return ["model-evaluation", "模型评估与可解释性"];
    if (/推理|vllm|sglang|量化|kv cache|serving/.test(value))
      return ["inference-serving", "推理服务与框架"];
    if (/训练|微调|sft|grpo|dpo|lora|training|fine-tun|rlhf/.test(value))
      return ["post-training", "微调与后训练"];
    if (
      /machine.?learning|deep.?learning|pytorch|classification|regression/.test(
        value
      )
    ) {
      return ["ml-foundations", "机器学习基础"];
    }
    return ["model-architecture", "Transformer 与模型架构"];
  }

  if (trackId === "agent-evaluation") {
    if (/trajectory|trace|轨迹|过程评测/.test(value)) {
      return ["trajectory-evaluation", "轨迹与过程评测"];
    }
    if (/judge|human eval|人工评|评分器/.test(value)) {
      return ["judge-human", "LLM Judge 与人工评测"];
    }
    if (/benchmark|dataset|test set|golden set|评测集|基准/.test(value)) {
      return ["datasets-benchmarks", "评测集与 Benchmark"];
    }
    if (/regression|online|production|shadow|回归|线上/.test(value)) {
      return ["online-regression", "在线评测与回归门禁"];
    }
    if (/safety|red.?team|guardrail|robust|安全|红队|鲁棒/.test(value)) {
      return ["safety-robustness", "安全与鲁棒性评测"];
    }
    if (/tool|coding|swe-bench|工具|代码/.test(value)) {
      return ["coding-tool-evaluation", "Coding Agent 与工具评测"];
    }
    if (/cost|latency|token|成本|延迟/.test(value)) {
      return ["efficiency-evaluation", "成本与延迟评测"];
    }
    if (/rag|retrieval|search|browser|检索|搜索|浏览器/.test(value)) {
      return ["search-browser-rag", "搜索、浏览器与 RAG 评测"];
    }
    if (/failure|debug|observab|monitor|失败|可观测|监控/.test(value)) {
      return ["evaluation-platform", "评测平台与失败分析"];
    }
    return ["evaluation-design", "评测任务与 Rubric"];
  }

  if (/rag|retrieval/.test(value)) return ["rag", "RAG 与知识工程"];
  if (/评测|evaluation|\beval\b/.test(value))
    return ["agent-production", "生产平台与可观测性"];
  if (/memory|记忆/.test(value)) return ["memory-state", "记忆、状态与持久化"];
  if (/tool|工具|mcp/.test(value))
    return ["tool-engineering", "工具、协议与 MCP"];
  if (/multi.?agent|orchestrat|多.?agent|编排/.test(value)) {
    return ["multi-agent", "多 Agent 编排"];
  }
  if (/framework|langgraph|langchain|sdk|框架/.test(value)) {
    return ["agent-frameworks", "Agent 框架与 SDK"];
  }
  if (/context|prompt|上下文/.test(value)) {
    return ["context-engineering", "上下文与 Prompt 工程"];
  }
  if (/safety|sandbox|permission|安全|沙箱|权限/.test(value)) {
    return ["agent-safety", "安全、沙箱与人工审批"];
  }
  if (/observab|production|deploy|cost|latency|生产|可观测|部署/.test(value)) {
    return ["agent-production", "生产平台与可观测性"];
  }
  return ["agent-foundations", "Agent 基础与规划"];
}

function createRawQuestion({
  prompt,
  trackId,
  category,
  collectionIds,
  occurrence,
}) {
  const normalizedPrompt = cleanPrompt(prompt);
  const questionType = inferQuestionType(normalizedPrompt);
  const [topicId, topicLabel] = topicForSource(
    trackId,
    category,
    normalizedPrompt
  );
  return {
    trackId,
    topicId,
    topicLabel,
    prompt: normalizedPrompt,
    questionType,
    difficulty: inferDifficulty(normalizedPrompt, questionType),
    tags: [category].filter(Boolean),
    collectionIds,
    occurrence: {
      ...occurrence,
      originalPrompt: cleanPrompt(
        occurrence.originalPrompt ?? normalizedPrompt
      ),
    },
  };
}

async function importHaizlin() {
  const path = join(inbox, "haizlin-fe-interview/category/history.md");
  const content = await readFile(path, "utf8");
  const results = [];
  let publishedAt;

  for (const line of content.split(/\r?\n/)) {
    const day = /^- 第\d+天 \((\d{4}-\d{2}-\d{2})\)/.exec(line);
    if (day) {
      publishedAt = day[1];
      continue;
    }
    const match =
      /^\s+- \[([^\]]+)\] \[([^\]]+)\]\((https:\/\/github\.com\/haizlin\/fe-interview\/issues\/(\d+))\)/.exec(
        line
      );
    if (!match || match[1] === "软技能") continue;

    const category = match[1];
    const trackId =
      category === "NodeJs"
        ? "backend"
        : ["小程序", "Electron", "ionic"].includes(category)
          ? "mobile"
          : "frontend";
    results.push(
      createRawQuestion({
        prompt: match[2],
        trackId,
        category,
        collectionIds: [`${trackId}-library`],
        occurrence: {
          id: `github-haizlin-issue-${match[4]}`,
          sourceId: "github:haizlin/fe-interview",
          sourceKind: "curated-repository",
          sourceTitle: `haizlin/fe-interview #${match[4]}`,
          sourceUrl: match[3],
          publishedAt,
        },
      })
    );
  }
  return results;
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

const devInterviewSources = [
  [
    "devq-data-structures",
    "data-structures-interview-questions",
    "fundamentals",
    "Data Structures",
  ],
  [
    "devq-databases",
    "databases-interview-questions",
    "fundamentals",
    "Databases",
  ],
  [
    "devq-concurrency",
    "concurrency-interview-questions",
    "fundamentals",
    "Concurrency",
  ],
  ["devq-big-o", "big-o-notation-interview-questions", "fundamentals", "Big O"],
  [
    "devq-sorting",
    "sorting-algorithms-interview-questions",
    "fundamentals",
    "Sorting Algorithms",
  ],
  [
    "devq-dynamic-programming",
    "dynamic-programming-interview-questions",
    "fundamentals",
    "Dynamic Programming",
  ],
  [
    "devq-graph",
    "graph-data-structure-interview-questions",
    "fundamentals",
    "Graph Data Structures",
  ],
  [
    "devq-binary-tree",
    "binary-tree-data-structure-interview-questions",
    "fundamentals",
    "Binary Trees",
  ],
  [
    "devq-oop",
    "oop-interview-questions",
    "fundamentals",
    "Object-Oriented Programming",
  ],
  [
    "devq-software-architecture",
    "software-architecture-interview-questions",
    "fundamentals",
    "Software Architecture",
  ],
  [
    "devq-cap-theorem",
    "cap-theorem-interview-questions",
    "fundamentals",
    "Distributed Systems",
  ],
  [
    "devq-load-balancing",
    "load-balancing-interview-questions",
    "fundamentals",
    "Distributed Systems",
  ],
  [
    "devq-websocket",
    "websocket-interview-questions",
    "fundamentals",
    "Networking",
  ],
  ["devq-java", "java-interview-questions", "backend", "Java"],
  ["devq-golang", "golang-interview-questions", "backend", "Go"],
  ["devq-redis", "redis-interview-questions", "backend", "Redis"],
  ["devq-android", "android-interview-questions", "mobile", "Android"],
  ["devq-kotlin", "kotlin-interview-questions", "mobile", "Kotlin"],
  ["devq-flutter", "flutter-interview-questions", "mobile", "Flutter"],
  ["devq-swift", "swift-interview-questions", "mobile", "Swift"],
  [
    "devq-react-native",
    "react-native-interview-questions",
    "mobile",
    "React Native",
  ],
  [
    "devq-objective-c",
    "objective-c-interview-questions",
    "mobile",
    "Objective-C",
  ],
  ["devq-ionic", "ionic-interview-questions", "mobile", "Ionic"],
  ["devq-xamarin", "xamarin-interview-questions", "mobile", "Xamarin"],
  [
    "devq-testing",
    "testing-interview-questions",
    "quality",
    "Software Testing",
  ],
  [
    "devq-agile",
    "agile-and-scrum-interview-questions",
    "quality",
    "Agile Testing",
  ],
  ["devq-devops", "devops-interview-questions", "platform", "DevOps"],
  [
    "devq-kubernetes",
    "kubernetes-interview-questions",
    "platform",
    "Kubernetes",
  ],
  ["devq-docker", "docker-interview-questions", "platform", "Docker"],
  [
    "devq-llms",
    "llms-interview-questions",
    "llm-algorithm",
    "Large Language Models",
  ],
  [
    "devq-deep-learning",
    "deep-learning-interview-questions",
    "llm-algorithm",
    "Deep Learning",
  ],
  ["devq-llmops", "llmops-interview-questions", "llm-algorithm", "LLMOps"],
  [
    "devq-model-evaluation",
    "model-evaluation-interview-questions",
    "llm-algorithm",
    "Model Evaluation",
  ],
].map(([directory, repository, trackId, category]) => ({
  directory,
  repository: `Devinterview-io/${repository}`,
  branch: "main",
  trackId,
  category,
  include: relativePath => relativePath === "README.md",
  mode: "h2",
  sourceKind: "curated-repository",
}));

const additionalMarkdownSources = [
  {
    directory: "android-senior-interview",
    repository: "mohsenoid/Android-Interview-Questions",
    branch: "main",
    trackId: "mobile",
    category: "Android",
    mode: "headings",
    sourceKind: "firsthand",
    maxQuestions: 240,
    classify: classifyMobileInterviewTrack,
  },
  {
    directory: "qa-questions",
    repository: "ankowals/qa-interview-questions",
    branch: "main",
    trackId: "quality",
    category: "QA",
    mode: "all-lines",
    sourceKind: "curated-repository",
    maxQuestions: 160,
  },
  {
    directory: "qa-automation-framework",
    repository: "YantraQA/interview-q-and-a-for-test-automation-framework",
    branch: "master",
    trackId: "quality",
    category: "Test Automation",
    mode: "all-lines",
    sourceKind: "curated-repository",
    maxQuestions: 160,
  },
  {
    directory: "devops-exercises",
    repository: "bregman-arie/devops-exercises",
    branch: "master",
    trackId: "platform",
    category: "DevOps and SRE",
    mode: "all-lines",
    sourceKind: "technical-community",
    maxQuestions: 360,
    include: relativePath =>
      /topics\/(ansible|argo|chaos_engineering|cicd|cloud|containers|datadog|devops|docker|grafana|kubernetes|linux|observability|openshift|os|prometheus|security|shell|sre|terraform)\//.test(
        relativePath
      ),
  },
  {
    directory: "agent-guide",
    repository: "adongwanai/AgentGuide",
    branch: "main",
    category: "AI Agent",
    mode: "headings",
    sourceKind: "curated-repository",
    maxQuestions: 260,
    classify: classifyAiTrack,
    include: relativePath =>
      /interview|面试|eval|评估|评测/i.test(relativePath),
  },
  {
    directory: "agent-interview-100",
    repository: "BigKunLun/agent-interview-100",
    branch: "main",
    category: "AI Agent",
    mode: "headings",
    sourceKind: "curated-repository",
    maxQuestions: 140,
    classify: classifyAiTrack,
  },
  {
    directory: "learn-nanobot",
    repository: "bcefghj/learn-nanobot",
    branch: "main",
    category: "AI Agent",
    mode: "headings",
    sourceKind: "curated-repository",
    maxQuestions: 180,
    classify: classifyAiTrack,
    include: relativePath => /interview|面试|bagua|八股/i.test(relativePath),
  },
  {
    directory: "ai-engineer-interview",
    repository: "ombharatiya/AI-Engineer-Interview-Questions",
    branch: "main",
    category: "AI Engineering",
    mode: "headings",
    sourceKind: "curated-repository",
    maxQuestions: 420,
    classify: classifyAiTrack,
  },
  {
    directory: "ai-system-design-guide",
    repository: "ombharatiya/ai-system-design-guide",
    branch: "main",
    category: "AI System Design",
    mode: "headings-and-bullets",
    sourceKind: "curated-repository",
    maxQuestions: 260,
    classify: classifyAiTrack,
    include: relativePath => /interview|question|面试/i.test(relativePath),
  },
  {
    directory: "ai-engineering-interview",
    repository: "amitshekhariitbhu/ai-engineering-interview-questions",
    branch: "main",
    category: "AI Engineering",
    mode: "headings-and-bullets",
    sourceKind: "curated-repository",
    maxQuestions: 300,
    classify: classifyAiTrack,
  },
  {
    directory: "ai-engineering-notes",
    repository: "GyanendraChaubey/AI-Engineering-Notes",
    branch: "main",
    category: "AI Engineering Interviews",
    mode: "headings",
    sourceKind: "curated-repository",
    maxQuestions: 300,
    classify: classifyAiTrack,
    include: relativePath => /interview|面试|evaluation/i.test(relativePath),
  },
  {
    directory: "agent-guide",
    repository: "adongwanai/AgentGuide",
    branch: "main",
    trackId: "agent-evaluation",
    category: "Agent Evaluation",
    mode: "question-bullets",
    sourceKind: "curated-repository",
    maxQuestions: 400,
    include: relativePath =>
      /eval|evaluation|评估|评测|benchmark/i.test(relativePath),
  },
  {
    directory: "ai-engineer-interview",
    repository: "ombharatiya/AI-Engineer-Interview-Questions",
    branch: "main",
    trackId: "agent-evaluation",
    category: "Agent Evaluation",
    mode: "question-bullets",
    sourceKind: "curated-repository",
    maxQuestions: 400,
    include: relativePath =>
      /evaluation|eval|observability/i.test(relativePath),
  },
  {
    directory: "ai-system-design-guide",
    repository: "ombharatiya/ai-system-design-guide",
    branch: "main",
    trackId: "agent-evaluation",
    category: "Agent Evaluation",
    mode: "question-bullets",
    sourceKind: "curated-repository",
    maxQuestions: 400,
    include: relativePath =>
      /eval|evaluation|benchmark|observability/i.test(relativePath),
  },
];

function classifyAiTrack(relativePath, prompt) {
  const value = `${relativePath} ${prompt}`.toLocaleLowerCase("en-US");
  if (
    /\bevals?\b|evaluat(?:e|ion|ing)|评测|评估|judge|benchmark|metric|rubric|hallucin|red.?team|test.?set|golden.?set|trajectory|regression|observab|monitor|quality|safety|guardrail|bias|accuracy|reliab|robust|pass@|score|tracing|trace|failure/.test(
      value
    )
  ) {
    return "agent-evaluation";
  }
  if (
    /transformer|attention|tokeni[sz]|pre.?train|training|fine.?tun|lora|rlhf|dpo|grpo|inference|quantiz|embedding|model architecture|loss function|optimizer|cuda|vllm|sglang|pytorch|mixture of experts|\bmoe\b/.test(
      value
    )
  ) {
    return "llm-algorithm";
  }
  return "agent-engineering";
}

function classifyMobileInterviewTrack(relativePath, prompt) {
  return /complexity|big[- ]?o|algorithm|data structure/i.test(
    `${relativePath} ${prompt}`
  )
    ? "fundamentals"
    : "mobile";
}

function cleanMarkdownQuestion(value) {
  return cleanPrompt(
    String(value)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^(?:\*\*)?(?:Q\s*)?\d+[.)、:：]\s*(?:\*\*)?/i, "")
      .replace(/^[一二三四五六七八九十]+[、.：:]\s*(?:最后[：:]?)?/i, "")
      .replace(/^(?:answer|question|答案|问题)\s*[:：]\s*/i, "")
      .replace(/\*+/g, "")
      .replace(/[_`]/g, "")
      .replace(/\s+(?:Answer|答案)\s*[:：].*$/i, "")
      .trim()
  );
}

function extractMarkdownQuestions(content, mode) {
  const results = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const heading =
      mode === "h2"
        ? /^##\s+(?!#)(.+)$/.exec(line)?.[1]
        : /^#{1,4}\s+(.+)$/.exec(line)?.[1];
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line)?.[1];
    const candidate =
      mode === "question-bullets"
        ? bullet
        : mode === "headings" || mode === "h2"
          ? heading
          : mode === "headings-and-bullets"
            ? (heading ?? bullet)
            : (heading ?? bullet ?? line.trim());
    if (!candidate) continue;
    const prompt = cleanMarkdownQuestion(candidate);
    const questionMarks = prompt.match(/[?？]/g)?.length ?? 0;
    if (
      !looksLikeExplicitQuestion(prompt) ||
      (mode === "question-bullets" && !/[?？]$/.test(prompt)) ||
      (bullet && !/[?？]$/.test(prompt) && prompt.length > 160) ||
      (bullet && questionMarks >= 2 && prompt.length > 220) ||
      prompt.length < 6 ||
      prompt.length > 500 ||
      /https?:\/\//i.test(prompt) ||
      /^(table of contents|目录|answer|答案|follow.?ups?|参考答案)$/i.test(
        prompt
      )
    ) {
      continue;
    }
    results.push({ prompt, line: index + 1 });
  }
  return results;
}

async function importMarkdownInterviewSources() {
  const results = [];
  for (const config of [...devInterviewSources, ...additionalMarkdownSources]) {
    const base = join(inbox, config.directory);
    let files;
    try {
      files = (await walk(base)).filter(path => extname(path) === ".md");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    let importedForSource = 0;
    const seen = new Set();
    for (const path of files.sort()) {
      const relativePath = relative(base, path).split(sep).join("/");
      if (config.include && !config.include(relativePath)) continue;
      const content = await readFile(path, "utf8");
      for (const candidate of extractMarkdownQuestions(content, config.mode)) {
        const localKey = semanticText(candidate.prompt);
        if (seen.has(localKey)) continue;
        seen.add(localKey);
        const trackId = config.classify
          ? config.classify(relativePath, candidate.prompt)
          : config.trackId;
        const sourceUrl = `https://github.com/${config.repository}/blob/${config.branch}/${encodeURI(relativePath)}#L${candidate.line}`;
        results.push(
          createRawQuestion({
            prompt: candidate.prompt,
            trackId,
            category:
              config.directory === "devops-exercises"
                ? (relativePath.split("/")[1] ?? config.category)
                : config.category,
            collectionIds: [`${trackId}-library`],
            occurrence: {
              id: `github-${sha256(`${config.repository}:${relativePath}:${candidate.line}`).slice(0, 20)}`,
              sourceId: `github:${config.repository}:${relativePath}`,
              sourceKind: config.sourceKind,
              sourceTitle: `${config.repository} · ${relativePath}`,
              sourceUrl,
            },
          })
        );
        importedForSource += 1;
        if (config.maxQuestions && importedForSource >= config.maxQuestions) {
          break;
        }
      }
      if (config.maxQuestions && importedForSource >= config.maxQuestions) {
        break;
      }
    }
  }
  return results;
}

function feboboTrack(directory) {
  if (["algorithm"].includes(directory)) return "fundamentals";
  if (["applet"].includes(directory)) return "mobile";
  if (["nodejs"].includes(directory)) return "backend";
  return "frontend";
}

async function importFebobo() {
  const base = join(inbox, "febobo-web-interview");
  const docs = join(base, "docs");
  const files = (await walk(docs)).filter(
    path =>
      extname(path) === ".md" &&
      !path.includes(`${sep}.vuepress${sep}`) &&
      !path.endsWith(`${sep}README.md`)
  );
  const results = [];

  for (const path of files) {
    const content = await readFile(path, "utf8");
    const heading = /^#\s+(.+)$/m.exec(content)?.[1];
    if (!heading) continue;
    const relativePath = relative(base, path).split(sep).join("/");
    const category = relativePath.split("/")[1] ?? "frontend";
    const trackId = feboboTrack(category.toLocaleLowerCase("en-US"));
    const sourceUrl = `https://github.com/febobo/web-interview/blob/master/${encodeURI(relativePath)}`;
    const occurrenceId = `github-febobo-${sha256(relativePath).slice(0, 16)}`;
    results.push(
      createRawQuestion({
        prompt: heading,
        trackId,
        category,
        collectionIds: [`${trackId}-library`, `${trackId}-core`],
        occurrence: {
          id: occurrenceId,
          sourceId: "github:febobo/web-interview",
          sourceKind: "curated-repository",
          sourceTitle: `febobo/web-interview · ${relativePath}`,
          sourceUrl,
        },
      })
    );
  }
  return results;
}

async function importCsJobGuide() {
  const base = join(inbox, "cs-job-guide");
  const interviewDirectory = join(base, "docs/面经");
  const files = (await walk(interviewDirectory)).filter(
    path => extname(path) === ".md"
  );
  const results = [];

  for (const path of files) {
    const content = await readFile(path, "utf8");
    const body = content.includes("<!-- /TOC -->")
      ? content.split("<!-- /TOC -->")[1]
      : content;
    const title = /^#\s+(.+)$/m.exec(content)?.[1] ?? relative(base, path);
    const relativePath = relative(base, path).split(sep).join("/");
    const sourceUrl = `https://github.com/wuyoueeee/CS-Job-Guide/blob/master/${encodeURI(relativePath)}`;
    let category = "Java";

    for (const [index, line] of body.split(/\r?\n/).entries()) {
      const categoryHeading = /^###\s+(.+)$/.exec(line);
      if (categoryHeading) category = categoryHeading[1].trim();
      if (/反问/.test(category)) continue;
      const question = /^\s*-\s+(.+[？?])\s*$/.exec(line)?.[1];
      if (!question || /^部门的|后续的面试流程/.test(question)) continue;
      const trackId =
        /网络|TCP|UDP|HTTP|HTTPS|算法|LeetCode|操作系统|线程|进程/.test(
          `${category} ${question}`
        )
          ? "fundamentals"
          : "backend";
      results.push(
        createRawQuestion({
          prompt: question,
          trackId,
          category,
          collectionIds: [`${trackId}-library`, `${trackId}-core`],
          occurrence: {
            id: `github-cs-job-guide-${sha256(`${relativePath}:${index}`).slice(0, 16)}`,
            sourceId: `github:wuyoueeee/CS-Job-Guide:${relativePath}`,
            sourceKind: "firsthand",
            sourceTitle: title,
            sourceUrl,
          },
        })
      );
    }
  }
  return results;
}

async function importLlmInterview() {
  const path = join(inbox, "llm-interview/README.md");
  const content = await readFile(path, "utf8");
  const results = [];
  let category = "大模型";
  let inProjectExperience = false;

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (/^##\s+项目经验/.test(line)) inProjectExperience = true;
    if (!inProjectExperience) continue;
    const heading = /^####\s+(.+)$/.exec(line)?.[1];
    if (heading) category = heading;
    const item = /^\s*[-*]\s+(?:\*\*)?([^*：]+)(?:\*\*)?：(.+[？?。])\s*$/.exec(
      line
    );
    if (!item) continue;
    const prompt = `${item[1].trim()}：${item[2].trim()}`;
    const trackId = /Agent|评测|落地/.test(`${category} ${prompt}`)
      ? /评测/.test(prompt)
        ? "agent-evaluation"
        : "agent-engineering"
      : "llm-algorithm";
    results.push(
      createRawQuestion({
        prompt,
        trackId,
        category,
        collectionIds: [`${trackId}-library`, `${trackId}-core`],
        occurrence: {
          id: `github-llm-interview-${index}`,
          sourceId:
            "github:DolbyUUU/Awesome-LLM-Interview-Questions-and-Answers",
          sourceKind: "firsthand",
          sourceTitle: "2025 大模型算法与 Agent 开发面试记录",
          sourceUrl:
            "https://github.com/DolbyUUU/Awesome-LLM-Interview-Questions-and-Answers#项目经验",
          publishedAt: "2025",
        },
      })
    );
  }
  return results;
}

async function importJsonInbox() {
  const results = [];
  for (const file of [
    "juejin-firsthand.json",
    "nowcoder-firsthand.json",
    "nowcoder-expansion.json",
    "selenium-questions.json",
    "technical-community.json",
    "latest-trends.json",
    "client-framework-official.json",
    "2026-official-stack-expansion.json",
    "official-ai-labs-2026.json",
    "emerging-agent-projects.json",
    "reviewed-technical-community.json",
    "official-source-questions-reviewed.json",
  ]) {
    const path = join(inbox, file);
    let value;
    try {
      value = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    value.items.forEach((item, index) => {
      const sourceKind = item.sourceKind ?? "firsthand";
      const includeInCore = sourceKind === "firsthand";
      const sourceUrl = new URL(item.sourceUrl);
      results.push(
        createRawQuestion({
          prompt: item.prompt,
          trackId: item.trackId,
          category: item.category,
          collectionIds: [
            `${item.trackId}-library`,
            ...(includeInCore ? [`${item.trackId}-core`] : []),
          ],
          occurrence: {
            id: `json-${sha256(`${file}:${item.sourceUrl}:${index}`).slice(0, 20)}`,
            sourceId: `${sourceUrl.hostname}:${sourceUrl.pathname}`,
            sourceKind,
            sourceTitle: item.sourceTitle,
            sourceUrl: item.sourceUrl,
            publishedAt: item.publishedAt,
            originalPrompt: item.originalPrompt,
          },
        })
      );
    });
  }
  return results;
}

async function readManualCuration() {
  try {
    const value = JSON.parse(
      await readFile(join(inbox, "manual-curation.json"), "utf8")
    );
    if (
      value.schemaVersion !== 1 ||
      !value.selectedQuestionIdsByTrack ||
      typeof value.selectedQuestionIdsByTrack !== "object"
    ) {
      throw new Error("Invalid manual content curation");
    }
    return value.selectedQuestionIdsByTrack;
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function readCoreQualityReviews() {
  try {
    const value = JSON.parse(
      await readFile(
        join(root, "content/work/core-quality-reviews.json"),
        "utf8"
      )
    );
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) {
      throw new Error("Invalid core quality reviews");
    }
    return new Map(
      value.items
        .filter(item => item.reviewVersion === 2)
        .map(item => [item.id, item])
    );
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
}

function applyManualCuration(questions, selectedQuestionIdsByTrack) {
  const selections = new Map(
    Object.entries(selectedQuestionIdsByTrack).map(([trackId, ids]) => [
      trackId,
      new Set(ids),
    ])
  );
  return questions.filter(question => {
    const selection = selections.get(question.trackId);
    return !selection || selection.has(question.id);
  });
}

function mergeQuestions(rawQuestions) {
  const sorted = [...rawQuestions].sort((left, right) => {
    const sourcePriority = kind => (kind === "firsthand" ? 0 : 1);
    const sourceDifference =
      sourcePriority(left.occurrence.sourceKind) -
      sourcePriority(right.occurrence.sourceKind);
    if (sourceDifference !== 0) return sourceDifference;
    const leftCore = left.collectionIds.some(id => id.endsWith("-core"));
    const rightCore = right.collectionIds.some(id => id.endsWith("-core"));
    return Number(rightCore) - Number(leftCore);
  });
  const byTopic = new Map();
  const merged = [];

  for (const raw of sorted) {
    const semantic = semanticText(raw.prompt);
    if (semantic.length < 4) continue;
    const topicKey = `${raw.trackId}:${raw.topicId}`;
    const candidates = byTopic.get(topicKey) ?? [];
    const duplicate = candidates.find(question =>
      isSemanticDuplicate(question.semantic, semantic)
    );

    if (duplicate) {
      duplicate.occurrences.push(raw.occurrence);
      duplicate.collectionIds = [
        ...new Set([...duplicate.collectionIds, ...raw.collectionIds]),
      ];
      duplicate.tags = [...new Set([...duplicate.tags, ...raw.tags])].slice(
        0,
        12
      );
      continue;
    }

    const id = `real:${raw.trackId}:${sha256(`${topicKey}:${semantic}`).slice(0, 16)}`;
    const question = {
      id,
      trackId: raw.trackId,
      topicId: raw.topicId,
      topicLabel: raw.topicLabel,
      prompt: raw.prompt,
      questionType: raw.questionType,
      difficulty: raw.difficulty,
      tags: raw.tags,
      collectionIds: raw.collectionIds,
      occurrences: [raw.occurrence],
      semantic,
    };
    candidates.push(question);
    byTopic.set(topicKey, candidates);
    merged.push(question);
  }

  return merged.map(({ semantic: _semantic, ...question }) => {
    const isKotlinMultiplatform =
      question.trackId === "mobile" &&
      /kotlin.?multiplatform|\bkmp\b|\bkmm\b|compose.?multiplatform|expect.{0,8}actual|kotlin\/native|cinterop/i.test(
        `${question.prompt} ${question.tags.join(" ")}`
      );
    const dates = question.occurrences
      .map(item => item.publishedAt)
      .filter(Boolean)
      .sort();
    return {
      ...question,
      ...(isKotlinMultiplatform
        ? {
            topicId: "kotlin-multiplatform",
            topicLabel: "Kotlin Multiplatform（KMP）",
          }
        : {}),
      ...(dates.length ? { collectedAt: dates.at(-1) } : {}),
    };
  });
}

const coreTopicTargets = {
  fundamentals: {
    algorithms: 18,
    "software-design": 15,
    networking: 15,
    databases: 14,
    "computer-systems": 15,
    "distributed-systems": 13,
    "engineering-practice": 10,
  },
  frontend: {
    "javascript-typescript": 14,
    "web-platform": 12,
    browser: 10,
    react: 15,
    vue: 8,
    "frontend-engineering": 12,
    "frontend-performance": 10,
    "frontend-security": 8,
    "frontend-architecture": 4,
    "other-frameworks": 7,
  },
  backend: {
    java: 10,
    nodejs: 10,
    go: 8,
    cache: 10,
    messaging: 10,
    "relational-databases": 15,
    "distributed-systems": 15,
    "backend-system-design": 22,
  },
  mobile: {
    android: 14,
    ios: 14,
    "kotlin-multiplatform": 15,
    "cross-platform": 5,
    lynx: 7,
    "uni-app-x": 7,
    electron: 5,
    tauri: 4,
    qt: 4,
    flutter: 10,
    harmonyos: 5,
    "react-native": 10,
  },
  quality: {
    "test-automation": 14,
    "test-strategy": 15,
    "unit-testing": 12,
    "advanced-testing": 15,
    "integration-contract": 14,
    "performance-testing": 14,
    "security-testing": 16,
  },
  platform: {
    observability: 18,
    containers: 10,
    kubernetes: 20,
    "delivery-iac": 14,
    "linux-automation": 14,
    "sre-reliability": 24,
  },
  "llm-algorithm": {
    "inference-serving": 22,
    "gpu-kernels": 18,
    "model-architecture": 18,
    "post-training": 16,
    "ml-foundations": 12,
    "model-evaluation": 14,
  },
  "agent-evaluation": {
    "evaluation-design": 13,
    "coding-tool-evaluation": 12,
    "search-browser-rag": 8,
    "datasets-benchmarks": 10,
    "online-regression": 10,
    "safety-robustness": 12,
    "trajectory-evaluation": 10,
    "efficiency-evaluation": 7,
    "evaluation-platform": 8,
    "judge-human": 10,
  },
  "agent-engineering": {
    "agent-foundations": 15,
    "tool-engineering": 14,
    "multi-agent": 11,
    "agent-frameworks": 9,
    rag: 9,
    "context-engineering": 11,
    "memory-state": 11,
    "agent-production": 12,
    "agent-safety": 8,
  },
};

function assignCoreCollections(questions, coreReviews) {
  const getMinimumCoreScore = () => 75;
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
  const sourcePriority = question => {
    const kinds = new Set(question.occurrences.map(item => item.sourceKind));
    if (kinds.has("firsthand")) return 0;
    if (
      kinds.has("official-documentation") ||
      kinds.has("engineering-blog") ||
      kinds.has("research-paper") ||
      kinds.has("benchmark")
    ) {
      return 1;
    }
    if (kinds.has("curated-repository")) return 2;
    return 3;
  };

  const typeCaps = {
    concept: 45,
    comparison: 15,
    coding: 15,
    practical: 8,
    scenario: 20,
    "system-design": 18,
    debugging: 14,
    testing: 14,
    operations: 12,
    behavioral: 5,
  };
  const difficultyCaps = { 1: 10, 2: 45, 3: 38, 4: 16, 5: 6 };

  function deterministicCoreScore(question) {
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
    let score = 42 - sourcePriority(question) * 5;
    score += typeScores[question.questionType] ?? 0;
    score += difficultyScores[question.difficulty] ?? 0;
    score += Math.min(10, (question.occurrences.length - 1) * 4);
    if (question.prompt.length >= 24 && question.prompt.length <= 180) {
      score += 7;
    }
    if (
      /为什么|如何|机制|原理|取舍|边界|失败|设计|排查|验证|比较/.test(
        question.prompt
      )
    ) {
      score += 10;
    }
    if (
      /默认值|哪个参数|哪个文件|Content-Type|HTTP 端点|CLI|安装命令/i.test(
        question.prompt
      )
    ) {
      score -= 22;
    }
    if (/^(?:什么是|有哪些).{0,18}[？?]$/.test(question.prompt)) score -= 8;
    return Math.max(0, Math.min(100, score));
  }

  function getCoreScore(question) {
    const review = coreReviews.get(question.id);
    let score =
      review?.sourcePrompt === question.prompt
        ? review.score
        : deterministicCoreScore(question);
    if (getCoreSpecificityRisk(question.prompt)) {
      score = Math.min(score, 55);
    }
    if (
      question.trackId === "mobile" &&
      question.topicId === "kotlin-multiplatform" &&
      !hasKotlinMultiplatformCoreRelevance(question.prompt)
    ) {
      score = Math.min(score, 55);
    }
    if (
      question.trackId === "mobile" &&
      new Set(["electron", "lynx", "qt", "tauri", "uni-app-x"]).has(
        question.topicId
      ) &&
      !hasClientTechnologyCoreRelevance(question.topicId, question.prompt)
    ) {
      score = Math.min(score, 55);
    }
    const minimumCoreScore = getMinimumCoreScore(question);
    return coreReviews.size > 0
      ? review?.sourcePrompt === question.prompt
        ? score
        : Math.min(minimumCoreScore - 1, score)
      : score;
  }

  function sortCoreCandidates(items) {
    return [...items].sort((left, right) => {
      const scoreDifference = getCoreScore(right) - getCoreScore(left);
      if (scoreDifference !== 0) return scoreDifference;
      const occurrenceDifference =
        right.occurrences.length - left.occurrences.length;
      if (occurrenceDifference !== 0) return occurrenceDifference;
      const dateDifference = String(right.collectedAt ?? "").localeCompare(
        String(left.collectedAt ?? "")
      );
      if (dateDifference !== 0) return dateDifference;
      return left.prompt.length - right.prompt.length;
    });
  }

  function takeCandidates(
    items,
    target,
    selected,
    typeCounts,
    difficultyCounts,
    enforceCaps,
    minimumScore,
    topicCounts,
    topicCaps
  ) {
    let added = 0;
    for (const question of sortCoreCandidates(items)) {
      if (added >= target) break;
      if (selected.has(question.id)) continue;
      const requiredScore =
        typeof minimumScore === "function"
          ? minimumScore(question)
          : minimumScore;
      if (getCoreScore(question) < requiredScore) continue;
      if (
        topicCaps &&
        (topicCounts.get(question.topicId) ?? 0) >=
          (topicCaps[question.topicId] ?? Number.POSITIVE_INFINITY)
      ) {
        continue;
      }
      if (
        enforceCaps &&
        ((typeCounts.get(question.questionType) ?? 0) >=
          typeCaps[question.questionType] ||
          (difficultyCounts.get(question.difficulty) ?? 0) >=
            difficultyCaps[question.difficulty])
      ) {
        continue;
      }
      selected.add(question.id);
      typeCounts.set(
        question.questionType,
        (typeCounts.get(question.questionType) ?? 0) + 1
      );
      difficultyCounts.set(
        question.difficulty,
        (difficultyCounts.get(question.difficulty) ?? 0) + 1
      );
      topicCounts.set(
        question.topicId,
        (topicCounts.get(question.topicId) ?? 0) + 1
      );
      added += 1;
    }
    return added;
  }

  for (const trackId of trackIds) {
    const target = 100;
    const coreId = `${trackId}-core`;
    const trackQuestions = questions.filter(
      question => question.trackId === trackId
    );
    for (const question of trackQuestions) {
      question.collectionIds = question.collectionIds.filter(
        id => id !== coreId
      );
    }
    const selected = new Set();
    const typeCounts = new Map();
    const difficultyCounts = new Map();
    const topicCounts = new Map();
    const topicTargets = coreTopicTargets[trackId];
    const topicCaps = Object.fromEntries(
      Object.entries(topicTargets).map(([topicId, topicTarget]) => [
        topicId,
        Math.max(topicTarget + 5, Math.ceil(topicTarget * 1.5)),
      ])
    );
    for (const [topicId, topicTarget] of Object.entries(topicTargets)) {
      const topicQuestions = trackQuestions.filter(
        question => question.topicId === topicId
      );
      const withCaps = takeCandidates(
        topicQuestions,
        topicTarget,
        selected,
        typeCounts,
        difficultyCounts,
        true,
        getMinimumCoreScore,
        topicCounts
      );
      if (withCaps < topicTarget) {
        takeCandidates(
          topicQuestions,
          topicTarget - withCaps,
          selected,
          typeCounts,
          difficultyCounts,
          false,
          getMinimumCoreScore,
          topicCounts
        );
      }
    }
    if (selected.size < Math.min(target, trackQuestions.length)) {
      const remaining = Math.min(target, trackQuestions.length) - selected.size;
      const withCaps = takeCandidates(
        trackQuestions,
        remaining,
        selected,
        typeCounts,
        difficultyCounts,
        true,
        getMinimumCoreScore,
        topicCounts,
        topicCaps
      );
      if (withCaps < remaining) {
        takeCandidates(
          trackQuestions,
          remaining - withCaps,
          selected,
          typeCounts,
          difficultyCounts,
          false,
          getMinimumCoreScore,
          topicCounts,
          topicCaps
        );
      }
    }
    if (selected.size < Math.min(target, trackQuestions.length)) {
      if (coreReviews.size > 0) {
        throw new Error(
          `${trackId}: only ${selected.size} questions passed the core quality floor`
        );
      }
      takeCandidates(
        trackQuestions,
        Math.min(target, trackQuestions.length) - selected.size,
        selected,
        typeCounts,
        difficultyCounts,
        false,
        getMinimumCoreScore,
        topicCounts
      );
    }
    if (selected.size < Math.min(target, trackQuestions.length)) {
      takeCandidates(
        trackQuestions,
        Math.min(target, trackQuestions.length) - selected.size,
        selected,
        typeCounts,
        difficultyCounts,
        false,
        0,
        topicCounts
      );
    }
    for (const question of trackQuestions) {
      if (selected.has(question.id)) question.collectionIds.push(coreId);
    }
  }
  return questions;
}

const importedGroups = await Promise.all([
  importJsonInbox(),
  importMarkdownInterviewSources(),
  importCsJobGuide(),
  importLlmInterview(),
  importFebobo(),
  importHaizlin(),
]);
const rawQuestions = importedGroups.flat();
function isPublishableSourceQuestion(raw) {
  const questionMarks = raw.prompt.match(/[？?]/g)?.length ?? 0;
  return !(
    raw.prompt.length < 6 ||
    !looksLikeExplicitQuestion(raw.prompt) ||
    questionMarks > 4 ||
    getPromptContextRisk(raw.prompt) ||
    getPromptCompletenessRisk(raw.prompt) ||
    getPromptPremiseRisk(raw.prompt) ||
    getPromptScienceRisk(raw.prompt) ||
    isKnownGeneratedTemplate(raw.prompt)
  );
}

const rejectedQuestions = rawQuestions.filter(
  raw => !isPublishableSourceQuestion(raw)
);
const acceptedQuestions = rawQuestions.filter(raw =>
  isPublishableSourceQuestion(raw)
);
const manualCuration = await readManualCuration();
const coreQualityReviews = await readCoreQualityReviews();
const questions = assignCoreCollections(
  applyManualCuration(mergeQuestions(acceptedQuestions), manualCuration),
  coreQualityReviews
);
const publishedOccurrences = questions.reduce(
  (sum, question) => sum + question.occurrences.length,
  0
);

await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      importedAt: new Date().toISOString(),
      collections,
      questions,
      stats: {
        rawOccurrences: acceptedQuestions.length,
        publishedOccurrences,
        canonicalQuestions: questions.length,
        semanticMerges: publishedOccurrences - questions.length,
        excludedByLibraryLimits:
          acceptedQuestions.length - publishedOccurrences,
        rejectedOccurrences: rejectedQuestions.length,
      },
    },
    null,
    2
  )}\n`
);

console.log(
  `Imported ${acceptedQuestions.length.toLocaleString("en-US")} sourced occurrences into ${questions.length.toLocaleString("en-US")} canonical questions; rejected ${rejectedQuestions.length.toLocaleString("en-US")} source entries that did not meet publication rules.`
);
