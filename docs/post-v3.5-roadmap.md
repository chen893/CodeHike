# VibeDocs Post-v3.5 Final Roadmap

**Created:** 2026-04-13
**Author:** Roadmap Arbitration Agent (integrating 6 analysis agents)
**Baseline:** v3.5 (user system + public homepage + sharing + CI/CD + snapshots)
**Status:** Final -- overrides `docs/iteration-roadmap.md` where conflicts exist

---

## 0. Executive Summary

VibeDocs has reached Late MVP with ~85% engineering completeness but only ~15% product validation. The system works end-to-end but has zero user data, near-zero discoverability, and AI generation reliability at roughly 50/100. This roadmap resolves the conflicts between growth, reliability, and user-validation priorities by choosing a **"measure first, build second"** strategy: embed instrumentation immediately, validate with real users in parallel, and only then invest in discovery and retention.

**Key decision:** Every version must ship telemetry AND at least one user-facing improvement. We do not do "infrastructure-only" releases.

---

## 1. Consensus Points (All 6 Agents Agree)

These points are non-negotiable foundations:

1. **Instrumentation is the #1 prerequisite.** Without knowing who visits, what they do, and where they drop off, all subsequent decisions are speculation. (Agents 2, 4, 6)
2. **AI generation reliability is the product's lifeblood.** If the core value proposition -- "60 seconds to a readable tutorial" -- fails half the time, no amount of discoverability or retention work matters. (Agents 1, 3, 6)
3. **Real user testing is more valuable than any engineering sprint.** 15 real users (5 creators + 10 readers) in the first two weeks will teach more than months of speculative development. (Agent 6, supported by Agents 1 and 3)
4. **The rendering pipeline is frozen.** Assembler, TutorialScrollyDemo, and the DSL are fixed infrastructure. No rewrites. (Agents 1, 2)
5. **Large-source chunking, real-time collaboration, and platform features must be deferred.** None have validated demand; all carry high architectural cost. (Agents 2, 5, 6)
6. **PostgreSQL-native tooling only.** No Elasticsearch, no Redis, no new infrastructure dependencies. Full-text search via `ts_vector` + `pg_trgm`. (Agent 2)
7. **Server-side telemetry.** Events recorded in Server Components and Route Handlers, not client-side JS. (Agents 2, 4)

---

## 2. Conflict Resolutions

### Conflict 1: AI Reliability vs. Instrumentation Priority

| Position | Agent | Argument |
|----------|-------|----------|
| AI reliability is P0, do it first | Agent 3 | Product value depends on it; no point driving traffic to a broken experience |
| Instrumentation is P0, do it first | Agent 4 | Without data, you cannot measure whether reliability improvements actually help |
| Instrumentation is a hidden prerequisite for everything | Agent 6 | Even reliability improvements need baseline data to validate |

**Ruling: Instrumentation and AI reliability run in parallel within v3.6.** Instrumentation is a 2-3 day task (3 events + 1 table). AI reliability is a 5-7 day task. They are independent work streams. The version ships when both are done. Instrumentation goes first within the version because it takes less time and immediately starts collecting data that will validate the AI reliability improvements.

**Rationale:** This is not an either/or choice. They are orthogonal concerns. Instrumentation requires a schema change and 3 server-side calls. AI reliability requires prompt/pipeline changes. One developer can ship both in a single sprint. The real risk is shipping AI improvements without being able to measure their impact -- which instrumentation solves.

### Conflict 2: Timing of Tutorial Discovery

| Position | Agent | Argument |
|----------|-------|----------|
| Discovery should come early (v3.6-B) | Agent 4 | Discovery is the primary acquisition channel; earlier is better |
| Discovery is premature before enough content exists | Agent 3 | An empty discovery page is worse than no discovery page |
| Discovery depends on instrumentation data | Agent 6 | Cannot measure discovery effectiveness without events |

**Ruling: Discovery stays in v3.7, not earlier.** v3.6 ships instrumentation + CTA + sitemap. v3.7 builds discovery on top of that foundation. The "empty city" problem is mitigated by seeding 5-10 high-quality sample tutorials before the discovery page launches.

**Rationale:** Agent 3's "empty city" argument is correct but not fatal -- a curated discovery page with 10-20 tutorials is viable. Agent 4's urgency is valid but premature without sitemap and instrumentation. Agent 6's dependency chain is the binding constraint. The compromise: v3.6 includes a lightweight "browse tutorials" link on the homepage (pointing to existing tutorial list), and v3.7 invests properly in `/explore`, tags, and search.

### Conflict 3: Editor Simplification

| Position | Agent | Argument |
|----------|-------|----------|
| Editor simplification is P0 | Agent 3 | The editing experience is overwhelming for new users |
| Not listed in near-term versions | Agent 5 | Other priorities take precedence |
| Depends on AI reliability | Agent 6 | If generation is unreliable, users spend more time editing by necessity |

**Ruling: Editor simplification is absorbed into v3.6 and v3.8, not a standalone effort.** v3.6 includes "empty state guidance" and "first-time template enhancement" (lightweight onboarding improvements). v3.8 includes the full new-user guidance flow. No dedicated "editor simplification" version.

**Rationale:** The editor is complex because the DSL is complex. Simplifying the editor without changing the DSL is cosmetic. The most impactful simplification is making AI generation more reliable (reducing the need for manual editing) and providing better templates (reducing blank-page anxiety). Both are addressed within existing version scopes. If user testing reveals specific editor pain points, they become hotfix items, not version themes.

### Conflict 4: Real User Testing vs. Continued Development

| Position | Agent | Argument |
|----------|-------|----------|
| Find 15 users before writing more code | Agent 6 | Zero data makes all engineering speculative |
| Continue with planned versions | Agent 5 | Roadmap momentum, features bring users |
| This is a false dichotomy | (synthesis) | User testing and development can overlap |

**Ruling: User testing runs concurrently with v3.6, not instead of it.** v3.6 is a 1-2 week sprint. During that sprint, the developer simultaneously recruits 5-10 users for informal testing. The user testing is not a blocking prerequisite -- it is a parallel learning stream that informs v3.7+ decisions.

**Rationale:** Stopping development entirely to find users is impractical for a solo project -- there is no one else to maintain momentum. But shipping v3.6 without any user feedback is equally wasteful. The compromise: v3.6 is small enough (1-2 weeks) that it can ship while user outreach happens. By the time v3.6 ships, there should be initial user feedback to validate or redirect v3.7. If user testing reveals fundamental product-market fit problems, the v3.7+ roadmap can be adjusted before significant investment.

**Specific actions:**
- Week 1 of v3.6: Ship instrumentation. Reach out to 5-10 developers (personal network, Twitter/X, Discord communities).
- Week 2 of v3.6: Ship AI reliability improvements. Conduct 3-5 user sessions with the instrumented product.
- End of v3.6: Review user data + feedback. Decide whether to proceed with v3.7 as planned or pivot.

---

## 3. Final Roadmap

### Version Timeline Overview

```
v3.5 [DONE] Productization & external readiness
  |
  v
v3.6 [DONE] Measure + Reliability + CTA + Sitemap + Export
  |   Retrospective: docs/v3.6-retrospective.md
  |   Gate: Review user data before proceeding
  v
v3.7 [1-2 weeks] Discovery + Tags + Search + Creator Profiles + Admin Dashboard
  |   Gate: Verify discovery page has >= 15 tutorials (seeded + organic)
  v
v3.8 [1-2 weeks] Activation + Retention + Dashboard + Notifications
  |   Gate: Verify weekly active users trending up
  v
v4.0 [2-3 weeks] Series + Multi-language + Collaboration basics
```

---

### v3.6 -- Measure, Reliability, and Seed Growth

**Motto:** "From deployable to measurable"

**Timeline:** 1-2 weeks

**Core Problem:** The product is live but invisible -- no data, no measurement, no feedback loop. AI generation fails too often. Readers have no path to becoming creators.

#### Scope

**Track A: Instrumentation (P0, days 1-3)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.6.A1 | Analytics infrastructure | `lib/monitoring/analytics.ts` | Lightweight server-side event recording function `trackEvent(event, userId?, payload?)` |
| 3.6.A2 | Events table | DB migration | `events` table: `id uuid`, `event varchar(64)`, `userId uuid?`, `payload jsonb`, `createdAt timestamptz`. No indexes initially. |
| 3.6.A3 | Core events (3) | -- | `tutorial_viewed`, `tutorial_created`, `cta_clicked` |
| 3.6.A4 | View tracking | `app/[slug]/page.jsx` | Server-side `trackEvent('tutorial_viewed', ...)` with slug + referrer in payload |
| 3.6.A5 | Creation tracking | creation flow | `trackEvent('tutorial_created', ...)` with source (template/blank) + generation outcome |
| 3.6.A6 | CTA tracking | CTA components | `trackEvent('cta_clicked', ...)` with source slug + destination |

**Track B: AI Reliability (P0, days 3-7)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.6.B1 | Patch auto-fix | `lib/ai/patch-auto-fix.ts` | When `find` fails, attempt fuzzy matching: trim leading/trailing whitespace, normalize internal whitespace. Only apply if result is unique match. |
| 3.6.B2 | Post-generation validation loop | `lib/ai/multi-phase-generator.ts` | After step-fill, run patch validation. On failure: auto-fix attempt -> retry once -> soft-fail (mark step, don't block). |
| 3.6.B3 | Source preprocessor | `lib/ai/source-preprocessor.ts` | When source exceeds threshold (~2000 LOC), auto-truncate non-primary files. Keep primary file complete + signatures + comments from secondary files. |
| 3.6.B4 | Reliability metrics dashboard (admin) | `app/admin/metrics/page.tsx` | Simple SQL query page: generation success rate, patch failure rate, auto-fix success rate. No auth (internal tool). |

**Track C: Growth Seeds (P1, days 7-10)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.6.C1 | Reading-end CTA | `components/tutorial/create-cta.tsx` | Card at tutorial bottom: "Create your own tutorial from source code" with ref-tracked link to `/new?ref=cta&source={slug}` |
| 3.6.C2 | Sitemap | `app/sitemap.ts` | `generateSitemaps()` from DB published tutorials. Standard XML. |
| 3.6.C3 | robots.txt | `app/robots.ts` | Allow all crawlers, reference sitemap. |
| 3.6.C4 | Export Markdown | `lib/services/export-markdown.ts` + route | Convert TutorialDraft to downloadable CommonMark (code blocks + headings + paragraphs). |
| 3.6.C5 | Export HTML | `lib/services/export-html.ts` + route | Standalone HTML with inline CSS + syntax highlighting. No external deps. |

#### Dependencies

- v3.5 user system (event tracking needs userId)
- v3.5 monitoring infrastructure (`lib/monitoring/metrics.ts` extensible)
- v3.5 public pages (sitemap covers published tutorials)

#### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Events table grows unbounded | Query slowdown | Estimate < 1000 events/day initially. Add 90-day TTL cleanup in v3.7. |
| Patch auto-fix introduces false matches | Tutorial content corruption | Only trim + whitespace normalization. Require unique match after fix. Log all auto-fixes for review. |
| Source preprocessor drops critical code | Generation quality regression | Conservative truncation: primary file always complete. Secondary files keep signatures + exports. |
| Admin metrics page has no auth | Information leak | Internal-only tool. Add basic auth in v3.7 if needed. |

#### Success Criteria

- [ ] 3 events tracked and queryable in `events` table
- [ ] AI generation success rate improved by >= 10% (measured via `generationQuality` data)
- [ ] Reading-end CTA live, click events tracked
- [ ] Sitemap submitted to Google Search Console
- [ ] At least 1 export format (Markdown) functional
- [ ] At least 3 user testing sessions completed with notes
- [ ] Total sprint time <= 2 weeks

#### Gate Decision (end of v3.6)

Before starting v3.7, answer these questions with real data:

1. Is AI generation success rate >= 70%? If not, v3.7 scope shifts toward reliability.
2. Are any users organically finding and viewing published tutorials? If not, acquisition strategy needs rethinking.
3. Did user testing reveal fundamental UX problems? If yes, address in v3.7 before building discovery.

---

### v3.7 -- Discovery, Tags, and Creator Identity

**Motto:** "From shareable to discoverable"

**Timeline:** 1-2 weeks

**Core Problem:** Published tutorials are only accessible via direct links. No browse, no search, no categorization. This is the primary bottleneck for user acquisition.

#### Prerequisites (must be met before starting)

- v3.6 instrumentation live with >= 3 days of data
- Sitemap indexed by at least 1 search engine
- At least 15 published tutorials available (seeded sample tutorials + any organic content)
- v3.6 gate questions answered affirmatively

#### Scope

**Track A: Browse and Discover (P0)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.7.A1 | Explore page `/explore` | `app/explore/page.tsx` | Server Component. Card grid: title, description, language tag, step count, estimated read time. Pagination (20/page). |
| 3.7.A2 | Homepage discovery entry | `app/page.tsx` | Add "Browse all tutorials" link or search bar pointing to `/explore`. |
| 3.7.A3 | Sort options | `/explore` | Default: newest. Optional: most viewed (from events data). |
| 3.7.A4 | Explore tracking | `app/explore/page.tsx` | `trackEvent('explore_viewed')` with filter params. Track click-through to individual tutorials. |

**Track B: Tag System (P0)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.7.B1 | Tag data model | DB migration | `tutorial_tags` table (id, name unique, slug unique, createdAt). `tutorial_tag_relations` table (tutorialId, tagId, unique constraint). |
| 3.7.B2 | AI tag generation | `lib/ai/tag-generator.ts` | On publish: lightweight prompt generates 3-5 tags from tutorial title + description + code language. Uses existing provider-registry. |
| 3.7.B3 | Tag editing UI | draft workspace | Creator can add/remove tags before and after publishing. |
| 3.7.B4 | Tag-based filtering | `/explore?tag=...` | URL param filter. Server-side query with JOIN. |
| 3.7.B5 | Tag browse page | `/tags` | List all tags with tutorial count. Click to `/explore?tag=...`. |

**Track C: Search (P1)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.7.C1 | Full-text search | `lib/repositories/tutorial-search.ts` | PostgreSQL `ts_vector` on title + description. GIN index. `simple` tokenizer (upgrade to `pg_trgm` for Chinese later). |
| 3.7.C2 | Language filter | `/explore?lang=...` | Filter by programming language derived from tutorial metadata. |

**Track D: Creator Profiles (P1)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.7.D1 | User public profile | `app/@username/page.tsx` | Avatar + display name + bio + published tutorial cards. Requires `users.username` field (nullable). |
| 3.7.D2 | Username setup | profile settings | Prompt user to set username on first publish. Unique validation. |
| 3.7.D3 | Profile editing | profile page | Edit display name, bio, avatar (GitHub avatar as default). |

#### Dependencies

- v3.6 events table (measure discovery page effectiveness)
- v3.6 sitemap (search engine indexing)
- v3.5 public homepage (existing tutorial list to enhance)
- >= 15 published tutorials (avoid empty city problem)

#### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| < 15 published tutorials at launch | Empty, unconvincing discovery page | Seed 5-10 high-quality sample tutorials before launch. Design layout that looks good with few items. |
| AI-generated tags are inconsistent | Tag fragmentation | Allow manual editing. Use controlled vocabulary prompt (suggest from existing tags). |
| Chinese text search is poor | Bad user experience for Chinese tutorials | Use `pg_trgm` trigram matching as fallback. Full `zhparser` is v4.0 scope. |
| Username squatting | Namespace conflicts | First-come-first-served. Reserve obvious abuse patterns. Low priority for MVP. |

#### Success Criteria

- [ ] `/explore` page live with filtering by tag and language
- [ ] Tag system operational on new and existing tutorials
- [ ] Basic search returns relevant results for title/description queries
- [ ] Creator profiles accessible at `/@username`
- [ ] v3.6 event data shows `/explore` generating tutorial views and creation conversions
- [ ] Total sprint time <= 2 weeks

---

### v3.8 -- Activation, Retention, and Feedback Loops

**Motto:** "From one visit to repeat engagement"

**Timeline:** 1-2 weeks

**Core Problem:** Even with discovery bringing traffic, the activation funnel is unoptimized. Users arrive, maybe view a tutorial, and leave. Creators publish once and never return. v3.8 builds the feedback loops that convert visitors to creators and one-time creators to repeat creators.

#### Prerequisites

- v3.7 discovery page live and generating measurable traffic
- v3.6 event data showing at least basic activation funnel data
- User testing feedback from v3.6 incorporated into plan

#### Scope

**Track A: New User Onboarding (P0)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.8.A1 | First-login walkthrough | `components/onboarding/` | 2-3 step non-blocking overlay: (1) "Paste your source code" (2) "Describe what you want to teach" (3) "Preview and publish". Dismissible. `localStorage` tracks completion. |
| 3.8.A2 | Empty state guidance | `/drafts` page | When draft list is empty: show guided card with "Try with sample code" shortcut (pre-filled template). Replace blank page. |
| 3.8.A3 | Template gallery | `/new` page | 2-3 preset templates beyond the existing Redux example: (1) React component (2) Express API route (3) Python script. Different languages to reduce decision paralysis. |
| 3.8.A4 | Onboarding tracking | events | `onboarding_started`, `onboarding_completed`, `template_used` events. |

**Track B: Creator Dashboard (P1)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.8.B1 | Analytics dashboard | `app/dashboard/page.tsx` | Per-tutorial: view count, CTA click count, creation conversion count. Aggregated from v3.6 events table. Server Component. |
| 3.8.B2 | Draft continuation prompt | `/drafts` list | Highlight unpublished drafts with "Continue editing" badge. Sort by last modified. |
| 3.8.B3 | Dashboard access | navigation | Add "Dashboard" link in AppShell sidebar for authenticated users. |

**Track C: Notification Basics (P1)**

| ID | Capability | Files | Description |
|----|-----------|-------|-------------|
| 3.8.C1 | Notifications table | DB migration | `notifications` (id, userId, type, payload jsonb, read boolean, createdAt). Index on userId + read. |
| 3.8.C2 | Milestone notifications | service | Tutorial reaches 50/100/500 views -> create notification. Triggered on `tutorial_viewed` event count check. |
| 3.8.C3 | Notification bell | `components/notifications/` | Bell icon in header with unread count badge. Dropdown list of recent notifications. |
| 3.8.C4 | Email digest (optional) | integration | Weekly email via Resend: "Your tutorials were viewed N times this week." Only if `RESEND_API_KEY` is configured. Does not block version. |

#### Dependencies

- v3.6 event data (dashboard aggregates from events)
- v3.5 user system (identify new vs. returning users)
- v3.7 discovery page (traffic source for new users)

#### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Onboarding feels intrusive | User drops off | Must be skippable, non-modal, and completable in < 30 seconds. Never block the user. |
| Dashboard shows zeros | Looks broken, demotivating | Replace zeros with encouraging micro-copy. "Your first tutorial is waiting!" not "0 views." |
| Notification volume is low | Feature feels dead | Only ship milestones (not every view). Ensure sample tutorials generate baseline activity. |
| Email service adds deployment complexity | Blocks ship | Make email strictly optional. Feature-detect `RESEND_API_KEY`. |

#### Success Criteria

- [ ] New user walkthrough live, completion tracked in events
- [ ] Empty state replaced with guided content
- [ ] Creator dashboard shows per-tutorial analytics
- [ ] At least 1 notification type firing (view milestone)
- [ ] v3.6-v3.7 event data shows improved activation rate (benchmark against v3.6 data)
- [ ] Total sprint time <= 2 weeks

---

### v4.0 -- Advanced Creation and Platform Foundation

**Motto:** "From single tutorials to a creation platform"

**Timeline:** 2-3 weeks (may split into v4.0 + v4.1 if scope exceeds 3 weeks)

**Core Problem:** Single-tutorial creators hit a ceiling. They want series, language variants, team collaboration, and richer export. These features separate a "nice tool" from a "platform you depend on."

#### Prerequisites

- v3.6-v3.8 growth loop operational (measurable traffic, activation, retention)
- At least 30 published tutorials from >= 5 different creators
- v3.8 dashboard data confirms repeat creator behavior
- User feedback specifically requesting advanced features

**IMPORTANT:** v4.0 should only proceed if v3.6-v3.8 data validates product-market fit. If activation/retention metrics are poor, invest in v3.6-v3.8 improvements instead.

#### Scope

**Track A: Tutorial Series (P0)**

| ID | Capability | Description |
|----|-----------|-------------|
| 4.0.A1 | Series data model | `tutorial_series` table (id, userId, title, description, slug, createdAt). `series_items` (seriesId, tutorialId, sortOrder). New migration. |
| 4.0.A2 | Series CRUD | Create series, add/remove tutorials, reorder. New service + repository. |
| 4.0.A3 | Series reading page | `/series/[slug]`: table of contents + first tutorial. Previous/next navigation. |

**Track B: Multi-language Generation (P0)**

| ID | Capability | Description |
|----|-----------|-------------|
| 4.0.B1 | Language variant model | `published_tutorials.language` field. Same slug, different language versions. |
| 4.0.B2 | AI re-generation for language | Generate tutorial prose in target language, keeping source code and patches identical. |
| 4.0.B3 | Language switcher UI | Reading-end and discovery UI for switching tutorial language. |

**Track C: Export Enhancement (P1)**

| ID | Capability | Description |
|----|-----------|-------------|
| 4.0.C1 | PDF export | Via `@vercel/og` or external API (Puppeteer not viable on serverless). May use HTML export + print stylesheet as fallback. |
| 4.0.C2 | Markdown import | Parse CommonMark to tutorial draft DSL (reverse engineering). Best-effort, not lossless. |

**Track D: Collaboration Basics (P1)**

| ID | Capability | Description |
|----|-----------|-------------|
| 4.0.D1 | Share-by-link editing | Owner generates invite link. Invitee gets "editor" role. No real-time sync -- simple share + edit. |
| 4.0.D2 | Comment system | `comments` table. Readers comment on tutorial steps. Display in reading view. Threading deferred. |

**Track E: Platform Features (P2 -- scope may drop to v4.1)**

| ID | Capability | Description |
|----|-----------|-------------|
| 4.0.E1 | Ratings | 1-5 star rating + short text review. Display on tutorial cards and reading page. |
| 4.0.E2 | Bookmarks | Save tutorials. Show in user profile. |
| 4.0.E3 | Template marketplace | Share templates publicly. Browse and use others' templates. |

#### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Series data model requires careful migration | Regression in existing features | Foreign keys only; no changes to TutorialDraft structure. |
| Multi-language doubles AI cost | Budget overrun | Generate on demand, not automatically. |
| PDF export fails on Vercel serverless | Feature unavailable | Fallback to HTML + print CSS. Consider external PDF service for v4.1. |
| Collaboration introduces permission bugs | Security issues | Start with simple invite links + role enum. No public collaboration. Audit access in middleware. |

#### Success Criteria

- [ ] Tutorial series can be created, browsed, and read sequentially
- [ ] At least 1 tutorial has a working language variant
- [ ] PDF or enhanced HTML export available
- [ ] Invite-link collaboration works for editor role
- [ ] Total sprint time <= 3 weeks (split if needed)

---

## 4. Explicit Non-Goals (v3.6 -- v4.0)

These items are **not** being built. They are listed here to prevent scope creep.

| Item | Why Not |
|------|---------|
| Real-time collaborative editing | Requires WebSocket + OT/CRDT. Architectural cost 10x any feature in this roadmap. No validated demand. |
| Large-source AST-based chunking | Chicken-and-egg: needs large-source users to validate, but no large-source users exist. Mitigate with large-context models instead. |
| Payment / subscription / monetization | Business model unvalidated. No user base to monetize. |
| Mobile native app / PWA | Core creation scenario is desktop. Mobile reading already handled by responsive layout. |
| Full platform marketplace | Requires 100+ tutorials and active community. Premature by years. |
| Adaptive learning / personalization | Requires massive user behavior data. Far future. |
| Interactive exercise generation | Beyond current AI reliability ceiling. |
| Deep SEO (Schema.org, rich snippets) | Basic SEO (sitemap + meta) first. Optimize after traffic data exists. |
| Third-party analytics (GA, Mixpanel, Amplitude) | Self-built events are sufficient for current scale. Revisit at 10K+ events/day. |
| GraphQL API | REST is adequate for current endpoint count. No over-fetching problem. |
| i18n for UI strings | Creation flow supports Chinese + English content. UI chrome stays in English initially. |
| Multiple AI model selection UI | v3.4 already has provider-registry. Exposing model choice to users adds complexity without clear value. Let the system pick the best model. |
| Style template proliferation | 3 templates is enough to start. More templates without user data is speculative. |
| Version snapshot browsing UI | Snapshots are stored (v3.5) but browse/compare UI is low priority. |
| Remote tutorial loading path (`/[slug]/request`) | Secondary consumption path. Focus on primary static path. |

---

## 5. Hypothesis Validation Checklist

Each version MUST validate specific hypotheses before the next version proceeds. If a hypothesis fails, the roadmap must be adjusted.

### v3.6 Hypotheses

| # | Hypothesis | How to Validate | Success Threshold | Failure Action |
|---|-----------|----------------|-------------------|----------------|
| H1 | AI generation can reach >= 70% success rate with auto-fix | Track `generationQuality` before/after auto-fix deployment | >= 70% of generations produce valid tutorials | Invest another sprint in reliability before v3.7 |
| H2 | Readers will click a CTA to create their own tutorial | Track `cta_clicked` events | >= 2% of tutorial viewers click CTA | Redesign CTA placement/copy in v3.7 |
| H3 | Instrumentation works reliably at low volume | Verify events table has no gaps, duplicates < 1% | Events match server logs | Fix instrumentation bugs before v3.7 |
| H4 | Users can complete the creation flow without help | User testing: 3+ users complete creation | >= 2 of 3 users complete without assistance | Improve onboarding in v3.8 |

### v3.7 Hypotheses

| # | Hypothesis | How to Validate | Success Threshold | Failure Action |
|---|-----------|----------------|-------------------|----------------|
| H5 | Users will browse the discovery page organically | Track `explore_viewed` events from non-direct traffic | >= 10 organic explore views/week | Invest in SEO + content seeding |
| H6 | Tags improve tutorial findability | Track click-through from tag-filtered views | >= 30% of explore views use tag filters | Simplify tag UI or reduce tag count |
| H7 | Search returns useful results | User testing: find specific tutorial via search | >= 2 of 3 users find target tutorial | Improve search ranking or add autocomplete |

### v3.8 Hypotheses

| # | Hypothesis | How to Validate | Success Threshold | Failure Action |
|---|-----------|----------------|-------------------|----------------|
| H8 | Onboarding improves first-creation rate | Compare creation rate pre/post onboarding | >= 20% improvement in new-user creation rate | Iterate on onboarding flow |
| H9 | Dashboard drives repeat creation | Track return visits by dashboard users | >= 30% of dashboard viewers create another tutorial within 7 days | Rethink retention strategy |
| H10 | Milestone notifications drive return visits | Track notification-triggered visits | >= 10% of notifications result in a return visit within 48h | Adjust notification thresholds or format |

### v4.0 Hypotheses

| # | Hypothesis | How to Validate | Success Threshold | Failure Action |
|---|-----------|----------------|-------------------|----------------|
| H11 | Series are used by repeat creators | Track series creation rate | >= 20% of repeat creators build at least 1 series | Deprioritize series, focus on single-tutorial quality |
| H12 | Multi-language generation is valuable | Track language variant views | >= 10% of tutorial views are non-primary language | Scale back multi-language investment |

---

## 6. Abort Conditions

The following conditions should trigger a **full roadmap review** (not necessarily abandonment, but a pause-and-reassess):

### Red Lines (Stop Immediately)

1. **AI generation success rate stays below 60% after v3.6 reliability improvements.** If the core value proposition cannot be made reliable, the product hypothesis may be wrong. Pivot or fundamentally rethink the approach.

2. **Zero organic discovery traffic after v3.7 launch + 3 weeks.** If neither search engines nor word-of-mouth drive any traffic to `/explore`, the acquisition model is broken. Re-evaluate positioning, target audience, or go-to-market strategy.

3. **No user completes the creation flow during v3.6 user testing.** If real users cannot produce a publishable tutorial with assistance, the UX is fundamentally broken. Stop feature development and redesign the creation flow.

### Yellow Lines (Adjust Roadmap)

4. **Activation rate below 5% after v3.8 onboarding.** Not fatal, but suggests the product does not resonate with arriving users. Pivot acquisition channel or simplify the product further.

5. **Fewer than 5 active creators after v3.8.** Indicates the creator value proposition needs work. Invest in creator experience before building platform features (v4.0).

6. **Creator churn > 80% within 30 days.** Users try once and don't return. The product lacks stickiness. Investigate what would make them dependent on it.

### Green Light (Accelerate)

7. **K > 0.3 (viral coefficient).** If organic sharing exceeds expectations, accelerate growth features (better sharing, embed improvements) and deprioritize retention mechanics.

8. **> 50 published tutorials from > 10 creators within 4 weeks of v3.7.** Product-market fit signal. Consider bringing v4.0 forward and investing in platform features sooner.

---

## 7. Appendix: Architecture Constraints Reminder

These constraints are binding across all versions:

- **Rendering pipeline is frozen.** `TutorialScrollyDemo`, assembler, and DSL are fixed infrastructure.
- **AI SDK v6 API.** Use `maxOutputTokens` (not `maxTokens`). Use `@ai-sdk/openai-compatible` (not `@ai-sdk/openai`).
- **JS/TS coexistence.** Rendering chain is JS. New features are TS. Do not unify.
- **No client-side patch computation.** All patches, highlighting, focus/marks applied server-side.
- **Layer discipline.** Pages/APIs call services. Services call repositories. No cross-layer calls.
- **Client requests through feature clients.** No raw `fetch()` in view components.
- **Generation takes 30-60 seconds.** Design for progress feedback and timeout handling.
- **PostgreSQL-only search.** `ts_vector` + `pg_trgm`. No Elasticsearch.
- **Server-side telemetry.** Events recorded in Server Components and Route Handlers.
- **DeepSeek 8192 token hard limit.** Work within it. Source preprocessing (3.6.B3) is the mitigation strategy.
- **Solo developer project.** Every version must be shippable by one person in 1-2 weeks. If scope exceeds this, cut scope, not extend timeline.

---

## 8. Relationship to Other Documents

| Document | Relationship |
|----------|-------------|
| `docs/iteration-roadmap.md` | Superseded by this document for v3.6+ planning. Retained as historical reference for v3.3-v3.5 scope. |
| `docs/vibedocs-technical-handbook.md` | Authoritative technical reference. This roadmap references but does not duplicate its content. |
| `docs/tutorial-data-format.md` | DSL specification. All features in this roadmap work within this format. |
| `docs/v3-implementation-issues.md` | Active issue log. New issues discovered during implementation must be recorded here. |
| `AGENTS.md` | Project-level conventions. Takes precedence over any conflicting guidance in this document. |
