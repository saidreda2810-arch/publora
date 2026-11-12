# UX Audit — Current Journeys & Simplification Plan

Date: 2026-11-05 · Baseline: full codebase inspection (Navbar, App, PublisherContext, Modals, OnboardingModal, all 25 views)

## 1. Current navigation (flat, ~13 items)

Sidebar groups today: Overview → Dashboard; Content → Video Library, AI Studio, Strategist, Autopilot, Content Intelligence, Publishing Calendar, Queue, Optimizer, History(Reports), Experiments, Automations, Drive; Accounts → Connections, Brands; System → Team, Admin(conditional); plus floating actions (New Post, New Video, New Brand) in navbar.

**Problems:**
- 13+ flat items, mixed mental models (features vs destinations vs tools)
- AI features scattered as 5 separate top-level items
- "Publishing History" lives inside Reports — not discoverable
- Profile/Settings has no home (until this session's `/profile` — now exists but not in nav)
- No persistent "what's next" guidance

## 2. Current key journeys (as-built)

### J1 — First-time user
Register → auto workspace → `OnboardingModal` (multi-step, skippable, sets `settings.onboardingCompleted`) → dashboard.
**Gaps:** onboarding asks brand/video/platforms but does NOT walk through connect→upload→compose→schedule end-to-end; completion just closes modal.

### J2 — Connect social account
Sidebar → Social Connection Center → pick provider → OAuth popup → select channels → done.
**Gaps:** OAuth creds absent on this deployment → dead end; no guided path from dashboard/profile; brand must exist first (silent failure if none).

### J3 — Create & publish content
Navbar "New Post" → Compose modal: pick video (dropdown), platforms (checkboxes), title/caption/hashtags, time mode, schedule → `createPost` → appears in queue/calendar.
**Gaps:** single modal crams 5 decisions; no per-platform preview; no draft/publish-now/queue distinction in UI language; failure feedback minimal; no step progress.

### J4 — Schedule
Compose modal sets `scheduledTime` OR queue/optimizer views.
**Gaps:** no dedicated reschedule UX; timezone shown but not emphasized; duplicate-schedule prevention unclear.

### J5 — Check results
Reports view / calendar / queue show `status`.
**Gaps:** publishing is simulated client-side (posts marked published by scheduler w/o real platform calls when no OAuth) — status can say "published" with no real publish.

### J6 — Analytics
Retention Intelligence / Content Intelligence / Metric Availability — 3 overlapping views.
**Gaps:** heavy jargon ("retention curves", "metric availability matrix"); no plain-language overview; empty states weak.

### J7 — AI features
5 separate views each with own prompt UI.
**Gaps:** requires GEMINI_API_KEY (absent → errors); no guided "Generate caption" inline in compose flow.

### J8 — Profile/settings
`/profile` (new) — 9 sections, good IA already.
**Gap:** not linked from sidebar; theme/language duplicated in dropdown (acceptable).

## 3. Proposed simplified structure

### Navigation — 5 groups, ≤12 items
```
OVERVIEW      Dashboard
CONTENT       Videos · Create · Calendar · Queue · History
ACCOUNTS      Connections · Brands
INTELLIGENCE  Analytics · AI Studio · Insights (merge optimizer+strategist+automations under one "AI & Insights"?)
MANAGEMENT    Team · Workspace
SETTINGS      Profile · Admin (if permitted)
```
Concretely: keep existing tab IDs (zero backend change); reorder `navItems` into groups with collapsible headers; move Reports→"Publishing History" label; nest AI Strategist/Optimizer/Automations/Experiments under an "Insights" expandable group (progressive disclosure).

### Guided flows (no backend changes needed)
1. **Onboarding v2** — reuse `OnboardingModal`: add "connect account" + "schedule first post" CTA steps linking to real views; persist step in `settings.onboardingStep`.
2. **Unified Compose** — extend `NewPostModal` into stepped wizard: Video → Platforms → Content (with "✨ Generate caption" calling existing `/api/ai/generate-hooks`-style endpoints when key present, graceful fallback) → Review → Publish Now/Schedule/Draft. Reuses `createPost` — zero schema change.
3. **Dashboard empty-state guidance** — contextual CTAs (Connect account / Upload video / Schedule post) driven by real counts (already have data).
4. **Inline AI actions** in compose: caption/hook/hashtag buttons.

### What I will NOT do
- No new backend features, no fake "AI" when key absent (show "AI unavailable — add GEMINI_API_KEY" honestly)
- No removal of advanced views — regrouped, not deleted
- No router change — keep tab system + `/profile`

## 4. Implementation stages (on approval)
| Stage | Work | Risk |
|---|---|---|
| U1 | Restructure `navItems` into grouped/collapsible sidebar + add Profile/Settings entry | Low |
| U2 | Dashboard: primary CTA + smart empty states + trim card clutter | Low |
| U3 | Compose wizard (stepped modal reusing NewPostModal internals) | Med |
| U4 | Onboarding flow extension (connect/upload/schedule CTAs) | Med |
| U5 | Inline AI assist buttons w/ graceful no-key state | Low |
| U6 | Analytics: add plain-language Overview strip atop existing views | Low |
| U7 | Terminology sweep: Draft/Scheduled/Queued/Published labels + status pills | Low |

Awaiting approval — recommend starting U1+U2 (navigation + dashboard), which deliver the biggest clarity win with lowest risk.
