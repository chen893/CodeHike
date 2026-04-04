import { highlight } from "codehike/code"
import githubDark from "@code-hike/lighter/theme/github-dark.mjs"

import { ReduxScrollyDemo } from "../components/redux-scrolly-demo"

const snippets = [
  {
    title: "先只保留 state，本质上它只是一个闭包。",
    eyebrow: "State",
    lead:
      "先把 Redux 缩到最小。此时我们不管 dispatch、订阅或者中间件，先只确认一件事：state 需要被安全地包在 createStore 的闭包里。",
    paragraphs: [
      "这里先用 reducer(undefined, { type: '@@INIT' }) 取到初始值。这样后面任何状态变化，都只是对这份 state 的更新，而不是重新定义 store。",
      "先不要追求完整能力。教程节奏最重要的是每一步只引入一个新概念，这样代码变化才会足够清楚。",
    ],
    code: `export function createStore(reducer) {
  // !focus(start)
  let state = reducer(undefined, { type: "@@INIT" })
  // !focus(end)

  return {}
}`,
  },
  {
    title: "然后给外部一个读取状态的入口。",
    eyebrow: "Read",
    lead:
      "有了内部 state 之后，第一件需要暴露的能力通常不是写，而是读。因为任何视图层在接入 store 前，都得先知道当前状态是什么。",
    paragraphs: [
      "getState 不做任何额外逻辑，它只是把闭包里的 state 直接返回出去。这个设计看起来简单，但它确立了 store 的公共读取接口。",
      "到这里为止，store 还是一个只读容器。它已经能被消费，但还不能被驱动变化。",
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
    title: "接着把订阅机制接上，但暂时不触发它。",
    eyebrow: "Subscribe",
    lead:
      "Redux 不是单纯保存一份值，它还要允许外层世界感知未来的变化。所以接下来补 listeners 和 subscribe，但先不急着真正通知它们。",
    paragraphs: [
      "listeners 依旧留在闭包里。subscribe 的职责也很单纯：把传入的 listener 推进数组，然后返回一个取消订阅函数。",
      "这样做的好处是，订阅生命周期被完整地封装在 store 内部，外部系统不需要知道 listeners 的具体实现。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  // !mark(1) rgb(192 201 123)
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
    title: "现在加上 dispatch 的外形，但先只接收 action。",
    eyebrow: "Dispatch",
    lead:
      "在真正改变状态之前，先把 dispatch 这个入口立起来。这样页面滚到这里时，读者先理解“从哪里发起变化”，再理解“变化是怎样计算出来的”。",
    paragraphs: [
      "这一步故意先只搭函数签名和返回值，让 dispatch 先作为一个明确的 store 能力出现。",
      "教程里把这种“先立接口，再补行为”的节奏拆开，代码变化就会更细，滚动体验也更稳定。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  // !focus(start)
  function dispatch(action) {
    return action
  }
  // !focus(end)

  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }

  return {
    getState,
    dispatch,
    subscribe,
  }
}`,
  },
  {
    title: "再让 dispatch 真正把 action 送进 reducer。",
    eyebrow: "Reducer",
    lead:
      "有了 dispatch 的入口，再补上真正的数据流核心。到这一步，Redux 的骨架就已经很清楚了：旧 state + action，交给 reducer，得到新 state。",
    paragraphs: [
      "这里的重点是责任边界。dispatch 不负责推导下一状态，它只是把计算委托给 reducer，然后把结果写回 store。",
      "读者在这一段看到的应该是一个很小的变化：只新增一行，但含义非常重。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  function dispatch(action) {
    // !focus(start)
    // !mark(1) rgb(127 185 200)
    state = reducer(state, action)
    // !focus(end)
    return action
  }

  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }

  return {
    getState,
    dispatch,
    subscribe,
  }
}`,
  },
  {
    title: "最后在状态更新后广播变化。",
    eyebrow: "Notify",
    lead:
      "最后一步才是把订阅真正串起来。这样做的好处是，读者会先理解状态如何变化，再理解变化之后怎样传到 UI 或其他消费者。",
    paragraphs: [
      "listeners.forEach(...) 是一次很小但很关键的补全。它让 store 从“内部状态容器”变成“外部系统可观察的数据源”。",
      "到这里，一个最小可用的 Redux store 才算闭环：能读、能写、能通知。",
    ],
    code: `export function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" })
  let listeners = []

  function getState() {
    return state
  }

  function dispatch(action) {
    state = reducer(state, action)
    // !focus(start)
    // !mark(1) rgb(221 176 129)
    listeners.forEach((listener) => listener())
    // !focus(end)
    return action
  }

  function subscribe(listener) {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((item) => item !== listener)
    }
  }

  return {
    getState,
    dispatch,
    subscribe,
  }
}`,
  },
]

async function getSteps() {
  return Promise.all(
    snippets.map(async (step) => ({
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

export default async function Page() {
  const steps = await getSteps()

  return (
    <main className="editorial-shell">
      <ReduxScrollyDemo steps={steps} />
    </main>
  )
}
