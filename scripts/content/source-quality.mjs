const quotedValue = /「[^」]{1,160}」/g;
const codeValue = /`[^`]{1,120}`/g;
const numberValue = /\b\d+(?:\.\d+)?(?:%|ms|s|MB|GB|QPS|TPS)?\b/gi;

const generatedTemplatePatterns = [
  /^请解释「.+」的核心机制：它解决什么问题、依赖哪些前提，又在哪些边界下不成立？$/,
  /^如果要向新成员讲清「.+」，你会从哪些关键对象、状态变化和约束开始？$/,
  /^在「.+」的场景中，你会如何判断是否采用「.+」？请给出约束、方案和取舍。$/,
  /^围绕「.+」分析一次「.+」故障：你会优先排除哪些假设，哪些数据能够证伪？$/,
  /^你会如何把「.+」封装进「.+」，既保留可替换性，又避免过度抽象？$/,
  /^为「.+」引入「.+」前，你会先收集哪些事实，并如何设计一个低风险验证？$/,
  /^将「.+」用于「.+」后，你会收集哪些静态检查、运行时信号或审计证据，来判断实现是否持续可信？$/,
  /^「.+」上线后，如何用可观测数据验证「.+」带来的收益，而不是只看平均值？$/,
  /^以「.+」为目标，说明如何把「.+」转化为清晰的接口、规则或流程，并给出关键权衡。$/,
  /^请从「.+」的视角分析「.+」：需要哪些输入或证据，可以得出什么结论，又必须保留哪些约束？$/,
  /^请用伪代码、配置、测试用例或实验步骤，展示「.+」中如何正确落实「.+」，并标出边界与失败处理。$/,
  /^请设计一个能稳定复现「.+」的最小实验，再给出修正方案，以验证「.+」的关键边界。$/,
];

export function isKnownGeneratedTemplate(prompt) {
  return generatedTemplatePatterns.some(pattern => pattern.test(prompt.trim()));
}

export function getPromptScienceRisk(prompt) {
  if (/升级后破坏既有调用方/.test(prompt)) {
    return "unsupported-causal-fixture";
  }
  if (/资源占用随规模非线性增长/.test(prompt)) {
    return "unquantified-scaling-claim";
  }
  if (/成为常态风险/.test(prompt)) {
    return "unqualified-frequency-claim";
  }
  if (/全线崩溃/.test(prompt)) {
    return "unqualified-collapse-claim";
  }
  if (
    /^针对「.+」可能引发的「.+」，你会设置什么容量基线、告警阈值和自动化处置？$/.test(
      prompt
    )
  ) {
    return "unverified-operational-causality";
  }
  if (
    /^「.+」上线后，如何用可观测数据验证「.+」带来的收益，而不是只看平均值？$/.test(
      prompt
    )
  ) {
    return "category-error-in-benefit-measurement";
  }
  return undefined;
}

export function getPromptPremiseRisk(prompt) {
  if (
    /HTTP\/1\.2|\bhttps:abc\.com\b/i.test(prompt) ||
    /\bsetTimeOut\b/.test(prompt)
  ) {
    return "known-invalid-fixture";
  }
  if (/\/\/\s*\.\.\.(?:具体数据|省略)/.test(prompt)) {
    return "incomplete-fixture";
  }
  if (/奇数如何解决脑裂/.test(prompt)) {
    return "mistranslated-quorum-question";
  }
  if (
    /(?:为什么|请证明|请解释).{0,80}(?:一定|必然|永远|完全不会|绝不会)/.test(
      prompt
    )
  ) {
    return "unqualified-absolute-premise";
  }
  return undefined;
}

export function getPromptContextRisk(prompt) {
  if (/\*\*|^(?:answer|答案)\s*[:：]/i.test(prompt)) {
    return "unparsed-source-markup";
  }
  if (/对吧[？?]?$/.test(prompt)) {
    return "context-dependent-rhetorical-question";
  }
  if (/^(?:why|how|what)\s+(?:is|does)\s+(?:this|that|it)\b/i.test(prompt)) {
    return "context-dependent-pronoun-question";
  }
  if (
    /(?:last|previous|above|below|following) question|(?:this|the following) (?:table|diagram|image|figure|code|snippet|design)|(?:下|上|前)(?:一|道)?题|(?:如下|上面|下面)的?(?:代码|表格|图片|架构图)/i.test(
      prompt
    )
  ) {
    return "missing-source-context";
  }
  return undefined;
}

export function getPromptCompletenessRisk(prompt) {
  const value = String(prompt).trim();
  if (/^追问\s*\d+\s*[:：]/.test(value)) {
    return "detached-follow-up-question";
  }
  if (
    /^[✅☑️⚠️⭐🔹🔸💡📌🎯🚀]/u.test(value) ||
    /^L\d+（[^）]+）[-—]/i.test(value)
  ) {
    return "source-heading-or-decoration";
  }
  if (
    /^(?:为什么这层重要|为什么这一步重要|设计中的关键考量|关键考量|关键考虑|实际答案|参考答案|面试提示|核心思想|解决方案|工作原理|基本概念|背景|目标|步骤|要点|注意事项|设计挑战与解决方案)[？?。！!：:]*$/.test(
      value
    )
  ) {
    return "contextless-source-heading";
  }
  if (
    /^(?:解释以下内容|定义所需的模式键|定义请求体模式|定义数据字典|定义数字列表)[。.]?$/.test(
      value
    )
  ) {
    return "incomplete-source-command";
  }
  if (/^(?:是否|有没有|能否|有无).{0,12}[？?]$/.test(value)) {
    return "contextless-binary-rubric";
  }
  if (/^(?:你)?(?:对)?.{0,20}(?:了解过|知道吗|熟悉吗)[？?]$/.test(value)) {
    return "vague-familiarity-question";
  }
  if (/^请说说说/.test(value) || /^请解译/.test(value)) {
    return "malformed-question-wording";
  }
  if (
    !/[？?]/.test(value) &&
    /^(?:无法|找不到|只能|不要|使用.+时无法|在.+中无法)/.test(value)
  ) {
    return "unframed-error-title";
  }
  if (/^为什么\s*2026\s*要重写这张版图/.test(value)) {
    return "source-article-heading";
  }
  if (
    !/[？?]/.test(value) &&
    value.length < 16 &&
    /^(?:解释|定义|声明|初始化|导入|打印|返回|创建|设置|获取|实现|设计|展示|列出)/.test(
      value
    )
  ) {
    return "underspecified-short-command";
  }
  if (/[:：]$/.test(value) && !/[？?]/.test(value)) {
    return "dangling-source-fragment";
  }
  return undefined;
}

export function getCoreSpecificityRisk(prompt) {
  if (
    /\bfixture\b|不透明.{0,20}token|控制面冒烟|\b[A-Z][A-Z0-9]*_[A-Z0-9_]{3,}\b|`?--[a-z][\w-]+|\bresults\.json\b|(?:活动|Trace)\s*[ST]\d\b|\bcheck-in\b|信息披露策略|Skill 安全为什么是一个被低估的问题|KMM 项目报错.{0,30}Expected class has no actual declaration/i.test(
      String(prompt)
    )
  ) {
    return "core-over-specific-implementation";
  }
  return undefined;
}

export function hasKotlinMultiplatformCoreRelevance(prompt) {
  return /kotlin.?multiplatform|\bkmp\b|\bkmm\b|compose.?multiplatform|kotlin\/native|\bcommonMain\b|\bcommonTest\b|\b(?:ios|apple|android|jvm|native)Main\b|source set|源集|\bexpect\b|\bactual\b|\bcinterop\b|Kotlin.{0,40}Swift|Swift.{0,40}Kotlin|sharedLogic|shared module|shared 模块|共享逻辑|共享模块|common code|平台特定.{0,20}(?:API|实现|代码)|多平台/i.test(
    String(prompt)
  );
}

export function hasClientTechnologyCoreRelevance(topicId, prompt) {
  const value = String(prompt);
  const patterns = {
    electron:
      /electron|main process|renderer process|preload|contextIsolation|ipcMain|ipcRenderer|BrowserWindow|webContents|utilityProcess|asar/i,
    lynx: /lynx|reactlynx|rspeedy|primjs|lynx engine|background thread/i,
    qt: /(?:^|\W)qt(?:\W|$)|qml|qt quick|QObject|signal.{0,8}slot|信号.{0,8}槽|moc|qpa/i,
    tauri:
      /tauri|src-tauri|Rust command|system webview|invoke\(|capabilit|permission|sidecar|\bwry\b|\btao\b/i,
    "uni-app-x": /uni-?app(?:\s*x)?|uniapp(?:\s*x)?|\buts\b|uvue|原生渲染引擎/i,
  };
  return patterns[topicId]?.test(value) ?? false;
}

export function getPromptSkeleton(prompt) {
  return String(prompt)
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(codeValue, "`…`")
    .replace(quotedValue, "「…」")
    .replace(numberValue, "#")
    .replace(/[a-z][a-z0-9_.+\-/]{2,}/gi, "TECH")
    .replace(/\s+/g, " ");
}

export function getSkeletonConcentration(questions) {
  const counts = new Map();
  for (const question of questions) {
    const skeleton = getPromptSkeleton(question.prompt);
    counts.set(skeleton, (counts.get(skeleton) ?? 0) + 1);
  }

  const repeatedQuestions = [...counts.values()]
    .filter(count => count >= 10)
    .reduce((sum, count) => sum + count, 0);
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([skeleton, count]) => ({ skeleton, count }));

  return {
    uniqueSkeletons: counts.size,
    repeatedQuestions,
    repeatedRatio: questions.length ? repeatedQuestions / questions.length : 0,
    top,
  };
}
