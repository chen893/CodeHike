import { highlight } from "codehike/code"
import githubDark from "@code-hike/lighter/theme/github-dark.mjs"

export const finalStoreCode = `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }

  function dispatch(action) {
    state = reducer(state, action)
    listeners.slice().forEach((listener) => listener())
    return action
  }

  return {
    getState,
    subscribe,
    dispatch,
  }
}`

export const tutorialSteps = [
  {
    title: "createStore 先把状态关进闭包里。",
    eyebrow: "State",
    lead:
      "Redux 的起点并不是 dispatch，而是一份被良好封装的 state。只要 state 还安全地留在 createStore 内部，后面所有能力都只是围绕它展开。",
    paragraphs: [
      "第一步唯一要做的事情，就是让 reducer 用一条初始化 action 产出首个 state。这样 store 在诞生的瞬间就已经具备了确定的初始值。",
      "这一步的价值是建立边界。你不是在到处共享一个变量，而是在构造一个有内部状态、外部只能通过接口访问的对象。",
    ],
    code: `export function createStore(reducer) {
  // !focus(start)
  let state = reducer(undefined, { type: "@@INIT" })
  // !focus(end)

  return {}
}`,
  },
  {
    title: "给它一个只读出口：getState。",
    eyebrow: "Read",
    lead:
      "有了内部 state 后，最自然的第一项公开能力不是写，而是读。任何 UI、日志系统或者调试工具，在接入 store 时都得先知道现在的状态是什么。",
    paragraphs: [
      "getState 的设计故意保持极简。它不缓存、不复制，也不做额外推导，只负责把当前 state 暴露出去。",
      "这种简单接口很重要，因为它让“读取状态”变成一件稳定且可预期的事。后面再引入 dispatch 时，读者会更容易理解读取和写入是两条不同职责。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })

  // !focus(start)
  function getState() {
    return state
  }
  // !focus(end)

  return {
    // !mark(1) rgb(143 210 193)
    getState,
  }
}`,
  },
  {
    title: "变化迟早会发生，所以先准备 listeners。",
    eyebrow: "Listeners",
    lead:
      "Redux 不只是存值，它还要允许外部系统在状态变化后重新渲染或做副作用。所以在真正通知之前，先把监听器的容器准备好。",
    paragraphs: [
      "listeners 仍然留在闭包中，和 state 一样不直接暴露给外部。这样外层代码只能通过 subscribe 这一条明确入口接入。",
      "这一步看起来像是在“只是加一个数组”，但实际上是在为后面的观察者机制预留形状。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  // !focus(start)
  // !mark(1) rgb(192 201 123)
  let listeners = []
  // !focus(end)

  function getState() {
    return state
  }

  return {
    getState,
  }
}`,
  },
  {
    title: "subscribe 负责登记，也负责退出。",
    eyebrow: "Subscribe",
    lead:
      "当一个外部消费者说“我想在状态变化后收到通知”，store 需要的不只是登记它，还要能在它离开时把它干净地移除。",
    paragraphs: [
      "因此 subscribe 最合理的返回值不是布尔值，而是一个取消订阅函数。调用者拿到这个函数后，就能在组件卸载或作用域结束时主动解除监听。",
      "这种 API 形状是 Redux 非常经典的一点。它让订阅生命周期成为一等公民，而不是靠额外的 id 或命令式 API 勉强管理。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  // !focus(start)
  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }
  // !focus(end)

  return {
    getState,
    subscribe,
  }
}`,
  },
  {
    title: "再给 store 一个明确的写入口：dispatch。",
    eyebrow: "Dispatch",
    lead:
      "到这里为止，store 还是只读的。真正让 Redux 开始形成单向数据流的，是 dispatch 这个写入口。",
    paragraphs: [
      "先把 dispatch 的函数形状立起来，即使它暂时还没做任何真正的状态变化。这种拆分会让读者先消化“变化从哪里发生”，再消化“变化如何被计算”。",
      "教程写作里，先立接口、再补行为，通常比一次把所有逻辑塞进去更利于阅读。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }

  // !focus(start)
  function dispatch(action) {
    return action
  }
  // !focus(end)

  return {
    getState,
    subscribe,
    dispatch,
  }
}`,
  },
  {
    title: "真正的状态变化只做一件事：交给 reducer 计算。",
    eyebrow: "Reducer",
    lead:
      "dispatch 的责任并不是理解业务逻辑，而是把旧 state 和 action 交给 reducer，然后接受 reducer 产出的下一份 state。",
    paragraphs: [
      "这正是 Redux 核心设计最清楚的地方：状态如何变化，不写在 store 里，而写在 reducer 里。store 只是那个把变化串起来的执行器。",
      "因此当你补上 `state = reducer(state, action)` 这一行时，真正建立起来的是一条清晰的责任边界。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }

  function dispatch(action) {
    // !focus(start)
    // !mark(1) rgb(127 185 200)
    state = reducer(state, action)
    // !focus(end)
    return action
  }

  return {
    getState,
    subscribe,
    dispatch,
  }
}`,
  },
  {
    title: "状态变了以后，要把消息广播出去。",
    eyebrow: "Notify",
    lead:
      "如果 dispatch 只更新了 state，但外部世界完全不知道发生了什么，那这个 store 仍然很难真正驱动 UI。接下来就是把变化通知给订阅者。",
    paragraphs: [
      "这里用 `listeners.slice()` 而不是直接遍历原数组，是一个很小但实际有价值的防御动作。这样就算某个 listener 在执行过程中修改了订阅列表，也不会影响当前这一轮通知。",
      "这一层补完之后，store 才真正从“内部状态容器”变成“外部世界可以观察和响应的数据源”。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }

  function dispatch(action) {
    state = reducer(state, action)
    // !focus(start)
    // !mark(1) rgb(221 176 129)
    listeners.slice().forEach((listener) => listener())
    // !focus(end)
    return action
  }

  return {
    getState,
    subscribe,
    dispatch,
  }
}`,
  },
]

export async function buildHighlightedSteps() {
  return Promise.all(
    tutorialSteps.map(async (step) => ({
      ...step,
      highlighted: await highlight(
        {
          lang: "js",
          value: step.code,
          meta: "",
        },
        githubDark,
      ),
    })),
  )
}
