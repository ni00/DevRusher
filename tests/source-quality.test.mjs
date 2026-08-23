import assert from "node:assert/strict";
import test from "node:test";
import {
  getCoreSpecificityRisk,
  getPromptCompletenessRisk,
  getPromptPremiseRisk,
  hasClientTechnologyCoreRelevance,
  hasKotlinMultiplatformCoreRelevance,
} from "../scripts/content/source-quality.mjs";

test("rejects source headings and fragments", () => {
  assert.equal(
    getPromptCompletenessRisk("设计中的关键考量"),
    "contextless-source-heading"
  );
  assert.equal(
    getPromptCompletenessRisk("定义数字列表"),
    "incomplete-source-command"
  );
  assert.equal(
    getPromptCompletenessRisk("是否表达了歉意？"),
    "contextless-binary-rubric"
  );
});

test("rejects unframed error titles and malformed wording", () => {
  assert.equal(
    getPromptCompletenessRisk("无法从 transformers 导入 pipeline"),
    "unframed-error-title"
  );
  assert.equal(
    getPromptCompletenessRisk("请说说说你对 Monorepo 的理解"),
    "malformed-question-wording"
  );
  assert.equal(
    getPromptCompletenessRisk("追问 6：模型幻觉如何处理？"),
    "detached-follow-up-question"
  );
  assert.equal(
    getPromptPremiseRisk("在分布式系统中，奇数如何解决脑裂问题？"),
    "mistranslated-quorum-question"
  );
});

test("keeps implementation trivia out of core collections", () => {
  assert.equal(
    getCoreSpecificityRisk(
      "FASTVM_SKIP_READY_CHECK=1 会让哪个 fixture token 失效？"
    ),
    "core-over-specific-implementation"
  );
  assert.equal(
    getCoreSpecificityRisk(
      "Kafka rebalance 为什么会导致 CommitFailedException，应如何避免？"
    ),
    undefined
  );
});

test("keeps KMP core questions focused on multiplatform mechanisms", () => {
  assert.equal(
    hasKotlinMultiplatformCoreRelevance(
      "commonMain 与 iosMain 的 source set 依赖关系如何设计？"
    ),
    true
  );
  assert.equal(
    hasKotlinMultiplatformCoreRelevance(
      "为什么 remember mutableStateOf 会触发 Compose 重组？"
    ),
    false
  );
});

test("keeps client framework core questions technology-specific", () => {
  assert.equal(
    hasClientTechnologyCoreRelevance(
      "electron",
      "Electron 的 main process 与 renderer process 如何隔离权限？"
    ),
    true
  );
  assert.equal(
    hasClientTechnologyCoreRelevance(
      "tauri",
      "为什么普通 Web 组件状态更新会触发重新渲染？"
    ),
    false
  );
  assert.equal(
    hasClientTechnologyCoreRelevance(
      "uni-app-x",
      "uni-app x 的 UTS 为什么需要分别编译到 Kotlin、Swift 和 ArkTS？"
    ),
    true
  );
});

test("keeps complete basic and engineering questions", () => {
  assert.equal(getPromptCompletenessRisk("什么是 MVCC？"), undefined);
  assert.equal(
    getPromptCompletenessRisk(
      "设计 Agent Loop 时，如何处理终止条件、取消和工具重试？"
    ),
    undefined
  );
});
