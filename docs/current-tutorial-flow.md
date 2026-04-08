# 当前教程渲染全流程

本文档说明当前项目里一篇教程从数据定义到最终页面渲染的完整链路，并覆盖两种入口：

- 静态教程页：`/mobx`、`/event-emitter`
- 远程教程页：`/[slug]/request`

当前实现的目标不是做营销页，而是保持 `Build your own react` 风格的编辑式教程体验：

- 左侧固定代码舞台，右侧文章区滚动
- 代码区始终是同一个面板实例，不切整块组件
- 步骤粒度细，每次滚动只引入少量代码变化
- 代码变化有 focus、mark、增删行动画
- 默认避免代码区内部纵向滚动

---

## 1. 核心文件分层

| 层级 | 文件 | 作用 |
|------|------|------|
| 教程内容 | `content/build-your-own-mobx.tutorial.js` | 定义教程 DSL：`meta`、`intro`、`baseCode`、`steps` |
| 教程内容 | `content/build-your-own-eventemitter.tutorial.js` | 另一篇教程的 DSL |
| 组装层 | `lib/tutorial-assembler.js` | 把 `baseCode + patches` 组装成每一步的完整高亮代码 |
| 注册层 | `lib/tutorial-registry.js` | 维护 `slug -> tutorial` 的映射 |
| 传输层 | `lib/tutorial-payload.js` | 把教程 DSL 转成前端可直接消费的 payload |
| API 层 | `app/api/tutorials/[slug]/route.js` | 返回某个教程的 mock JSON |
| 静态页面 | `app/mobx/page.jsx` | 不走额外请求，直接在服务端组装并渲染 |
| 静态页面 | `app/event-emitter/page.jsx` | 同上 |
| 远程页面 | `app/[slug]/request/page.jsx` | 通用远程教程入口，负责校验 slug 和输出页面壳 |
| 客户端请求层 | `components/remote-tutorial-page.jsx` | 在浏览器请求 `/api/tutorials/${slug}` 并处理加载/失败/成功态 |
| 通用渲染器 | `components/tutorial-scrolly-demo.jsx` | 渲染左右分栏、滚动选中、CodeHike 动画 |
| 样式层 | `app/globals.css` | 布局、排版、代码区和请求态样式 |

---

## 2. 教程源数据长什么样

每篇教程都写成结构化数据，不直接把页面逻辑和内容混在一起。

基础结构：

```js
export const someTutorial = {
  meta: {
    title: "Build your own X",
    lang: "js",
    fileName: "x.js",
    description: "..."
  },
  intro: {
    paragraphs: ["...", "..."]
  },
  baseCode: `...`,
  steps: [
    {
      id: "step-id",
      eyebrow: "Core",
      title: "...",
      lead: "...",
      paragraphs: ["...", "..."],
      patches: [{ find: "...", replace: "..." }],
      focus: { find: "..." },
      marks: [{ find: "...", color: "rgb(...)" }]
    }
  ]
}
```

这里的关键不是“每一步给一整份代码”，而是：

- `baseCode` 给初始完整代码
- `steps[].patches` 只描述当前步骤相对前一步的增量修改
- `focus` 和 `marks` 用内容锚定，而不是手写行号

相关设计细节见 `docs/tutorial-data-format.md`。

---

## 3. 组装层怎么把教程 DSL 变成可渲染步骤

入口函数是 `lib/tutorial-assembler.js` 里的 `buildTutorialSteps(data)`。

它做了 4 件事：

1. 用 `baseCode` 作为初始代码快照。
2. 逐步应用当前 step 的 `patches`，生成当前步骤的完整代码。
3. 把 `focus` 和 `marks` 注入成 CodeHike 注解。
4. 调用 `highlight()` 生成 `highlighted` 结果。

这层的几个关键点：

- `applyContentPatches()` 用 `find/replace` 改代码，并且强校验：
  - 找不到 `find` 会直接报错
  - 找到多次也会报错，避免歧义
- `injectAnnotations()` 会把：
  - `focus.find` 转成 `// !focus(start)` / `// !focus(end)`
  - `marks.find` 转成 `// !mark(1) color`
- 返回的 `steps` 已经不是原始 DSL，而是前端可直接渲染的数组：

```js
[
  {
    eyebrow,
    title,
    lead,
    paragraphs,
    highlighted
  }
]
```

注意：当前前端消费的是已经高亮好的 `highlighted`，不是原始代码字符串。

---

## 4. 静态教程页的链路

静态页适合不需要浏览器再发请求的场景，例如：

- `/mobx`
- `/event-emitter`

以 `app/mobx/page.jsx` 为例，链路是：

1. 页面导入 `mobxTutorial`
2. 页面在服务端调用 `buildTutorialSteps(mobxTutorial)`
3. 得到 `steps`
4. 直接把 `steps + intro + title + fileName` 传给 `TutorialScrollyDemo`
5. 页面返回完整教程

静态页特点：

- 没有额外 API 请求
- 渲染路径最短
- 页面首屏拿到的就是完整教程内容

可以把它理解成“服务端直接组装并渲染”。

---

## 5. 远程教程页的链路

远程页适合“前端先拿一个页面壳，再通过请求拿数据”的模式。

当前通用入口是：

- `app/[slug]/request/page.jsx`

当前已注册的 slug：

- `mobx`
- `event-emitter`

对应可访问 URL：

- `/mobx/request`
- `/event-emitter/request`

完整链路如下：

### 第 1 步：浏览器请求远程页

用户访问：

```txt
/mobx/request
```

Next.js 命中：

```txt
app/[slug]/request/page.jsx
```

这个页面会：

- 从 `params.slug` 读到 `mobx`
- 调用 `getTutorialBySlug(slug)` 校验教程是否存在
- 如果不存在，直接 `notFound()`
- 如果存在，渲染 `RemoteTutorialPage`

同时它还会：

- 用 `generateStaticParams()` 基于 `tutorialSlugs` 预生成已知远程页
- 用 `generateMetadata()` 生成每个 slug 对应的标题和描述

### 第 2 步：服务端先输出页面壳

`RemoteTutorialPage` 是客户端组件，但页面路由本身是服务端组件。

因此用户第一次拿到的是一个“远程页壳”：

- 标题已知
- 页面结构已知
- 客户端初始状态是 `loading`

此时会显示请求中的占位内容。

### 第 3 步：浏览器请求 mock API

`components/remote-tutorial-page.jsx` 在 `useEffect()` 里发起请求：

```js
fetch(`/api/tutorials/${slug}`, {
  cache: "no-store",
})
```

它维护了 3 种状态：

- `loading`
- `success`
- `error`

### 第 4 步：API 按 slug 返回教程 payload

接口文件：

```txt
app/api/tutorials/[slug]/route.js
```

接口逻辑：

1. 从 `context.params` 取 `slug`
2. 用 `getTutorialBySlug(slug)` 从注册表取教程
3. 如果没找到，返回 `404`
4. 如果找到，调用 `buildTutorialPayload(tutorial)`
5. 返回 JSON

### 第 5 步：payload 在服务端组装好

`buildTutorialPayload()` 做的是一层很薄的适配：

1. 调 `buildTutorialSteps(tutorial)`
2. 把教程整理成下面这个 shape：

```js
{
  title,
  description,
  fileName,
  intro,
  steps
}
```

其中：

- `intro` 是段落数组
- `steps` 里已经包含 `highlighted`

所以当前 mock API 返回的不是“原始教程 DSL”，而是“前端可直接渲染的最终 payload”。

### 第 6 步：客户端收到数据后切换到正式教程

`RemoteTutorialPage` 收到成功响应后，把 `tutorial` 存进 state，然后改为渲染：

- `steps={state.tutorial.steps}`
- `intro={state.tutorial.intro}`
- `title={state.tutorial.title}`
- `fileName={state.tutorial.fileName}`

最终仍然交给同一个通用渲染器：

```txt
components/tutorial-scrolly-demo.jsx
```

也就是说：

- 静态页和远程页的数据来源不同
- 但最终视觉和交互渲染器是同一个

---

## 6. 通用渲染器怎么工作

真正负责页面交互的是 `components/tutorial-scrolly-demo.jsx`。

这个组件有几个重要约束：

### 6.1 左右分栏

- 左侧：`code-column`
- 右侧：`article-column`

桌面端左侧代码区固定在视口里，右侧文章区负责滚动。

### 6.2 同一个代码面板持续变化

这里不是按步骤切整块代码组件，而是：

- 保持同一个 `Pre` 面板实例
- 随 `selectedIndex` 变化只替换内部 `code`

这样 CodeHike 的 token 过渡和行级 diff 动画才能连续生效。

### 6.3 选中步骤由滚动驱动

`SelectionProvider` + `Selectable` 负责维护当前选中的 step。

右侧文章滚动到哪个步骤，左侧代码就切换到哪个步骤的 `highlighted`。

### 6.4 代码变化可感知

当前实现包含三类反馈：

- `focus`: 非 focus 行降低透明度
- `mark`: 给关键行加左侧色条和底色
- 行增删动画：
  - 新增行淡入并轻微上移
  - 删除行用 ghost 元素淡出

### 6.5 避免双滚动冲突

当前代码区 `pre` 没有独立纵向滚动，也没有在步骤切换时主动 `scrollTo` 代码区内部。

这符合当前项目的交互约束。

---

## 7. 现在的完整时序图

### 7.1 静态页

```txt
content/*.tutorial.js
  -> buildTutorialSteps()
  -> TutorialScrollyDemo
  -> /mobx 或 /event-emitter
```

### 7.2 远程页

```txt
浏览器访问 /[slug]/request
  -> app/[slug]/request/page.jsx
  -> RemoteTutorialPage (loading)
  -> fetch /api/tutorials/[slug]
  -> getTutorialBySlug(slug)
  -> buildTutorialPayload()
  -> buildTutorialSteps()
  -> 返回 JSON payload
  -> RemoteTutorialPage (success)
  -> TutorialScrollyDemo
```

---

## 8. 如何新增一篇教程

如果要新增 `build your own store`，当前最小步骤是：

1. 新建内容文件，例如：

```txt
content/build-your-own-store.tutorial.js
```

2. 按现有 DSL 填写：

- `meta`
- `intro`
- `baseCode`
- `steps`

3. 在 `lib/tutorial-registry.js` 注册：

```js
export const tutorialRegistry = {
  mobx: mobxTutorial,
  "event-emitter": emitterTutorial,
  store: storeTutorial,
}
```

4. 完成后自动获得远程页：

```txt
/store/request
```

5. 如果还需要“静态直出页”，再补一个页面文件：

```txt
app/store/page.jsx
```

静态页的写法可以直接参考：

- `app/mobx/page.jsx`
- `app/event-emitter/page.jsx`

---

## 9. 从 mock 切到真实后端时该怎么改

当前 mock API 的契约已经比较清晰，建议后续尽量保持响应 shape 不变。

也就是让前端继续收到：

```js
{
  title,
  description,
  fileName,
  intro,
  steps
}
```

后续切真实接口有两种常见方案：

### 方案 A：保留当前 `app/api/tutorials/[slug]` 作为 BFF

做法：

- 前端仍然只请求 `/api/tutorials/[slug]`
- API route 再去请求真实后端
- 如果后端返回的是原始教程 DSL，仍然在这里调用 `buildTutorialPayload()`

优点：

- 前端完全不用改
- 可以继续复用当前组装逻辑
- 方便在服务端保护密钥、加缓存、做降级

### 方案 B：真实后端直接返回最终 payload

做法：

- 后端直接返回当前 mock API 的最终格式
- `app/api/tutorials/[slug]` 可以变成透明转发，或者被前端直接替换掉

优点：

- 前端最简单
- 组装成本被移动到后端

当前更稳妥的是方案 A，因为它最小化前端改动。

---

## 10. 验证方式

开发时常用的验证方式：

```bash
npm run dev
```

检查 API：

```bash
curl http://localhost:3000/api/tutorials/mobx
curl http://localhost:3000/api/tutorials/event-emitter
```

检查页面：

```txt
http://localhost:3000/mobx
http://localhost:3000/event-emitter
http://localhost:3000/mobx/request
http://localhost:3000/event-emitter/request
```

检查构建：

```bash
npm run build
```

当前构建结果里：

- `/[slug]/request` 是通用远程页
- `/api/tutorials/[slug]` 是动态接口

---

## 11. 常见注意点

### 11.1 注册表是远程页的单一入口

远程页是否可访问，不是看有没有 `app/foo/request/page.jsx`，而是看：

```txt
lib/tutorial-registry.js
```

里有没有这个 `slug`。

### 11.2 当前 API 返回的是“最终可渲染数据”

这一点很重要。现在前端请求回来后可以直接渲染，不需要浏览器再做：

- patch 计算
- focus 注入
- CodeHike highlight

这些都发生在服务端。

### 11.3 重命名组件后如果 dev 缓存异常，先清 `.next`

Next.js dev 模式下，如果组件文件名刚刚重命名，热更新缓存有时会残留旧路径。

遇到这类问题时，直接：

```bash
rm -rf .next
npm run dev
```

---

## 12. 当前状态总结

现在项目已经具备一套完整的教程系统：

- 有统一教程 DSL
- 有统一组装层
- 有统一渲染器
- 有静态直出页
- 有通用远程请求页
- 有 `slug` 注册表
- 有 mock API 作为后续真实后端的过渡层

后续不管是继续扩教程数量，还是把 mock 数据替换成真实数据源，都不需要再改动渲染器本身，只需要围绕：

- `content/*.tutorial.js`
- `lib/tutorial-registry.js`
- `app/api/tutorials/[slug]/route.js`

这三层扩展即可。
