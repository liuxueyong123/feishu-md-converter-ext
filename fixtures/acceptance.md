# Lark Markdown Repair 验收文档

## 普通表格

| 身份 | 生命周期 | 用途 |
| --- | --- | --- |
| 生成所有者 | 输入框或 Plan 卡片存在期间 | 隔离同时存在的生成入口 |
| generation_session_id | 一次正式提交前 | 串联 Picker 与最终提交 |

## Init Mermaid

```mermaid
%%{init: {"theme":"base","flowchart":{"htmlLabels":false,"padding":20},"themeVariables":{"fontFamily":"PingFang SC, Microsoft YaHei, Noto Sans CJK SC, Inter, sans-serif"}}}%%
flowchart LR
    A[扫描文档] --> B{发现候选项}
    B -->|表格| C[加粗标题行]
    B -->|Mermaid| D[创建文本绘图]
```

## 关键字 Mermaid

```mermaid
sequenceDiagram
    participant U as 用户
    participant E as 插件
    participant L as Lark
    U->>E: 开始处理
    E->>L: 创建文本绘图
    L-->>E: 渲染成功
```

## 无效 Mermaid

```mermaid
flowchart LR
    A[缺少结束括号 --> B
```

## 普通代码块

```typescript
const chartType = "flowchart";
console.log(chartType);
```
