const define = (id, label, sourceIds) => ({ id, label, sourceIds });

export const topicTaxonomy = {
  fundamentals: [
    define("algorithms", "数据结构与算法", [
      "algorithms",
      "coding",
      "complexity-analysis",
      "graph-algorithms",
      "linear-structures",
      "problem-solving",
      "trees-heaps",
    ]),
    define("computer-systems", "操作系统与计算机体系", [
      "concurrency-control",
      "memory-hierarchy",
      "operating-systems",
      "process-runtime",
    ]),
    define("networking", "计算机网络", [
      "dns-http-tls",
      "network-foundations",
      "networking",
    ]),
    define("databases", "数据库基础", ["database", "relational-databases"]),
    define("distributed-systems", "分布式系统", ["distributed-systems"]),
    define("software-design", "编程语言与软件设计", [
      "design-patterns",
      "languages-compilers",
      "software-design",
    ]),
    define("security-foundations", "安全基础", ["security-foundations"]),
    define("engineering-practice", "工程实践", [
      "debugging-observability",
      "engineering-decisions",
      "git-collaboration",
    ]),
    define("coding-interview", "编码面试", ["coding-interview"]),
    define("behavioral-interview", "项目与行为面试", [
      "behavioral-interview",
      "career",
      "education",
      "project-leadership",
    ]),
    define("other", "其它", ["other"]),
  ],
  frontend: [
    define("web-platform", "HTML、CSS 与 Web 平台", [
      "accessibility",
      "advanced-webassembly-frontend",
      "css",
      "html",
      "modern-css",
      "web-platform",
    ]),
    define("javascript-typescript", "JavaScript 与 TypeScript", [
      "javascript",
      "javascript-runtime",
      "typescript",
    ]),
    define("browser", "浏览器原理", ["browser", "browser-rendering"]),
    define("react", "React 与 Next.js", [
      "nextjs",
      "react",
      "react-architecture",
      "react-core",
    ]),
    define("vue", "Vue", ["vue"]),
    define("other-frameworks", "其他前端框架", ["angular"]),
    define("frontend-engineering", "前端工程化与质量", [
      "advanced-rspack-rsbuild",
      "design-systems",
      "frontend-testing",
      "frontend-tooling",
      "toolchain",
    ]),
    define("frontend-architecture", "前端架构与系统设计", [
      "frontend-architecture",
      "frontend-system-design",
    ]),
    define("frontend-performance", "前端性能与可靠性", [
      "frontend-reliability",
      "performance-security",
      "pwa-offline",
      "web-performance",
    ]),
    define("frontend-security", "前端安全", ["web-security"]),
  ],
  backend: [
    define("api-design", "API 与协议设计", [
      "advanced-api-evolution",
      "api-protocols",
    ]),
    define("java", "Java 服务工程", [
      "advanced-modern-java-runtime",
      "java-spring",
    ]),
    define("go", "Go 服务工程", ["advanced-go-performance", "go-runtime"]),
    define("nodejs", "Node.js 服务工程", [
      "advanced-high-performance-node",
      "node-runtime",
      "nodejs",
    ]),
    define("other-backend-languages", "其他服务端语言", [
      "advanced-rust-services",
      "python-services",
    ]),
    define("relational-databases", "关系数据库", [
      "advanced-database-migrations",
      "advanced-mysql-production",
      "advanced-postgres-internals",
      "mysql-innodb",
      "postgresql",
      "relational-modeling",
    ]),
    define("cache", "缓存与 Redis", [
      "advanced-redis-internals",
      "redis-caching",
    ]),
    define("messaging", "消息队列与事件流", [
      "advanced-kafka-streaming",
      "kafka-streaming",
      "message-queues",
    ]),
    define("storage-search", "存储、NoSQL 与搜索", [
      "advanced-object-storage",
      "advanced-search-engineering",
      "nosql-search",
      "storage-pipelines",
    ]),
    define("distributed-systems", "分布式系统", [
      "advanced-consensus-systems",
      "advanced-distributed-transactions",
      "distributed-consistency",
    ]),
    define("service-architecture", "微服务与服务架构", [
      "advanced-multi-tenant-saas",
      "microservices",
      "rpc-service-mesh",
    ]),
    define("backend-system-design", "后端系统设计", [
      "advanced-payment-systems",
      "backend-development",
      "backend-system-design",
    ]),
    define("backend-reliability", "性能与可靠性", [
      "advanced-backend-incident-design",
      "advanced-backend-profiling",
      "advanced-rate-limiting",
      "backend-reliability",
      "concurrency-performance",
    ]),
    define("backend-security", "服务端安全", ["identity-security"]),
    define("serverless", "Serverless 后端", ["advanced-serverless-backends"]),
  ],
  mobile: [
    define("android", "Android", [
      "advanced-android-architecture",
      "advanced-android-performance",
      "advanced-jetpack-compose",
      "advanced-kotlin-coroutines",
      "android-architecture",
      "android-data-network",
      "android-kotlin",
      "android-lifecycle",
      "android-performance",
      "jetpack-compose",
    ]),
    define("ios", "iOS", [
      "advanced-ios-architecture",
      "advanced-ios-performance",
      "advanced-swiftui-runtime",
      "advanced-swift-concurrency",
      "ios-data-network",
      "ios-lifecycle",
      "ios-performance",
      "swift-concurrency",
      "swift-language",
      "swiftui",
    ]),
    define("harmonyos", "HarmonyOS", [
      "advanced-harmony-arkts",
      "harmony-arkts",
      "harmony-arkui",
      "harmony-stage",
    ]),
    define("flutter", "Flutter", [
      "advanced-flutter-engine",
      "flutter-dart",
      "flutter-rendering",
    ]),
    define("react-native", "React Native", [
      "advanced-react-native-architecture",
      "react-native",
    ]),
    define("kotlin-multiplatform", "Kotlin Multiplatform（KMP）", [
      "advanced-kotlin-multiplatform",
    ]),
    define("lynx", "Lynx", ["advanced-lynx"]),
    define("uni-app-x", "uni-app 与 uni-app x", ["advanced-uni-app"]),
    define("electron", "Electron", ["advanced-electron"]),
    define("tauri", "Tauri", ["advanced-tauri"]),
    define("qt", "Qt 与 QML", ["advanced-qt"]),
    define("cross-platform", "小程序与跨端", ["cross-platform"]),
    define("mobile-data-network", "移动数据、存储与网络", [
      "advanced-mobile-networking",
      "advanced-mobile-offline-first",
      "advanced-mobile-storage",
    ]),
    define("mobile-quality-delivery", "移动端质量与交付", [
      "advanced-mobile-delivery",
      "advanced-mobile-testing",
      "mobile-delivery-quality",
    ]),
    define("mobile-security-accessibility", "移动端安全与无障碍", [
      "advanced-mobile-accessibility",
      "advanced-mobile-security",
    ]),
    define("mobile-experience", "移动端系统能力与体验", [
      "advanced-mobile-media",
      "advanced-mobile-notifications",
      "mobile-platform-services",
    ]),
  ],
  quality: [
    define("test-strategy", "测试策略与设计", [
      "advanced-risk-based-testing",
      "test-design",
      "testing-strategy",
    ]),
    define("unit-testing", "单元与组件测试", ["unit-testing"]),
    define("integration-contract", "集成与契约测试", [
      "advanced-contract-testing",
      "advanced-service-virtualization",
      "api-contract-testing",
      "integration-testing",
    ]),
    define("e2e-compatibility", "端到端与兼容性测试", [
      "accessibility-compatibility",
      "advanced-accessibility-testing",
      "distributed-testing",
      "frontend-testing",
      "mobile-testing",
      "web-e2e-playwright",
    ]),
    define("test-automation", "测试自动化", ["automation-architecture"]),
    define("performance-testing", "性能测试", [
      "advanced-performance-testing",
      "performance-testing",
    ]),
    define("security-testing", "安全测试", [
      "advanced-security-testing",
      "security-testing",
    ]),
    define("reliability-testing", "稳定性与韧性测试", [
      "advanced-chaos-testing",
      "advanced-flaky-tests",
      "flaky-tests",
      "reliability-chaos",
    ]),
    define("advanced-testing", "高级测试技术", [
      "advanced-coverage-quality",
      "advanced-fuzz-testing",
      "advanced-model-based-testing",
      "advanced-mutation-testing",
      "advanced-property-testing",
      "property-fuzz-testing",
    ]),
    define("data-ai-testing", "数据与 AI 系统测试", [
      "advanced-ai-system-testing",
      "advanced-data-quality",
      "data-testing",
    ]),
    define("production-testing", "测试环境与生产验证", [
      "advanced-production-testing",
      "advanced-test-environments",
      "advanced-test-observability",
      "production-testing",
    ]),
    define("quality-governance", "质量度量与治理", [
      "advanced-quality-incident-learning",
      "advanced-release-quality",
      "ci-quality-gates",
      "quality-leadership",
      "quality-metrics",
    ]),
  ],
  platform: [
    define("linux-automation", "Linux 与系统自动化", [
      "linux-networking",
      "linux-processes",
      "linux-storage",
      "shell-automation",
    ]),
    define("containers", "容器与 OCI", ["containers-oci"]),
    define("kubernetes", "Kubernetes", [
      "advanced-kubernetes-operators",
      "advanced-kubernetes-scheduling",
      "kubernetes",
      "kubernetes-networking",
      "kubernetes-scheduling",
      "kubernetes-storage-security",
      "kubernetes-workloads",
    ]),
    define("cloud-network", "云架构与网络", [
      "advanced-cloud-networking",
      "cloud-architecture",
      "edge-networking",
    ]),
    define("delivery-iac", "持续交付、GitOps 与 IaC", [
      "advanced-gitops",
      "ci-cd",
      "delivery",
      "git-delivery",
      "gitops-packaging",
      "terraform-iac",
    ]),
    define("sre-reliability", "SRE 与可靠性工程", [
      "advanced-capacity-engineering",
      "advanced-disaster-recovery",
      "advanced-incident-command",
      "advanced-sre-slo",
      "incident-management",
      "incident-resilience",
      "sre",
    ]),
    define("observability", "可观测性", [
      "advanced-ebpf-observability",
      "advanced-opentelemetry",
      "observability",
      "opentelemetry",
      "prometheus-observability",
    ]),
    define("platform-security", "平台与供应链安全", [
      "advanced-cloud-iam",
      "advanced-secrets-platform",
      "advanced-supply-chain-security",
    ]),
    define("platform-engineering", "平台工程", [
      "advanced-edge-platform",
      "advanced-internal-platform",
      "platform-engineering",
    ]),
    define("service-mesh", "服务网格", ["advanced-service-mesh"]),
    define("serverless-platform", "Serverless 平台", [
      "advanced-serverless-platform",
    ]),
    define("data-platform", "数据平台可靠性", [
      "advanced-database-reliability",
    ]),
    define("compute-platform", "GPU 与计算平台", ["advanced-gpu-platform"]),
    define("finops", "FinOps", ["advanced-finops"]),
  ],
  "llm-algorithm": [
    define("ml-foundations", "机器学习基础", [
      "classical-ml",
      "deep-learning",
      "llm-algorithm",
      "ml-foundations",
    ]),
    define("model-architecture", "Transformer 与模型架构", [
      "mixture-of-experts",
      "tokenization-generation",
      "transformers",
    ]),
    define("pretraining", "预训练与扩展规律", [
      "distributed-training",
      "long-context-learning",
      "scaling-laws",
    ]),
    define("post-training", "微调与后训练", [
      "advanced-post-training-systems",
      "post-training-data",
      "supervised-finetuning",
    ]),
    define("alignment-reasoning", "对齐与推理模型", [
      "advanced-reasoning-models",
      "alignment-preference",
      "reasoning-models",
    ]),
    define("data-retrieval", "数据、Embedding 与检索", [
      "data-corpus",
      "embeddings-retrieval",
    ]),
    define("multimodal-models", "多模态模型", ["multimodal-models"]),
    define("inference-optimization", "推理优化", [
      "advanced-disaggregated-serving",
      "advanced-kv-cache-systems",
      "advanced-llm-quantization",
      "advanced-moe-inference",
      "advanced-speculative-decoding",
      "advanced-structured-generation",
      "model-compression",
    ]),
    define("inference-serving", "推理服务与框架", [
      "advanced-distributed-inference",
      "advanced-inference-observability",
      "advanced-multimodal-serving",
      "advanced-serving-benchmarks",
      "advanced-sglang-runtime",
      "advanced-vllm-serving",
      "model-inference",
    ]),
    define("gpu-kernels", "GPU 算子与内核优化", [
      "advanced-attention-kernels",
      "advanced-cuda-kernels",
      "advanced-triton-kernels",
      "efficient-attention-kernels",
    ]),
    define("model-evaluation", "模型评估与可解释性", [
      "llm-evaluation",
      "mechanistic-interpretability",
    ]),
    define("model-families", "主流模型架构案例", [
      "advanced-deepseek-architecture",
      "advanced-longcat-model-systems",
      "advanced-qwen-model-systems",
    ]),
  ],
  "agent-evaluation": [
    define("evaluation-design", "评测任务与 Rubric", [
      "advanced-binary-rubrics",
      "evaluation-foundations",
      "task-specification-rubrics",
    ]),
    define("datasets-benchmarks", "评测集与 Benchmark", [
      "advanced-benchmark-governance",
      "advanced-eval-data-flywheel",
      "benchmark-governance",
      "evaluation-datasets",
    ]),
    define("trajectory-evaluation", "轨迹与过程评测", [
      "advanced-response-trajectory",
      "advanced-trajectory-evaluation",
      "production-trace-evaluation",
      "trajectory-evaluation",
    ]),
    define("judge-human", "LLM Judge 与人工评测", [
      "advanced-llm-judge-calibration",
      "human-evaluation",
      "llm-as-judge",
      "statistical-analysis",
    ]),
    define("online-regression", "在线评测与回归门禁", [
      "advanced-production-shadow-eval",
      "online-evaluation",
      "regression-gates",
    ]),
    define("safety-robustness", "安全与鲁棒性评测", [
      "advanced-agent-safety-eval",
      "agent-security-evaluation",
      "robustness-evaluation",
      "safety-red-teaming",
    ]),
    define("long-horizon", "长程与多轮任务评测", [
      "advanced-long-horizon-context-eval",
      "advanced-task-trace-tuples",
      "multi-turn-evaluation",
    ]),
    define("coding-tool-evaluation", "Coding Agent 与工具评测", [
      "advanced-adversarial-tools",
      "advanced-coding-agent-eval",
      "advanced-skill-evaluation",
      "advanced-swe-bench-eval",
      "advanced-terminal-agent-eval",
      "tool-use-evaluation",
    ]),
    define("search-browser-rag", "搜索、浏览器与 RAG 评测", [
      "advanced-browser-agent-eval",
      "advanced-search-agent-eval",
      "rag-agent-evaluation",
    ]),
    define("agent-capability-evaluation", "记忆与多 Agent 评测", [
      "advanced-memory-evaluation",
      "advanced-multi-agent-eval",
    ]),
    define("efficiency-evaluation", "成本与延迟评测", [
      "advanced-cost-latency-eval",
      "cost-latency-evaluation",
    ]),
    define("evaluation-platform", "评测平台与失败分析", [
      "evaluation-platforms",
      "failure-taxonomy",
    ]),
  ],
  "agent-engineering": [
    define("agent-foundations", "Agent 基础与规划", [
      "advanced-agent-loop-engineering",
      "advanced-agent-runtime-engineering",
      "agent-fundamentals",
      "planning-execution",
    ]),
    define("context-engineering", "上下文与 Prompt 工程", [
      "advanced-context-engineering",
      "prompt-context",
    ]),
    define("tool-engineering", "工具、协议与 MCP", [
      "advanced-skills-plugins",
      "advanced-tool-protocols-modern",
      "tool-protocols",
    ]),
    define("memory-state", "记忆、状态与持久化", [
      "advanced-agent-memory-modern",
      "advanced-durable-agents",
      "agent-memory-systems",
      "agent-state-management",
      "durable-agent-execution",
    ]),
    define("multi-agent", "多 Agent 编排", [
      "advanced-subagent-orchestration",
      "multi-agent-systems",
    ]),
    define("rag", "RAG 与知识工程", ["rag"]),
    define("agent-safety", "安全、沙箱与人工审批", [
      "advanced-human-approval",
      "advanced-sandbox-execution",
      "ai-safety-governance",
      "human-in-the-loop",
      "sandbox-permissions",
    ]),
    define("coding-agents", "Coding Agent 工程", [
      "advanced-browser-agents",
      "advanced-claude-code-patterns",
      "advanced-codex-patterns",
      "advanced-coding-agent-loop",
      "advanced-opencode-pi",
      "advanced-patch-workflows",
      "advanced-shell-tools",
    ]),
    define("agent-frameworks", "Agent 框架与 SDK", [
      "advanced-agent-graph-engineering",
      "advanced-langgraph-runtime",
      "advanced-vercel-ai-sdk",
    ]),
    define("model-integration", "模型接入、路由与推理", [
      "advanced-model-routing-agents",
      "llm-serving",
      "model-routing",
    ]),
    define("agent-production", "生产平台与可观测性", [
      "advanced-agent-observability",
      "advanced-agent-tracing",
      "advanced-production-agent-platform",
      "agent-observability",
      "ai-production",
      "mlops-llmops",
    ]),
    define("agent-product-reliability", "产品体验、成本与可靠性", [
      "agent-cost-performance",
      "agent-product-ux",
      "agent-reliability",
    ]),
  ],
};

const canonicalByTrack = new Map();
const sourceByTrack = new Map();

for (const [trackId, topics] of Object.entries(topicTaxonomy)) {
  const canonical = new Map();
  const sources = new Map();
  for (const topic of topics) {
    if (canonical.has(topic.id))
      throw new Error(`${trackId}: duplicate canonical topic ${topic.id}`);
    canonical.set(topic.id, topic);
    for (const sourceId of topic.sourceIds) {
      if (sources.has(sourceId))
        throw new Error(`${trackId}: source topic ${sourceId} is mapped twice`);
      sources.set(sourceId, topic);
    }
  }
  canonicalByTrack.set(trackId, canonical);
  sourceByTrack.set(trackId, sources);
}

export function normalizeTopic(question) {
  const topic = sourceByTrack.get(question.trackId)?.get(question.topicId);
  return topic
    ? { ...question, topicId: topic.id, topicLabel: topic.label }
    : question;
}

export function getCanonicalTopic(trackId, topicId) {
  return canonicalByTrack.get(trackId)?.get(topicId);
}
