import Link from "next/link"
import { listTutorials } from "../lib/tutorial-registry"
import * as publishedRepo from "../lib/repositories/published-tutorial-repository"

export const metadata = {
  title: "VibeDocs",
  description: "AI 驱动的 scrollytelling 源码教学教程生成与渲染。",
}

export default async function Page() {
  const tutorials = listTutorials()

  let publishedTutorials = []
  try {
    publishedTutorials = await publishedRepo.listPublished()
  } catch (err) {
    console.error("加载已发布教程列表失败:", err)
  }

  return (
    <main className="home-page">
      <section className="home-grid">
        <aside className="home-hero">
          <div>
            <p className="home-kicker">VibeDocs</p>
            <h1 className="home-title">AI 驱动的源码教学教程生成器</h1>
            <p className="home-body">
              输入源码和教学意图，AI 自动生成结构化的逐步构建式教程。
              可编辑、可预览、可发布。
            </p>
            <Link href="/new" className="home-route-link" style={{ marginTop: 16, display: 'inline-block' }}>
              创建新教程
            </Link>
          </div>

          <div className="home-footnote">
            <p>Core routes</p>
            <p>
              <code className="home-inline-code">/new</code> 创建教程
            </p>
            <p>
              <code className="home-inline-code">/drafts/[id]</code> 编辑草稿
            </p>
            <p>
              <code className="home-inline-code">/[slug]</code> 查看已发布教程
            </p>
          </div>
        </aside>

        <section className="home-panel">
          {publishedTutorials.length > 0 && (
            <>
              <p className="home-panel-kicker">Published</p>
              <h2 className="home-panel-title">已发布的教程</h2>
              <div className="home-route-list">
                {publishedTutorials.map((pub) => (
                  <article key={pub.id} className="home-route-item">
                    <p className="home-route-kicker">{pub.slug}</p>
                    <h3 className="home-route-title">
                      {pub.tutorialDraftSnapshot.meta.title}
                    </h3>
                    <p className="home-route-body">
                      {pub.tutorialDraftSnapshot.meta.description}
                    </p>
                    <div className="home-route-links">
                      <Link href={`/${pub.slug}`} className="home-route-link">
                        阅读教程
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          <p className="home-panel-kicker" style={{ marginTop: 24 }}>Sample Tutorials</p>
          <h2 className="home-panel-title">开发样例</h2>
          <div className="home-route-list">
            {tutorials.map((tutorial) => (
              <article key={tutorial.slug} className="home-route-item">
                <p className="home-route-kicker">{tutorial.slug}</p>
                <h3 className="home-route-title">{tutorial.title}</h3>
                <p className="home-route-body">{tutorial.description}</p>
                <div className="home-route-links">
                  <Link href={`/${tutorial.slug}`} className="home-route-link">
                    静态渲染
                  </Link>
                  <Link
                    href={`/${tutorial.slug}/request`}
                    className="home-route-link"
                  >
                    远程加载
                  </Link>
                  <Link
                    href={`/api/tutorials/${tutorial.slug}`}
                    className="home-route-link"
                  >
                    API Payload
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
