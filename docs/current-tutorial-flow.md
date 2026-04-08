# 当前通用渲染分支全流程

这个分支的目标不再是承载多个具体教程主题，而是沉淀一套通用教程渲染应用。

当前仓库只保留三类核心能力：

- 教程数据 DSL
- 教程数据到高亮步骤的组装层
- 静态页、远程页和 API 共用的通用渲染链路

为了让应用始终可运行，仓库内保留了一份中性的 `sample` 数据，但它只是示例，不再代表业务主题。

---

## 1. 路由结构

当前保留的有效入口只有这四类：

- `/`
  - 通用首页，说明应用结构并列出可用样例
- `/[slug]`
  - 服务端直出教程页
- `/[slug]/request`
  - 客户端发请求获取 payload 后再渲染教程页
- `/api/tutorials/[slug]`
  - 返回前端可直接渲染的教程 payload

默认内置样例：

- `/sample`
- `/sample/request`
- `/api/tutorials/sample`

---

## 2. 核心文件

| 文件 | 作用 |
|------|------|
| `content/sample-tutorial.js` | 提供一份中性的 sample 教程数据 |
| `lib/tutorial-registry.js` | 维护 `slug -> tutorial` 注册表，并导出教程列表 |
| `lib/tutorial-assembler.js` | 把 `baseCode + patches` 组装成每一步完整高亮代码 |
| `lib/tutorial-payload.js` | 把教程 DSL 转成前端直接消费的 payload |
| `components/tutorial-scrolly-demo.jsx` | 通用教程渲染器，负责左右分栏和代码动画 |
| `components/remote-tutorial-page.jsx` | 客户端请求页容器，负责 loading/error/success 状态 |
| `app/[slug]/page.jsx` | 通用静态教程页 |
| `app/[slug]/request/page.jsx` | 通用远程教程页 |
| `app/api/tutorials/[slug]/route.js` | 通用教程 payload 接口 |
| `app/page.jsx` | 通用首页 |

---

## 3. 教程数据格式

每篇教程都遵循同一套结构：

```js
export const tutorial = {
  meta: {
    title,
    lang,
    fileName,
    description,
  },
  intro: {
    paragraphs: [],
  },
  baseCode: `...`,
  steps: [
    {
      id,
      eyebrow,
      title,
      lead,
      paragraphs,
      patches,
      focus,
      marks,
    },
  ],
}
```

关键点：

- `baseCode` 是第一份完整代码
- `steps[].patches` 描述相对上一步的增量修改
- `focus` 和 `marks` 都用内容锚定，不手写行号

详细规范见 `docs/tutorial-data-format.md`。

---

## 4. 组装层流程

入口函数是：

```txt
lib/tutorial-assembler.js -> buildTutorialSteps(data)
```

它的职责是：

1. 从 `baseCode` 开始维护当前代码快照
2. 逐步应用每个 step 的 `patches`
3. 把 `focus` / `marks` 转成 CodeHike 注解
4. 调用 `highlight()` 得到 `highlighted`

最终产出的是前端可直接渲染的步骤数组：

```js
[
  {
    eyebrow,
    title,
    lead,
    paragraphs,
    highlighted,
  }
]
```

这意味着浏览器端不负责 patch 计算和代码高亮，组装发生在服务端。

---

## 5. 静态页链路

访问：

```txt
/sample
```

命中：

```txt
app/[slug]/page.jsx
```

流程如下：

1. 页面从 `params.slug` 取到 `sample`
2. 通过 `getTutorialBySlug(slug)` 读取注册表
3. 如果不存在，执行 `notFound()`
4. 如果存在，调用 `buildTutorialSteps(tutorial)`
5. 把 `steps + intro + title + fileName` 交给 `TutorialScrollyDemo`

特点：

- 没有额外请求
- 首屏直接拿到完整教程内容
- 适合本地内容直出

---

## 6. 远程页链路

访问：

```txt
/sample/request
```

命中：

```txt
app/[slug]/request/page.jsx
```

流程如下：

1. 页面先校验 `slug` 是否存在
2. 服务端输出一个远程页壳
3. `RemoteTutorialPage` 在浏览器 `useEffect()` 中请求：

```js
fetch(`/api/tutorials/${slug}`, { cache: "no-store" })
```

4. 请求成功后，把返回 payload 交给 `TutorialScrollyDemo`
5. 请求失败时显示错误态

特点：

- 可以验证前后端分层
- 能模拟未来接真实接口的工作方式
- 最终渲染器和静态页共用同一套组件

---

## 7. API 链路

访问：

```txt
/api/tutorials/sample
```

命中：

```txt
app/api/tutorials/[slug]/route.js
```

流程如下：

1. 从路由参数中取 `slug`
2. 用 `tutorial-registry` 找到教程
3. 如果不存在，返回 `404`
4. 如果存在，调用 `buildTutorialPayload(tutorial)`
5. 返回 JSON

返回格式固定为：

```js
{
  title,
  description,
  fileName,
  intro,
  steps,
}
```

其中 `steps` 已经包含高亮后的 `highlighted` 数据。

---

## 8. 通用渲染器的约束

`components/tutorial-scrolly-demo.jsx` 负责真正的交互渲染。

它遵循当前项目的几个硬规则：

- 左侧固定代码舞台，右侧文章滚动
- 始终复用同一个代码面板实例
- 步骤切换只更新内部 `code`
- 使用 focus、mark、token transition 和增删行动画
- 默认避免代码区内部纵向滚动

所以无论数据来自静态页还是远程页，最后都必须归一到：

```txt
TutorialScrollyDemo
```

---

## 9. 如何扩展

新增一篇教程时，最小步骤如下：

1. 新建一个教程数据文件，例如：

```txt
content/my-tutorial.js
```

2. 按统一 DSL 填写：

- `meta`
- `intro`
- `baseCode`
- `steps`

3. 在 `lib/tutorial-registry.js` 注册：

```js
export const tutorialRegistry = {
  sample: sampleTutorial,
  "my-tutorial": myTutorial,
}
```

4. 注册完成后，会自动获得：

- `/my-tutorial`
- `/my-tutorial/request`
- `/api/tutorials/my-tutorial`

这就是当前分支的核心收益：新增教程时不再需要手工复制页面文件。

---

## 10. 从 mock 到真实接口

当前最稳妥的演进方式是保留：

```txt
/api/tutorials/[slug]
```

作为 BFF。

做法：

- 前端继续请求本地 API route
- API route 再请求真实后端
- 如果真实后端返回的是原始 DSL，就继续在服务端调用 `buildTutorialPayload()`

这样有几个好处：

- 前端不用改
- 可以继续复用现有组装层
- 更容易加缓存、鉴权和降级逻辑

---

## 11. 验证方式

开发：

```bash
npm run dev
```

构建：

```bash
npm run build
```

常用检查地址：

```txt
/
/sample
/sample/request
/api/tutorials/sample
```

---

## 12. 当前分支的定位

这个分支现在不是“某个具体教程站点”，而是一套可复用的教程渲染应用骨架。

它保留的重点是：

- 通用数据格式
- 通用组装层
- 通用渲染器
- 通用静态页
- 通用远程页
- 通用 API

后续如果接真实内容源，主要只需要围绕这三层扩展：

- `content/*`
- `lib/tutorial-registry.js`
- `app/api/tutorials/[slug]/route.js`
