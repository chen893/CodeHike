export const sampleTutorial = {
  meta: {
    title: "Sample tutorial",
    lang: "js",
    fileName: "counter.js",
    description: "A neutral sample dataset for the generic tutorial renderer.",
  },

  intro: {
    paragraphs: [
      "这个分支不再内置 MobX、EventEmitter 或 Redux 主题内容，只保留一份中性的 sample 数据，用来验证通用教程渲染链路本身。",
      "你可以把它理解成模板数据：左侧代码舞台、右侧文章滚动、步骤切换动画和远程请求流程都已经打通，后续只需要替换数据源即可。",
    ],
  },

  baseCode: `export function createCounter() {
  return {}
}`,

  steps: [
    {
      id: "state",
      eyebrow: "State",
      title: "先把状态关进闭包里。",
      lead:
        "任何教程数据只要能表达“初始代码到下一步代码”的变化，就能落到这套渲染器里。第一步先加一个最小状态。",
      paragraphs: [
        "count 留在 createCounter 内部，这样后面的读取和修改都围绕同一个闭包展开。",
        "这一步本身很小，但能验证 patch、focus 和文章节奏是否正常工作。",
      ],
      patches: [
        {
          find: `export function createCounter() {\n  return {}\n}`,
          replace: `export function createCounter() {\n  let count = 0\n\n  return {}\n}`,
        },
      ],
      focus: {
        start: 2,
        end: 2,
      },
      marks: [
        {
          start: 2,
          end: 2,
          color: "rgb(143 210 193)",
        },
      ],
    },
    {
      id: "read",
      eyebrow: "Read",
      title: "给它一个只读出口。",
      lead:
        "第二步补一个 getCount。这样教程不需要依赖任何具体框架，也能体现“状态读取”这个基本概念。",
      paragraphs: [
        "getCount 只返回当前 count，不做额外计算。",
        "它也能验证同一个代码面板里新增方法时，行级动画是否自然。",
      ],
      patches: [
        {
          find: `export function createCounter() {\n  let count = 0\n\n  return {}\n}`,
          replace: `export function createCounter() {\n  let count = 0\n\n  function getCount() {\n    return count\n  }\n\n  return {\n    getCount,\n  }\n}`,
        },
      ],
      focus: {
        start: 4,
        end: 6,
      },
      marks: [
        {
          start: 9,
          end: 9,
          color: "rgb(127 185 200)",
        },
      ],
    },
    {
      id: "write",
      eyebrow: "Write",
      title: "再给一个明确的写入口。",
      lead:
        "increment 是一个足够中性的更新动作。它不会引入任何业务主题，只负责验证增量代码和重点标记。",
      paragraphs: [
        "现在返回对象里同时暴露 getCount 和 increment，已经足够驱动一个最小交互。",
        "如果未来接真实后端，这一步对应的依然只是教程数据里的一个 step。",
      ],
      patches: [
        {
          find: `  function getCount() {\n    return count\n  }\n\n  return {\n    getCount,\n  }\n}`,
          replace: `  function getCount() {\n    return count\n  }\n\n  function increment() {\n    count += 1\n    return count\n  }\n\n  return {\n    getCount,\n    increment,\n  }\n}`,
        },
      ],
      focus: {
        start: 8,
        end: 11,
      },
      marks: [
        {
          start: 9,
          end: 9,
          color: "rgb(221 176 129)",
        },
      ],
    },
    {
      id: "reset",
      eyebrow: "Reset",
      title: "最后补一个可逆操作。",
      lead:
        "reset 能让 sample 数据形成一个更完整的模块，同时继续验证最后一次代码增量过渡。",
      paragraphs: [
        "一个最小但完整的教程，不需要主题很大，关键是数据结构和渲染交互保持稳定。",
        "到这里，这条通用渲染链路已经具备了可替换数据源的形状。",
      ],
      patches: [
        {
          find: `  function increment() {\n    count += 1\n    return count\n  }\n\n  return {\n    getCount,\n    increment,\n  }\n}`,
          replace: `  function increment() {\n    count += 1\n    return count\n  }\n\n  function reset() {\n    count = 0\n    return count\n  }\n\n  return {\n    getCount,\n    increment,\n    reset,\n  }\n}`,
        },
      ],
      focus: {
        start: 13,
        end: 16,
      },
      marks: [
        {
          start: 21,
          end: 21,
          color: "rgb(192 201 123)",
        },
      ],
    },
  ],
}
