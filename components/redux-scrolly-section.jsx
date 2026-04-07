import { buildHighlightedSteps } from "../lib/redux-tutorial-content"
import { ReduxScrollyDemo } from "./redux-scrolly-demo"

export async function ReduxScrollySection() {
  const steps = await buildHighlightedSteps()
  const intro = [
    "这不是一篇从 Redux API 倒背出来的说明书，而是一次从零开始的构造过程。我们会先做出一个极小但完整可用的 store，再顺着它的边界理解 Redux 为什么要把 state、reducer、dispatch 和 subscribe 分开。",
    "阅读方式和 Build your own react 一样：左侧代码保持在舞台上，右侧正文随着滚动逐段推进。每一步只引入一个概念，让变化尽量小、尽量清楚。",
  ]

  return <ReduxScrollyDemo steps={steps} intro={intro} />
}
