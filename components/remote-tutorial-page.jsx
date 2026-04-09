"use client"

import { useEffect, useState } from "react"
import { TutorialScrollyDemo } from "./tutorial-scrolly-demo"

const initialState = {
  status: "loading",
  tutorial: null,
  error: "",
}

export function RemoteTutorialPage({ slug, title }) {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    let cancelled = false

    async function loadTutorial() {
      setState(initialState)

      try {
        const response = await fetch(`/api/tutorials/${slug}`)

        if (!response.ok) {
          throw new Error(`请求失败，状态码 ${response.status}`)
        }

        const tutorial = await response.json()

        if (!cancelled) {
          setState({
            status: "success",
            tutorial,
            error: "",
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            tutorial: null,
            error:
              error instanceof Error
                ? error.message
                : "请求 mock 数据时发生未知错误",
          })
        }
      }
    }

    loadTutorial()

    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.status === "success" && state.tutorial) {
    return (
      <main className="tutorial-page">
        <TutorialScrollyDemo
          steps={state.tutorial.steps}
          intro={state.tutorial.intro}
          title={state.tutorial.title}
          fileName={state.tutorial.fileName}
        />
      </main>
    )
  }

  return (
    <main className="remote-loading">
      <div className="remote-loading-card">
        <h1>{title}</h1>
        {state.status === "loading" ? (
          <>
            <div className="remote-spinner" />
            <p>正在从本地 mock 接口加载教程数据...</p>
            <div className="remote-pulse" aria-hidden="true" />
          </>
        ) : (
          <>
            <p>数据请求失败，当前没有可渲染的教程内容。</p>
            <p className="remote-error">{state.error}</p>
          </>
        )}
      </div>
    </main>
  )
}
