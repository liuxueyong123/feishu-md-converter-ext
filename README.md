# Lark Markdown Repair

一个本地运行的 Chrome / Edge Manifest V3 扩展，用于修复 Markdown 导入国际版 Lark 文档后的两类格式问题：将表格第一行加粗并添加浅灰底色，并把 Mermaid 代码块迁移为 Lark 原生“文本绘图”组件且设置为“仅展示图表”。

升级扩展后请在 Lark 文档标签页刷新一次，再从扩展管理页重新加载 `dist/`，确保旧版页面脚本被清理。

## 快速开始

1. 安装 Node.js 22.22.2、24.15.0 或更高的受支持版本。
2. 安装 pnpm 11，然后在仓库根目录执行 `pnpm install --frozen-lockfile` 和 `pnpm build`。
3. 打开 `chrome://extensions` 或 `edge://extensions`，启用开发者模式并选择“加载已解压的扩展程序”。
4. 选择本项目生成的 `dist/` 目录。
5. 打开有编辑权限的国际版 Lark `docx` 或 `wiki` 文档，点击扩展图标。

## 使用方式

点击扩展图标只打开面板，不会立即读取文档；点击“开始扫描”后，扩展才会扫描整篇虚拟滚动文档并显示可勾选的修复项。点击候选项正文可将文档滚动到对应区块；点击左侧复选框可调整待处理范围。确认候选项后点击“修复选中项”：

- 表格：从 Lark 原生记录读取完整第一行，在同一事务中加粗文字并为所有标题单元格设置浅灰底色 `rgba(245,246,247,0.9)`，包括空单元格；不依赖表头 DOM 是否已加载，结果可持久保存。
- Mermaid：识别 Plain Text 代码块中的 `%%{init` 或常见 Mermaid 图类型关键字；从 Lark 区块记录读取完整源码，避免长代码块的 DOM 虚拟化造成内容缺失；先批量创建文本绘图组件，再统一写入，对尚未加载的组件滚动到可视区重试并校验；已写入的组件先等待渲染，超时后仅再写入一轮，避免频繁重写打断慢图表，成功后才删除原代码块。
- 普通代码块：保持不变。
- 无法渲染的 Mermaid：删除本轮新建组件并保留原代码块，面板会报告需要手动检查的项目。

首次修复 Mermaid 时，浏览器会请求访问 `https://*.larksuitepkg.com/*`。这是文本绘图组件实际运行的 Lark 官方 iframe 域名；只修复表格时不会请求该权限。

## 权限与隐私

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 仅在用户点击扩展后临时访问当前 Lark 文档标签页 |
| `scripting` | 注入扫描、面板和本地修复逻辑 |
| 可选的 `https://*.larksuitepkg.com/*` | 仅在用户选择 Mermaid 修复时写入并校验文本绘图 iframe |

扩展不使用 Lark OpenAPI，不读取或保存登录凭据，不发送遥测，也不把文档内容传到第三方服务。所有处理都在当前浏览器标签页中完成。

## 失败与恢复

- 扫描和处理都可随时停止；未验证成功的 Mermaid 源代码不会被删除。
- 新建组件写入或校验失败时，扩展会尝试删除本轮组件及配套空文本块。
- 如果 Lark 保存或网络状态异常，请使用 Lark 的撤销或版本历史恢复，并重新扫描。
- 面板显示部分成功时，只需处理剩余候选项，不必重复迁移成功项目。

## 开发命令

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 构建可加载的 `dist/` 扩展目录 |
| `pnpm test` | 运行 Vitest 单元测试 |
| `pnpm test:watch` | 监听模式运行测试 |
| `pnpm typecheck` | 运行 TypeScript 严格类型检查 |

## 架构与兼容性

内容脚本负责虚拟滚动扫描和 Shadow DOM 面板；主页面脚本调用 Lark 编辑器自身的本地事务；后台脚本只负责按需注入和跨域文本绘图 iframe。详细取舍见 [ADR-0001](docs/decisions/0001-client-side-lark-automation.md)。

Lark 没有为这些操作提供稳定的公开浏览器扩展接口，因此组件类型 ID、DOM 结构或客户端事务发生变化时可能需要适配。当前版本一次最多处理 100 个 Mermaid 候选项，每段 Mermaid 源码上限为 1,000,000 个 UTF-16 代码单元。

## 官方参考

- [Chrome `activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome `scripting`](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Chrome 可选权限](https://developer.chrome.com/docs/extensions/reference/api/permissions)
