/**
 * Build Your Own MobX — 教程结构化数据
 *
 * 遵循 docs/tutorial-data-format.md 中定义的内容定位 patch 格式。
 * AI 只需输出 find/replace，不需要数行号。
 */

export const mobxTutorial = {
  meta: {
    title: "Build your own MobX",
    lang: "js",
    fileName: "reactive.js",
    description: "从零构建一个最小 MobX 响应式系统",
  },

  intro: {
    paragraphs: [
      "MobX 最核心的能力是自动依赖追踪：你不需要手动声明数据之间的关系，只要在 autorun 里读取了一个 observable，依赖就自动建立了。值一变，autorun 自动重新执行。",
      "这个教程会从零构建一个最小但完整的响应式系统，依次实现 observable、autorun、computed 和 action 四个原语。每一步只引入一个概念，左侧代码随滚动变化，右侧解释设计意图。",
    ],
  },

  baseCode: `export function observable(value) {
  return {
    get() {
      return value
    },
    set(newValue) {
      value = newValue
    },
  }
}`,

  steps: [
    // ──────────────────────────────────────────
    // Step 1: 订阅通知
    // ──────────────────────────────────────────
    {
      id: "notify",
      eyebrow: "Notify",
      title: "变化需要被感知，先准备听众列表。",
      lead:
        "observable 能存值、能改值，但改了之后没人知道。第一步先把「谁关心这个值」的清单建好。",
      paragraphs: [
        "subscribers 是一个 Set，保证同一个监听函数不会重复注册。subscribe 返回一个取消函数，调用者可以在合适的时机退出监听。",
        "set 每次更新完值，就遍历通知所有听众。这就是观察者模式的最小实现——observable 是 subject，每个 subscribe 的函数就是 observer。",
      ],
      patches: [
        {
          find: `export function observable(value) {\n  return {\n    get() {\n      return value\n    },\n    set(newValue) {\n      value = newValue\n    },\n  }\n}`,
          replace: `export function observable(value) {\n  const subscribers = new Set()\n\n  return {\n    get() {\n      return value\n    },\n    set(newValue) {\n      value = newValue\n      subscribers.forEach((fn) => fn())\n    },\n    subscribe(fn) {\n      subscribers.add(fn)\n      return () => subscribers.delete(fn)\n    },\n  }\n}`,
        },
      ],
      focus: {
        find: `  const subscribers = new Set()`,
      },
      marks: [
        {
          find: `      subscribers.forEach((fn) => fn())`,
          color: "rgb(221 176 129)",
        },
      ],
    },

    // ──────────────────────────────────────────
    // Step 2: 依赖收集 + autorun
    // ──────────────────────────────────────────
    {
      id: "tracking",
      eyebrow: "Tracking",
      title: "autorun 的秘密：让 get 自己登记依赖。",
      lead:
        "手动 subscribe 能工作，但 MobX 的真正魔力在于：你不需要手动订阅。只要 autorun 里读了一个 observable，依赖关系就自动建立了。",
      paragraphs: [
        "奥秘在于两件事的配合：一个全局变量 currentReaction，和一个被改造的 get。当 autorun 执行时，它把自己挂到 currentReaction 上。此时任何被读取的 observable.get() 都会发现 currentReaction 存在，于是把自己注册进去。",
        "这就是依赖收集——不是你告诉系统「我依赖谁」，而是系统观察「你读了谁」。这种方式让代码保持声明式，你只需要写业务逻辑，追踪交给框架。",
        "autorun 每次重新执行前，会先清理旧的订阅关系。这是因为依赖可能随条件分支变化——上次读了 A，这次可能只读了 B。清理后重新收集，保证依赖始终精确。",
      ],
      patches: [
        {
          find: `export function observable`,
          replace: `let currentReaction = null\n\nexport function observable`,
        },
        {
          find: `    get() {\n      return value\n    }`,
          replace: `    get() {\n      if (currentReaction) {\n        subscribers.add(currentReaction)\n        currentReaction.deps.add(subscribers)\n      }\n      return value\n    }`,
        },
        {
          find: `      return () => subscribers.delete(fn)\n    },\n  }\n}`,
          replace: `      return () => subscribers.delete(fn)\n    },\n  }\n}\n\nexport function autorun(fn) {\n  function reaction() {\n    reaction.deps.forEach((set) => set.delete(reaction))\n    reaction.deps.clear()\n\n    currentReaction = reaction\n    fn()\n    currentReaction = null\n  }\n  reaction.deps = new Set()\n  reaction()\n}`,
        },
      ],
      focus: {
        find: `export function autorun(fn) {\n  function reaction() {\n    reaction.deps.forEach((set) => set.delete(reaction))\n    reaction.deps.clear()\n\n    currentReaction = reaction\n    fn()\n    currentReaction = null\n  }\n  reaction.deps = new Set()\n  reaction()\n}`,
      },
      marks: [
        {
          find: `        currentReaction.deps.add(subscribers)`,
          color: "rgb(143 210 193)",
        },
      ],
    },

    // ──────────────────────────────────────────
    // Step 3: computed
    // ──────────────────────────────────────────
    {
      id: "computed",
      eyebrow: "Computed",
      title: "computed：用已有的响应式组合出新值。",
      lead:
        "如果一个值是从其他 observable 派生出来的，而且你想让它也拥有响应式能力，computed 就是为此设计的。",
      paragraphs: [
        "computed 的实现只有三行，但做的事不少：创建一个新的 observable 来持有结果，用 autorun 追踪计算函数的依赖，每当依赖变化时自动把新结果写回这个 observable。",
        "注意它返回的也是一个 observable——所以 computed 的结果可以作为另一个 computed 或 autorun 的依赖，形成任意深度的依赖链。这条链的建立完全不需要手动声明，全靠依赖收集自动完成。",
      ],
      patches: [
        {
          find: `  reaction.deps = new Set()\n  reaction()\n}`,
          replace: `  reaction.deps = new Set()\n  reaction()\n}\n\nexport function computed(fn) {\n  const obs = observable(undefined)\n  autorun(() => obs.set(fn()))\n  return obs\n}`,
        },
      ],
      focus: {
        find: `export function computed(fn) {\n  const obs = observable(undefined)\n  autorun(() => obs.set(fn()))\n  return obs\n}`,
      },
      marks: [
        {
          find: `  autorun(() => obs.set(fn()))`,
          color: "rgb(127 185 200)",
        },
      ],
    },

    // ──────────────────────────────────────────
    // Step 4: action 批处理
    // ──────────────────────────────────────────
    {
      id: "action",
      eyebrow: "Action",
      title: "action：把多次修改打包成一次更新。",
      lead:
        "如果你连续修改了三个 observable，autorun 会连续触发三次。但通常你只关心最终状态。action 就是用来把这个过程打包的。",
      paragraphs: [
        "action 的原理很直接：在执行期间设一个 isBatching 标志。observable.set 发现正在批量处理时，不直接通知，而是把 reaction 收集到 pendingReactions 里。action 执行完毕后，统一触发所有收集到的 reaction。",
        "pendingReactions 是一个 Set——即使三个 observable 触发了同一个 autorun，它也只会执行一次。这就是批处理的核心收益：不是减少通知的发送，而是减少 reaction 的执行。",
      ],
      patches: [
        {
          find: `let currentReaction = null`,
          replace: `let currentReaction = null\nlet isBatching = false\nconst pendingReactions = new Set()`,
        },
        {
          find: `      subscribers.forEach((fn) => fn())\n    },`,
          replace: `      if (isBatching) {\n        subscribers.forEach((fn) => pendingReactions.add(fn))\n      } else {\n        subscribers.forEach((fn) => fn())\n      }\n    },`,
        },
        {
          find: `  autorun(() => obs.set(fn()))\n  return obs\n}`,
          replace: `  autorun(() => obs.set(fn()))\n  return obs\n}\n\nexport function action(fn) {\n  return function (...args) {\n    isBatching = true\n    fn.apply(this, args)\n    isBatching = false\n    pendingReactions.forEach((r) => r())\n    pendingReactions.clear()\n  }\n}`,
        },
      ],
      focus: {
        find: `export function action(fn) {\n  return function (...args) {\n    isBatching = true\n    fn.apply(this, args)\n    isBatching = false\n    pendingReactions.forEach((r) => r())\n    pendingReactions.clear()\n  }\n}`,
      },
      marks: [
        {
          find: `    isBatching = true`,
          color: "rgb(192 201 123)",
        },
        {
          find: `    pendingReactions.forEach((r) => r())`,
          color: "rgb(221 176 129)",
        },
      ],
    },
  ],
}
