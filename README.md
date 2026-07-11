# AutoCV Go · 网申填充助手

一个面向中文网申场景的本地优先 Chrome / Edge 扩展。保存一次简历资料后，扩展会识别招聘页面中的空字段，按规则自动匹配并填写；规则无法确定时，可以选择使用自己的 OpenAI 兼容 API 仅完成字段映射。

## 为什么没有直接 fork Nanobrowser

Nanobrowser 是通用浏览器 Agent，适合开放式网页任务，但网申填充更需要稳定、可解释、低成本的固定流程。AutoCV Go 使用以下顺序：

1. 本地简历资料库；
2. 确定性的中文字段规则；
3. 重复经历按页面出现顺序匹配；
4. 仅把歧义字段名称交给 AI 判断；
5. 在网页本地写入具体值。

这种方式不会为了姓名、邮箱等明确字段反复消耗 Token，也不会把简历具体内容发送给 AI。

## 当前功能

- 基本信息、教育、工作、实习、项目、技能、语言、奖项和自定义字段；
- 扫描常规 input、textarea、select、contenteditable；
- 识别常见中文标签及 Ant Design / Element UI 表单容器；
- 多段教育、工作、实习和项目经历按字段出现顺序匹配；
- 默认只填写空字段，不覆盖用户已经填写的内容；
- 疑似网申页面可自动扫描和填写；
- DeepSeek、OpenAI 及其他 `/chat/completions` 兼容接口作为可选映射兜底；
- 匹配预览、置信度、失败原因和手动处理提示；
- 永远不会自动点击“提交”“投递”等按钮。

## 本地安装

```powershell
cd C:\Users\lin\Desktop\Github_Dev\AutoCV-Go
pnpm.cmd install
pnpm.cmd build
```

然后在 Chrome 或 Edge 中：

1. 打开 `chrome://extensions` 或 `edge://extensions`；
2. 开启“开发者模式”；
3. 点击“加载已解压的扩展程序”；
4. 选择 `C:\Users\lin\Desktop\Github_Dev\AutoCV-Go\.output\chrome-mv3`；
5. 把 AutoCV Go 固定到工具栏，点击图标打开右侧栏。

修改代码后重新执行 `pnpm.cmd build`，再到扩展管理页点击“重新加载”。开发模式可运行 `pnpm.cmd dev`。

## 使用方式

1. 在“简历资料”中录入并保存信息；
2. 在“设置”中决定是否进入网申页面后自动填写；
3. 打开招聘页面，刷新一次；
4. 自动模式会填写高置信度空字段；也可以在“扫描填充”中点击“扫描并填写空字段”；
5. 查看未匹配和失败字段，人工补充后自行提交。

### DeepSeek API 示例

- 接口地址：`https://api.deepseek.com/chat/completions`
- 模型：`deepseek-chat`
- API Key：使用单独创建并设置额度限制的 Key

API 请求只包含网页字段描述和简历字段键，例如“项目名称应对应 projects.1.name”，不会包含姓名、电话、项目正文等实际值。具体值始终由扩展在本地解析并写入网页。

## 已知边界

- 文件上传和验证码必须手动完成；
- 部分自绘下拉框、日期组件、跨域 iframe 和 Shadow DOM 需要站点适配器；
- 页面动态添加经历后，建议重新扫描；
- 不建议在银行、医疗等非求职敏感页面开启自动模式；
- API Key 存储在浏览器本地扩展存储中，不会同步到本项目服务器，但仍应使用独立限额 Key。

## 验证

```powershell
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

测试页位于 `test-fixtures/job-form.html`，覆盖中文基本信息和两段重复项目经历。

## 目录

```text
entrypoints/
  background.ts          侧栏启动
  content.ts             页面扫描与写入
  sidepanel/             React 侧栏工作台
lib/
  matcher.ts             本地字段匹配
  ai.ts                  OpenAI 兼容字段映射
  storage.ts             本地存储
  types.ts               数据结构
test-fixtures/            浏览器验证页面
```
