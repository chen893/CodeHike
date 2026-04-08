/**
 * Build Your Own EventEmitter — 教程结构化数据
 */

export const emitterTutorial = {
  meta: {
    title: "Build your own EventEmitter",
    lang: "js",
    fileName: "emitter.js",
    description: "从零构建一个最小 EventEmitter 实现",
  },

  intro: {
    paragraphs: [
      "EventEmitter 是 Node.js 中最基础的设计模式之一。几乎所有异步 API 都建立在它之上：streams、servers、process 都继承自 EventEmitter。",
      "这个教程会从零构建一个最小但完整的 EventEmitter，依次实现 on、off、once 和 emit 的安全处理。每一步只引入一个能力，左侧代码随滚动变化，右侧解释设计意图。",
    ],
  },

  baseCode: `export class EventEmitter {
  constructor() {
    this.events = {}
  }
}`,

  steps: [
    // ──────────────────────────────────────────
    // Step 1: on + emit
    // ──────────────────────────────────────────
    {
      id: "on-emit",
      eyebrow: "Core",
      title: "on 负责登记，emit 负责触发。",
      lead:
        "EventEmitter 的全部秘密就是一个对象：键是事件名，值是监听函数数组。on 把函数推入数组，emit 遍历调用。",
      paragraphs: [
        "on 检查事件名对应的数组是否存在，不存在就先创建。然后 push 新的监听函数。每个方法都返回 this，支持链式调用：emitter.on('data', fn1).on('data', fn2)。",
        "emit 用展开运算符把所有参数传给监听函数。注意它只负责调用，不关心返回值——这是事件模型和回调模型的核心区别：调用者不等待结果。",
      ],
      patches: [
        {
          find: `export class EventEmitter {\n  constructor() {\n    this.events = {}\n  }\n}`,
          replace: `export class EventEmitter {\n  constructor() {\n    this.events = {}\n  }\n\n  on(eventName, listener) {\n    if (!this.events[eventName]) {\n      this.events[eventName] = []\n    }\n    this.events[eventName].push(listener)\n    return this\n  }\n\n  emit(eventName, ...args) {\n    const listeners = this.events[eventName]\n    if (listeners) {\n      listeners.forEach((listener) => listener(...args))\n    }\n    return this\n  }\n}`,
        },
      ],
      focus: {
        find: `  emit(eventName, ...args) {\n    const listeners = this.events[eventName]\n    if (listeners) {\n      listeners.forEach((listener) => listener(...args))\n    }\n    return this\n  }`,
      },
      marks: [
        {
          find: `      listeners.forEach((listener) => listener(...args))`,
          color: "rgb(221 176 129)",
        },
      ],
    },

    // ──────────────────────────────────────────
    // Step 2: off
    // ──────────────────────────────────────────
    {
      id: "off",
      eyebrow: "Unsubscribe",
      title: "off：用函数引用精确移除监听。",
      lead:
        "注册监听只是故事的一半。如果组件卸载或作用域结束，必须能干净地移除监听函数，否则会造成内存泄漏。",
      paragraphs: [
        "off 用 indexOf 找到函数在数组中的位置，然后 splice 删除。它比较的是函数引用——所以 on 传入的必须是同一个引用。如果你 on 了一个匿名函数，就再也无法 off 它。",
        "这也是为什么 React 的 useEffect 清理函数必须引用同一个 handler：useEffect 里 on，cleanup 里 off，用的是同一个函数引用。",
      ],
      patches: [
        {
          find: `    return this\n  }\n\n  emit(eventName, ...args)`,
          replace: `    return this\n  }\n\n  off(eventName, listener) {\n    const listeners = this.events[eventName]\n    if (listeners) {\n      const index = listeners.indexOf(listener)\n      if (index !== -1) {\n        listeners.splice(index, 1)\n      }\n    }\n    return this\n  }\n\n  emit(eventName, ...args)`,
        },
      ],
      focus: {
        find: `  off(eventName, listener) {\n    const listeners = this.events[eventName]\n    if (listeners) {\n      const index = listeners.indexOf(listener)\n      if (index !== -1) {\n        listeners.splice(index, 1)\n      }\n    }\n    return this\n  }`,
      },
      marks: [
        {
          find: `        listeners.splice(index, 1)`,
          color: "rgb(192 201 123)",
        },
      ],
    },

    // ──────────────────────────────────────────
    // Step 3: once
    // ──────────────────────────────────────────
    {
      id: "once",
      eyebrow: "Once",
      title: "once：听过一次就自动离开。",
      lead:
        "有些场景下监听函数只应该执行一次，比如连接建立的 'connect' 事件。once 就是为此设计的。",
      paragraphs: [
        "once 不直接注册用户的回调，而是注册一个 wrapper。wrapper 先执行用户回调，然后立即调用 off 移除自己。这样下次 emit 就不会再触发这个监听函数了。",
        "注意 once 的顺序依赖——它必须在 off 之后实现，因为 wrapper 内部调用了 this.off。这也体现了 API 设计中常见的构建顺序：先有移除能力，再在移除能力上构建自动移除。",
      ],
      patches: [
        {
          find: `      listeners.splice(index, 1)\n      }\n    }\n    return this\n  }\n\n  emit(eventName, ...args)`,
          replace: `      listeners.splice(index, 1)\n      }\n    }\n    return this\n  }\n\n  once(eventName, listener) {\n    const wrapper = (...args) => {\n      listener(...args)\n      this.off(eventName, wrapper)\n    }\n    return this.on(eventName, wrapper)\n  }\n\n  emit(eventName, ...args)`,
        },
      ],
      focus: {
        find: `  once(eventName, listener) {\n    const wrapper = (...args) => {\n      listener(...args)\n      this.off(eventName, wrapper)\n    }\n    return this.on(eventName, wrapper)\n  }`,
      },
      marks: [
        {
          find: `      this.off(eventName, wrapper)`,
          color: "rgb(143 210 193)",
        },
      ],
    },

    // ──────────────────────────────────────────
    // Step 4: emit 安全加固
    // ──────────────────────────────────────────
    {
      id: "safety",
      eyebrow: "Safety",
      title: "emit 的两个隐患：迭代中修改和沉默的错误。",
      lead:
        "当前 emit 有两个问题。第一，如果监听函数在执行中调用了 off 或 once，会修改正在遍历的数组，导致跳过或重复。第二，没有监听器的 error 事件会被完全忽略。",
      paragraphs: [
        "listeners.slice() 创建数组快照再遍历，即使原数组在遍历过程中被修改，快照不受影响。这是一个很小的改动，但修复了一整类 bug。",
        "Node.js 约定：error 事件如果没有任何监听器，应该抛出异常而不是静默吞掉。这是防御性编程的体现——错误永远不应该无声地消失。emit 检查 listeners 为空且事件名是 error 时，直接 throw。",
      ],
      patches: [
        {
          find: `  emit(eventName, ...args) {\n    const listeners = this.events[eventName]\n    if (listeners) {\n      listeners.forEach((listener) => listener(...args))\n    }\n    return this\n  }`,
          replace: `  emit(eventName, ...args) {\n    const listeners = this.events[eventName]\n    if (listeners) {\n      listeners.slice().forEach((listener) => listener(...args))\n    } else if (eventName === 'error') {\n      throw args[0] instanceof Error\n        ? args[0]\n        : new Error(\`Uncaught error: \${args[0]}\`)\n    }\n    return this\n  }`,
        },
      ],
      focus: {
        find: `  emit(eventName, ...args) {\n    const listeners = this.events[eventName]\n    if (listeners) {\n      listeners.slice().forEach((listener) => listener(...args))\n    } else if (eventName === 'error') {\n      throw args[0] instanceof Error\n        ? args[0]\n        : new Error(\`Uncaught error: \${args[0]}\`)\n    }\n    return this\n  }`,
      },
      marks: [
        {
          find: `      listeners.slice().forEach((listener) => listener(...args))`,
          color: "rgb(192 201 123)",
        },
        {
          find: `    } else if (eventName === 'error') {`,
          color: "rgb(221 176 129)",
        },
      ],
    },
  ],
}
