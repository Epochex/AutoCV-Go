# AutoCV Go · 网申填充助手

AutoCV Go 是一个面向中文网申场景的本地优先 Chrome / Edge 扩展。只需维护一份简历资料，即可扫描招聘页面、预览匹配结果，并按需填写表单。规则无法确定时，也可以接入自己的 OpenAI 兼容 API 完成字段映射或简历解析。

## 工作方式

AutoCV Go 按以下顺序处理网申表单：

1. 本地简历资料库；
2. 确定性的中文字段规则；
3. 重复经历按页面出现顺序匹配；
4. 仅把歧义字段名称交给 AI 判断；
5. 在网页本地写入具体值。

姓名、邮箱等明确字段优先使用本地规则，不会重复消耗 Token。表单字段映射不会发送简历具体值；只有在文件导入区主动勾选 AI 解析时，才会将提取出的简历全文发送到所配置的模型服务。

## 当前功能

- 基本信息、教育、工作、实习、项目、科研/论文、开源贡献、技能、语言、奖项和自定义字段；
- 扫描常规 input、textarea、select、contenteditable；
- 识别常见中文标签及 Ant Design / Element UI 表单容器；
- 多段教育、工作、实习和项目经历按字段出现顺序匹配；
- 默认只填写空字段，不覆盖用户已经填写的内容；
- 可选的疑似网申页面后台自动填写（默认关闭，需在设置中主动启用）；
- “仅扫描”结果会展示即将填写的具体内容，可临时编辑、单项应用或批量应用；
- 支持上传 PDF、Markdown 和 LaTeX 简历，先生成解析草稿，再选择替换或追加到资料编辑器；
- 按简历栏目标题自动分类，科研/论文、开源贡献和工程项目使用独立资料类型；未预设的 Markdown/TEX 栏目会保留为自定义内容；
- PDF 使用随扩展本地打包的 PDF.js worker 提取文本，MD/TEX 直接在本地读取；
- DeepSeek、OpenAI 及其他 `/chat/completions` 兼容接口作为可选字段映射或简历解析能力；
- 匹配预览、置信度、失败原因和手动处理提示；
- 永远不会自动点击“提交”“投递”等按钮。

## 本地安装

```powershell
git clone https://github.com/Epochex/AutoCV-Go.git
cd AutoCV-Go
pnpm.cmd install
pnpm.cmd build
```

然后在 Chrome 或 Edge 中：

1. 打开 `chrome://extensions` 或 `edge://extensions`；
2. 开启“开发者模式”；
3. 点击“加载已解压的扩展程序”；
4. 选择项目下的 `.output\chrome-mv3` 目录；
5. 把 AutoCV Go 固定到工具栏，点击图标打开右侧栏。

修改代码后重新执行 `pnpm.cmd build`，再到扩展管理页点击“重新加载”。开发模式可运行 `pnpm.cmd dev`。

## 使用方式

1. 在“简历资料”中录入并保存信息；
   - 也可以上传 `.pdf`、`.md` 或 `.tex`，审阅解析草稿后应用到编辑器；
2. 在“设置”中决定是否进入网申页面后自动填写；
3. 打开招聘页面，刷新一次；
4. 默认由你在“扫描填充”中扫描、审阅并应用；主动启用自动模式后，才会后台填写高置信度空字段；
5. 查看未匹配和失败字段，人工补充后自行提交。

### DeepSeek API 示例

- 接口地址：`https://api.deepseek.com/chat/completions`
- 模型：`deepseek-chat`
- API Key：使用单独创建并设置额度限制的 Key

普通表单映射请求只包含网页字段描述和简历字段键，例如“项目名称应对应 projects.1.name”，不会包含姓名、电话、项目正文等实际值。具体值始终由扩展在本地解析并写入网页。

如果在文件导入区勾选“使用 AI 精准解析”，提取出的简历全文会发送到你配置的模型服务。界面会在上传前明确提示；不勾选时使用本地规则，不发送文件内容。

## 已知边界

- 文件上传和验证码必须手动完成；
- 扫描图片版 PDF 不含可提取文本，需要换用 MD/TEX 或后续接入 OCR；
- 单个文件最大 12 MB；PDF 最多 20 页、最多提取 20 万字符；
- TEX 仅作为文本读取，不会编译、执行或跟随 `\input` / `\include`；
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
