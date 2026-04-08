import Link from "next/link"
import { listTutorials } from "../lib/tutorial-registry"

export const metadata = {
  title: "Tutorial Renderer",
  description: "A generic CodeHike tutorial renderer with static and remote routes.",
}

export default function Page() {
  const tutorials = listTutorials()

  return (
    <main className="home-page">
      <section className="home-grid">
        <aside className="home-hero">
          <div>
            <p className="home-kicker">Generic Renderer</p>
            <h1 className="home-title">A reusable app for scrolly tutorials.</h1>
            <p className="home-body">
              这个分支只保留通用渲染层、动态路由和一份中性的 sample
              数据。后续要接入真实教程，只需要替换注册表和接口来源。
            </p>
          </div>

          <div className="home-footnote">
            <p>Core routes</p>
            <p>
              <code className="home-inline-code">/[slug]</code> for static
              rendering
            </p>
            <p>
              <code className="home-inline-code">/[slug]/request</code> for
              client-side fetching
            </p>
            <p>
              <code className="home-inline-code">/api/tutorials/[slug]</code>{" "}
              for payload delivery
            </p>
          </div>
        </aside>

        <section className="home-panel">
          <p className="home-panel-kicker">Available Samples</p>
          <h2 className="home-panel-title">Start from a neutral sample dataset.</h2>
          <div className="home-route-list">
            {tutorials.map((tutorial) => (
              <article key={tutorial.slug} className="home-route-item">
                <p className="home-route-kicker">{tutorial.slug}</p>
                <h3 className="home-route-title">{tutorial.title}</h3>
                <p className="home-route-body">{tutorial.description}</p>
                <div className="home-route-links">
                  <Link href={`/${tutorial.slug}`} className="home-route-link">
                    Static Page
                  </Link>
                  <Link
                    href={`/${tutorial.slug}/request`}
                    className="home-route-link"
                  >
                    Remote Page
                  </Link>
                  <a
                    href={`/api/tutorials/${tutorial.slug}`}
                    className="home-route-link"
                  >
                    API Payload
                  </a>
                </div>
              </article>
            ))}
          </div>

          <section className="home-notes">
            <p className="home-panel-kicker">How To Extend</p>
            <p className="home-route-body">
              Add a new tutorial data file, register its slug in{" "}
              <code className="home-inline-code">lib/tutorial-registry.js</code>
              , and both static and remote routes will pick it up automatically.
            </p>
            <p className="home-route-body">
              The renderer expects the content format documented in{" "}
              <code className="home-inline-code">docs/tutorial-data-format.md</code>
              .
            </p>
          </section>
        </section>
      </section>
    </main>
  )
}
