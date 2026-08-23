# DevRusher

DevRusher 是面向程序员的本地优先面试学习工具，适合短期冲刺、长期刷题和模拟面试。

题库分为可完成的精选题集和可搜索的完整题库。当前收录
**8,280 道去重题目、8,517 条可追溯出现记录**，九个方向各有 100 道精选题。不再通过模板生成题目或重复改写凑数量，准确统计以[题包清单](./public/content/manifest.json)为准。

## 功能

- 在精选题集与完整真题库之间切换
- 按方向、主题、难度和题型筛选
- 收藏、学习状态、学习计划和间隔复习
- 单模型解析与三模型并行解析，结果自动缓存在本地
- 10 / 20 / 30 / 60 题练习和逐轮模拟面试
- PDF、Markdown、TXT 简历本地解析
- 本地保存学习进度、能力画像、面试记录和解析缓存
- 明暗主题与移动端适配

![DevRusher Agent 工程题库](./example/web.png)

![DevRusher 超能解析模式](./example/ai.png)

![DevRusher 设置与数据](./example/settings.png)

项目不提供登录或跨设备同步。API
Key 不会进入备份文件，学习数据默认只保存在当前浏览器。

## 技术栈

Node.js 26、pnpm 11.20、Next.js 16.3、React 19.2、TypeScript、Tailwind CSS
4、Vercel AI SDK 和 IndexedDB。

项目采用单体部署与模块化内核，题库、学习进度、AI、模拟面试和内容流水线各自维护边界。

## 本地开发

仅支持 Node.js 26。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

常用命令：

```bash
pnpm check # 格式、Lint、类型、测试和题包校验
pnpm fix   # 自动修复格式和 Lint
pnpm build # 生产构建
pnpm perf:check # 构建后检查首屏、题包和字体预算
```

Vercel 通过 `Dockerfile.vercel` 部署 Node.js 26 容器。首次连接时，在 Build and
Deployment 中将 Framework Preset 设为
`Services`；否则平台会忽略容器服务并回退到Node.js 24。

## 模型请求与隐私

开发环境通过本机同源代理转发跨域模型请求；生产环境由浏览器直连模型端点，因此端点需要支持 CORS 或提供同源网关。

模型请求不设置最大输出 Token 参数，由模型服务执行自身的原生上限。API
Key 只保存在当前浏览器，本地代理不记录密钥和模型内容。

## 题库维护

Git 只跟踪 `public/content`
中可直接部署的最终题包。原始仓库、文章快照、导入结果和报告存放在被 Git 忽略的
`content` 工作区中。

```bash
pnpm content import    # 导入并语义去重
pnpm content translate # 等义翻译英文题
pnpm content build     # 生成最终题包
pnpm content check     # 执行发布校验
```

每道发布题目必须保留至少一条来源记录。模型不能扩写题干、补充条件或冒充真实面试来源。

详细流程见[题库维护说明](./content/README.md)。

## License

MIT
