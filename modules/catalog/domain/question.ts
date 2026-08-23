export const trackIds = [
  "fundamentals",
  "frontend",
  "backend",
  "mobile",
  "quality",
  "platform",
  "llm-algorithm",
  "agent-evaluation",
  "agent-engineering",
] as const;

export type TrackId = (typeof trackIds)[number];
export const difficultyLevels = [1, 2, 3, 4, 5] as const;
export type Difficulty = (typeof difficultyLevels)[number];
export const questionTypes = [
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
] as const;
export type QuestionType = (typeof questionTypes)[number];

export const questionSourceKinds = [
  "firsthand",
  "curated-repository",
  "technical-community",
  "official-documentation",
  "engineering-blog",
  "research-paper",
  "benchmark",
] as const;
export type QuestionSourceKind = (typeof questionSourceKinds)[number];

export interface QuestionOccurrence {
  id: string;
  sourceId: string;
  sourceKind: QuestionSourceKind;
  sourceTitle: string;
  sourceUrl: string;
  originalPrompt: string;
  publishedAt?: string;
}

export interface Question {
  id: string;
  trackId: TrackId;
  topicId: string;
  topicLabel: string;
  prompt: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  tags: string[];
  collectionIds: string[];
  occurrences: QuestionOccurrence[];
  collectedAt?: string;
}

export function isCoreQuestion(question: Question): boolean {
  return question.collectionIds.some(collectionId =>
    collectionId.endsWith("-core")
  );
}

export interface TrackDefinition {
  id: TrackId;
  label: string;
  shortLabel: string;
  description: string;
  topics: string[];
}

export const trackDefinitions: TrackDefinition[] = [
  {
    id: "fundamentals",
    label: "计算机通用基础",
    shortLabel: "通用基础",
    description: "算法、网络、操作系统、数据库与系统设计",
    topics: ["算法", "网络", "操作系统", "数据库", "系统设计"],
  },
  {
    id: "frontend",
    label: "前端工程",
    shortLabel: "前端",
    description: "Web 基础、框架原理、工程化、性能与安全",
    topics: ["JavaScript", "CSS", "React", "Vue", "工程化"],
  },
  {
    id: "backend",
    label: "后端工程",
    shortLabel: "后端",
    description: "服务端语言、框架、存储、中间件与分布式系统",
    topics: ["服务端", "数据库", "缓存", "消息队列", "分布式"],
  },
  {
    id: "mobile",
    label: "客户端与移动端工程",
    shortLabel: "客户端",
    description: "移动端、KMP、现代跨端与桌面客户端工程",
    topics: [
      "Android / iOS",
      "KMP",
      "Lynx / uni-app x",
      "Electron / Tauri / Qt",
    ],
  },
  {
    id: "quality",
    label: "质量与测试",
    shortLabel: "测试",
    description: "测试开发、自动化、性能、稳定性与质量体系",
    topics: ["测试设计", "自动化", "性能测试", "质量工程"],
  },
  {
    id: "platform",
    label: "平台与运维",
    shortLabel: "运维",
    description: "DevOps、SRE、云原生、可观测性与平台工程",
    topics: ["Linux", "容器", "Kubernetes", "SRE", "平台工程"],
  },
  {
    id: "llm-algorithm",
    label: "大模型算法",
    shortLabel: "大模型算法",
    description: "机器学习、Transformer、训练、对齐与推理优化",
    topics: ["机器学习", "Transformer", "训练数据", "微调与对齐", "推理优化"],
  },
  {
    id: "agent-evaluation",
    label: "Agent 评测",
    shortLabel: "Agent 评测",
    description: "任务定义、轨迹评测、Judge、红队与回归门禁",
    topics: ["评测设计", "轨迹评测", "LLM Judge", "安全红队", "回归门禁"],
  },
  {
    id: "agent-engineering",
    label: "Agent 工程",
    shortLabel: "Agent 工程",
    description: "上下文、工具、记忆、编排、可靠性与生产交付",
    topics: ["Context", "Tool Use", "Memory", "Orchestration", "Reliability"],
  },
];

export function isTrackId(value: string): value is TrackId {
  return trackIds.includes(value as TrackId);
}

export function getTrackIdFromQuestionId(
  questionId: string
): TrackId | undefined {
  if (!questionId.startsWith("real:")) return undefined;
  const separator = questionId.indexOf(":", "real:".length);
  const candidate = questionId.slice(
    "real:".length,
    separator === -1 ? undefined : separator
  );
  return isTrackId(candidate) ? candidate : undefined;
}

export function getTrack(trackId: TrackId): TrackDefinition {
  const track = trackDefinitions.find(item => item.id === trackId);

  if (!track) {
    throw new Error(`Unknown track: ${trackId}`);
  }

  return track;
}

const difficultyLabels: Record<Difficulty, string> = {
  1: "入门",
  2: "基础",
  3: "进阶",
  4: "困难",
  5: "挑战",
};

export function getDifficultyLabel(difficulty: Difficulty): string {
  return difficultyLabels[difficulty];
}

const questionTypeLabels: Record<QuestionType, string> = {
  concept: "概念原理",
  comparison: "对比选型",
  coding: "编码实现",
  practical: "动手实践",
  scenario: "场景分析",
  "system-design": "系统设计",
  debugging: "故障排查",
  testing: "测试验证",
  operations: "生产运维",
  behavioral: "项目行为",
};

export function getQuestionTypeLabel(questionType: QuestionType): string {
  return questionTypeLabels[questionType];
}
