# Content workspace

DevRusher 只提交 `public/content`
中可直接部署的最终题包。原始仓库、文章快照、导入结果和报告均为本地过程数据，不进入 Git。

## Git 边界

| 目录                           | 是否提交 | 用途                   |
| ------------------------------ | -------- | ---------------------- |
| `public/content/manifest.json` | 是       | 内容版本、题量和校验和 |
| `public/content/packs/`        | 是       | 标准题目及真实出现记录 |
| `content/inbox/`               | 否       | 原始仓库与文章材料     |
| `content/work/`                | 否       | 导入、分类和去重结果   |
| `content/reports/`             | 否       | 构建与质量报告         |
| `content/seeds/`               | 否       | 待核验的历史材料       |
| `content/curricula/`           | 否       | 已停用的旧模板生成定义 |

全新 clone 可以运行 `pnpm content check`
校验最终题包。重新生成题包需要维护者本地的来源工作区。

## 数据模型

- `Question` 是语义去重后的标准题目。
- `occurrences` 保存原始问法、来源 URL、来源类型和时间。
- `collectionIds` 维护精选题集；精选题集保持可完成。
- `firsthand` 表示第一人称面经，`curated-repository`
  表示有明确维护者和历史记录的社区题库。
- `official-documentation`、`engineering-blog`、`research-paper` 和 `benchmark`
  分别表示官方文档、技术团队文章、原始论文和可复现评测材料；这些类型只在内部用于来源与选题排序。

同一道题在多个来源出现时只发布一次，同时保留多条出现记录。

当前每个方向精选 100 题。候选题按学习收益、可迁移性、技术深度和独立完整性统一评审，再按知识主题组织骨架；题型、难度和主题上限用于避免单一内容占比过高。最终精选必须全部通过严格评审，评审版本、最低分和平均分写入题包清单；完整题库用于扩展技术广度。

当前版本保留仍有学习价值的原题，并持续加入第一手、多来源、官方技术材料和完整的工程问题；只删除错分、过时内容、标题片段、上下文缺失题及低信息量重复题。每个方向的最终题量均不超过 1,000 道。

本地 `content/inbox/manual-curation.json`
保存本次九个方向的保留题目 ID，防止重新导入时恢复已淘汰题；它属于过程数据，不进入 Git，也不构成发布数量门禁。`pnpm content curate`
可按来源强度、题目完整性、方向相关性、时效性和主题均衡重新生成这份选择结果。

当前最终题量：

| 方向           | 题量 |
| -------------- | ---: |
| 计算机基础     |  880 |
| 前端工程       | 1000 |
| 后端工程       |  920 |
| 客户端与移动端 | 1000 |
| 质量与测试     |  925 |
| 平台与运维     |  910 |
| 大模型算法     |  915 |
| Agent 评测     |  840 |
| Agent 工程     |  890 |

## 发布流程

1. 将确认过的仓库或文章材料放入 `content/inbox`，保留原始 URL、标题和日期。
2. 运行
   `pnpm content import`。导入器只做格式整理、分类和语义去重，不增加条件、场景或追问。
3. 运行
   `pnpm content translate`。纯英文题会等义翻译为简体中文；题目 ID 不变，技术名词和代码保留英文，`occurrences.originalPrompt`
   继续保存来源原文。
4. 对未成题的真实技术社区标题运行
   `pnpm content review sources`；对本地官方仓库章节运行
   `pnpm content extract`，再运行 `pnpm content review derived --finalize`
   淘汰端点、默认值、CLI 开关和测试夹具等查表题。这些步骤都只允许整理或提炼来源中已有的事实与约束，并保存断点。
5. 来源工作区发生大规模变化时，按顺序运行
   `pnpm content curate --clear`、`pnpm content import`、`pnpm content curate`、`pnpm content import`
   重新生成并应用选择结果。普通重建无需重复此步骤。
6. 运行 `pnpm content review core` 评审精选候选，再运行 `pnpm content import`
   应用结果；用 `pnpm content review core --check` 确认没有待评审候选。
7. 运行 `pnpm content build`
   统一题干为大陆简体中文并生成版本化题包；来源原文仍保留在
   `occurrences.originalPrompt`，不修改其繁简和措辞。
8. 运行
   `pnpm content check`，验证来源、结构、校验和、重复项、错误前提和已知生成模板。
9. 只提交当前版本的 `public/content/manifest.json` 与 `public/content/packs/`。

发布门禁检查来源、字段结构、校验和、简体题干、重复题、错误前提、上下文碎片和已知生成模板。

## 临时输入

JSON 输入至少应包含题目和来源信息，例如：

```json
{
  "prompt": "需要导入的原始问题",
  "trackId": "backend",
  "category": "Redis",
  "sourceUrl": "https://example.com/original-interview"
}
```
