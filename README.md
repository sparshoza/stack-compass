# Stack Compass

Stack Compass recommends a full stack for the project you describe: one tool per layer your project needs (backend, database, auth, payments, hosting and so on), each with the reason it won, the close tools it beat and what to watch for. The answer lights up as a path on an interactive map of 307 tools across 22 layers, which you can also browse on its own. Everything runs in your browser from a hand-checked catalog. There is no backend and no model; the same answers always give the same stack, and a link reproduces it.

![Stack Compass with a recommended SaaS stack lit on the map: FastAPI, React, Next.js, Supabase, Stripe, Vercel and more](docs/screenshot.png)

## Run it locally

You need Python 3.12 with [uv](https://docs.astral.sh/uv/), and Node 22 with npm.

```sh
uv sync                    # Python data tools
npm --prefix web ci        # web app dependencies
npm --prefix web run dev   # http://localhost:5173
```

Production build: `npm --prefix web run build`, then `npm --prefix web run preview` (http://localhost:4173).

## How it is built

```mermaid
flowchart LR
  subgraph build["Build time"]
    yaml["data/tools/&lt;layer&gt;/*.yaml<br/>data/vocab.yaml<br/>data/keywords.yaml"]
    load["compassdata.load<br/>(Pydantic validation, cross-file rules)"]
    compile["compassdata.compile"]
    catalog["catalog/catalog.json<br/>(committed)"]
    layoutjs["web/scripts/layout.mjs<br/>(ForceAtlas2)"]
    layout["catalog/layout.json<br/>(committed)"]
    vite["Vite build"]
    dist["web/dist<br/>(static files on Vercel)"]
    links["compassdata.check_links<br/>(run by hand)"]
    yaml --> load --> compile --> catalog
    yaml --> links
    catalog --> layoutjs --> layout
    catalog --> vite
    layout --> vite
    vite --> dist
  end

  subgraph browser["In the browser"]
    text["Free text<br/>(never leaves the page)"]
    match["engine/match.ts<br/>keywords, aliases, negation"]
    answers["Answers<br/>(questions, pre-filled)"]
    layers["engine/layers.ts<br/>layer selection"]
    score["engine/score.ts<br/>hard filters, points, tie-break"]
    explain["engine/explain.ts<br/>template sentences"]
    ui["Stack list + map highlight<br/>(React, sigma.js)"]
    url["Share link<br/>engine/share.ts"]
    text --> match --> answers
    answers --> layers --> score --> explain --> ui
    answers <--> url
  end

  dist --> browser
```

- **Data tools** (Python 3.12, Pydantic v2, PyYAML, httpx, pytest): validate the YAML, compile it to one JSON file, check every link.
- **Site** (Vite, React 19, TypeScript, Tailwind CSS v4, Radix primitives, sigma.js and graphology, Vitest, Testing Library): the map, search, filters, tool panel, table view and the recommender.
- **Hosting**: static files on Vercel (`vercel.json`). No serverless functions.

More detail, including what each part does and what the tests cover: [docs/architecture.md](docs/architecture.md).

## The map

- **Layout.** `web/scripts/layout.mjs` places every tool once, at build time, so the map looks the same on every visit. Tools start from positions seeded by their id, then ForceAtlas2 settles them along the catalog's edges into one round tangle. Edges between layer families pull harder than edges inside a family, so families mix through the map instead of gathering in sectors. Tools whose names would overlap are nudged apart. `npm --prefix web run layout -- --check` fails CI when the committed file is stale.
- **Drawing.** Small dots coloured by layer family, a name centred under nearly every dot at the default zoom on a desktop screen, and thin grey edges. Hovering or opening a tool brightens its neighbours and dims the rest. A recommended stack is drawn in the accent colour with heavier edges between the picks.
- **Motion.** Short and quiet: camera, panels and popovers use transform and opacity only; the pick sequence changes colour, size and label. When a result appears, the picks light up one after another in the order they were scored, all within 480 ms. The camera glides for 280 ms to a tool you open or to frame a new stack, and stops as soon as you touch the map. The tool panel and the Help me choose sheet slide in from their own side in 200 ms and leave in 160 ms; the filters popover grows from its button; buttons give slightly when pressed. Typing, arrow keys, wheel and pinch zoom never animate. With reduced motion turned on in the system settings, every one of these changes happens at once. All durations live in `web/src/styles/tokens.css`, and a test fails on a duration written anywhere else.

## How recommendations work

1. **Describe (optional).** Your text is lowercased and split into words, and phrases from a fixed list of 166 keyword entries are found on word boundaries, longest match first. Tool names and their aliases count too, also inside a longer phrase ("a Flutter app" names Flutter). Only a backend, ORM, API-style or job-queue tool sets languages, and only when it uses at most two language families ("django" means Python, "Spring Boot" means Java and Kotlin, "NestJS" means TypeScript and JavaScript; a service with SDKs in many languages sets none); naming any other tool, such as Flutter or React, only marks it as a tool you know. A language you type yourself ("in Swift") always counts. A match with "no", "not", "without", "avoid", "except", "nothing", "don't" or a similar word up to three words before it becomes an exclusion. Filler words such as "want", "to", "use" and "in" are not counted, so "I don't want to use Node" avoids JavaScript and "nothing in Java" avoids Java. The look-back stops at commas, full stops and the words "but" and "however", so "no PHP but Python" avoids PHP and still prefers Python. An API project ("a REST API", "build an API in Go") also gets the REST API feature, unless the text names GraphQL or an API-style tool; picking API only by hand ticks it too, and you can untick it. You see what was picked up as removable chips. The text stays in the page: it is never sent anywhere and never goes into a link.
2. **Questions.** Eight one-click questions, pre-filled from step 1: project type, languages to prefer or avoid, must-have features, hosting, budget, scale, tools you already know, and whether to include dev tooling.
3. **Layers.** The project type sets its core layers (a SaaS gets frontend, meta-framework, UI kit, backend, database, ORM, auth, payments, email, job queue and hosting). Features add layers (file uploads add storage, search adds a search engine), and dev tooling adds CI/CD, observability and testing, plus a state library and a build tool when the stack has a web frontend (a mobile app or an API gets neither). A simple project gets a short list.
4. **Hard filters.** Layers are scored in a fixed order, backend first, so later layers can follow earlier picks. A tool that lists no languages (a hosted service, a database) always passes the language filters. A tool drops out, with the reason shown, when:
   - every language it uses is one you want to avoid (avoiding JavaScript also avoids TypeScript-only tools);
   - you prefer languages and none of them is in a backend, ORM, frontend, meta-framework or mobile tool (on frontend, meta-framework and mobile this applies only when some tool in the layer has a preferred language, so a Python web app still gets a frontend; TypeScript and JavaScript count as one);
   - its hosting does not match yours (managed or self-hosted), shown as "has no official managed service" when you chose managed. Libraries that run inside your app (auth libraries such as Better Auth or Devise, email libraries, in-browser search, in-process caches) are never filtered by hosting: there is no server of their own to host;
   - it is paid only and your budget is free tiers;
   - it lacks a feature you asked for in the layer that feature adds (a REST API in the API style layer, realtime in the cache layer, scheduled jobs in the job queue layer), when at least one tool in that layer has it;
   - it shares no language with the backend pick (ORM, API style, job queue) or with the backend, frontend or mobile pick (testing), so a Flutter app with no other language pick gets no browser test tool;
   - it is an auth library that runs in your app and shares no language with the backend pick (or with the frontend pick when there is no backend), or a hosted auth service with no SDK in the backend or frontend language;
   - it is a meta-framework not built on the frontend pick, or a state library or UI kit that is neither built on nor pairs with it;
   - it is built on a tool in another layer that is not that layer's pick (the Django ORM needs Django as the backend, Fluent needs Vapor);
   - it is a browser test runner (Playwright, Cypress, Selenium) and the stack has no frontend or meta-framework pick.
5. **Points.** +3 for each feature you asked for that the tool supports, +2 if you already know it, +2 for each earlier pick it pairs with, +1 for an established tool at startup or high-traffic scale, -1 for an emerging tool at high traffic, -2 for a legacy tool.
6. **Ties** go, in the testing layer, to the tool that shares the backend pick's language, then the frontend's, then the mobile's; then to the tool with more pairs-with links in the catalog, then to the alphabetically first id.
7. **Explanations** are filled-in templates, not generated text: the two biggest score items in plain words plus the tool's first "good for" line, a watch-out from its first "avoid when" line, the full score breakdown, up to two alternatives, and the close tools a hard filter removed with the reason. A layer where nothing fits says "No match" and why.
8. **Share links.** Your answers (never your text) go into the URL query, for example `?t=saas&lp=python&c=payments&h=either&b=any&s=startup&tool=1`. Opening the link recomputes the same stack. Values the link does not recognise are dropped with a notice.

## Data method and sources

- One YAML file per tool in `data/tools/<layer>/`, with its summary, licence, languages, hosting, whether it is a library that runs inside your app, pricing, maturity, what it is good for, when to avoid it, its relations to other tools, a `verified` date and its sources.
- Facts come only from each tool's official site or docs. The `verified` field is the date they were checked. When a fact could not be confirmed, the tool was left out rather than guessed.
- `compassdata.load` rejects the whole catalog, listing every problem with its file, on an unknown tag or layer, a relation to a missing tool, a one-sided "alternative to" or "pairs with" link, an alias two tools share, a keyword phrase that equals a tool name or alias, a duplicate keyword phrase, an overlong summary or a bad date.
- `compassdata.check_links` requests every tool URL, repository and source. A few hosts that refuse automated requests are allowed their known status code (listed in the script).

## Measured numbers

Measured on 2026-11-14 on Windows 11 Pro, Intel Core i7-12700H, 16 GB RAM, Python 3.12.3, Node 22.15. None of these depend on the machine except the link check, which depends on the network that day.

**Catalog size**: 307 tools across 22 layers, 166 keyword entries. Command: `uv run python -m compassdata.stats`. The feature list (23 capabilities) is in `data/vocab.yaml`.

| Layer | Tools | Layer | Tools |
| --- | --- | --- | --- |
| backend | 16 | storage | 14 |
| frontend | 13 | payments | 14 |
| meta-framework | 13 | email | 14 |
| mobile | 13 | cms | 13 |
| database | 13 | state | 12 |
| orm | 20 | ui-kit | 14 |
| api-style | 12 | build-tool | 13 |
| auth | 15 | hosting | 15 |
| cache | 11 | ci-cd | 14 |
| jobs-queue | 14 | observability | 14 |
| search | 13 | testing | 17 |

**Golden set**: 41 of 41 cases pass (100%). Each case is a written project description with checks on the result, for example "backend language is Python", "payments pick is Stripe", "no PHP tool picked". Cases are in `web/src/engine/golden.cases.ts`. Command: `npm --prefix web run golden` (45 tests: the 41 cases plus 4 checks on the set itself).

**Tests**: 69 Python tests (`uv run pytest`) and 385 web tests in 27 files (`npm --prefix web test -- --run`), all passing.

**Links**: 1046 URLs checked, 0 failed. Command: `uv run python -m compassdata.check_links`

## Suggest an edit

Open a tool on the map and choose **Suggest an edit**, or use **Report an issue** in the corner. Both open a pre-filled GitHub issue that asks which fact is wrong and for a link to the official page that says otherwise. To change the data yourself: edit the tool's YAML file, run `uv run python -m compassdata.compile` and `npm --prefix web run layout`, check that `uv run pytest` and `npm --prefix web test -- --run` pass, and open a pull request.

## Limitations

- Keyword matching misses unusual phrasing. If your description says "a place for people to swap sourdough starters", nothing is recognised and the questions do the work.
- The catalog is a curated subset of 307 tools, chosen as mainstream picks plus some notable newcomers. A good tool missing from it can never be recommended.
- Scores are simple sums, and ties are broken (after the testing language order) by how many pairs-with links a tool has in the catalog, which favours well-connected tools over niche ones.
- Naming a tool can set two languages at once ("Spring Boot" prefers Java and Kotlin). The preference also steers the frontend, meta-framework and mobile layers when one of their tools uses it, so a mobile app with a Spring Boot backend gets a Kotlin mobile framework rather than a cross-platform JavaScript one.
- There is no live data: no GitHub stars, download counts or latest versions. Facts are as of each tool's `verified` date.
- The map is built for a desktop screen. On a phone it works with pinch and tap, but the table view is easier to read.

## Roadmap

Planned, not built yet:

- Live GitHub stars and latest versions, fetched at build time with a weekly scheduled rebuild.
- More tools in every layer.
- A preview image for each shared result, so a link shows the stack it holds.

## Credit

The map layout and interaction style are inspired by [WhichDB](https://whichdb.dev/), an interactive map of databases. No code, assets or data are taken from it.
