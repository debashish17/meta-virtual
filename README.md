<a id="readme-top"></a>

[Contributors][contributors-url]
[Forks][forks-url]
[Stargazers][stars-url]
[Issues][issues-url]

<div align="center">
  <h3 align="center">Virtual Office</h3>

  <p align="center">
    A shared 3D office where meetings update the team's records, and the office answers with receipts.
    <br />
    <a href="https://meta-virtual-office.vercel.app"><strong>Open the live demo »</strong></a>
    <br />
    <br />
    <a href="docs/DEMO_SCRIPT.md">3-minute demo script</a>
    &middot;
    <a href="https://github.com/debashish17/meta-virtual/issues">Report Bug</a>
    &middot;
    <a href="https://github.com/debashish17/meta-virtual/issues">Request Feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

[![The whole Virtual Office floor][product-screenshot]](https://meta-virtual-office.vercel.app)

Walk into a shared 3D office with your team. Check in and your avatar walks to
your desk; book the Acme room and your colleague gets the invite live. Hold the
meeting there and its transcript becomes proposed updates to real records —
tasks, milestones, commitments — which a teammate approves or rejects. Every
approval leaves a **receipt**: who changed what, from which meeting, and who
signed it off. Then ask the office anything — *"my day"*, *"status of project
X"*, *"what's going on with Acme"* — and get an answer that cites its records,
or an honest *"I don't have a record of that"* when nothing is on file.

Why this shape:

* **Meetings are the write path.** The office is where operational truth gets
  updated, not a dashboard that mirrors it late.
* **Every claim carries its source.** Approvals, wall displays and Ask answers
  all show the same receipt: before → after, meeting, approver.
* **Status puts people in place.** Check in walks you to your desk, a break to
  the tea point, a booking into the room — and everyone sees it live.
* **The demo never needs a key, and never varies.** A deterministic fixture AI
  runs the whole story offline, with no network and no API key. On the live
  site, Ask uses a live model (Muse Spark) while the scripted Acme meeting stays
  on the fixture, so the demo proposes the same four changes every run.
* **One contract, three runtimes.** Movement, validation and demo data live in
  `@office/shared` and are used unchanged by the client, the server and the tests.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [React][React-url] and [React Three Fiber][R3F-url]
* [Three.js][Three-url]
* [TypeScript][TypeScript-url]
* [Vite][Vite-url]
* [Node.js][Node-url]
* [Colyseus][Colyseus-url]
* [Zod][Zod-url]
* [Supabase][Supabase-url]
* [pnpm][pnpm-url]
* [Vitest][Vitest-url]
* [Playwright][Playwright-url]
* [Blender][Blender-url]
* [Vercel][Vercel-url] and [Fly.io][Fly-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

* Node 22 and [pnpm][pnpm-url] 12.8.1
* Chrome or Chromium (screenshots, e2e)
* Docker Desktop, only for the optional local Supabase (Postgres) path

### Installation

```sh
git clone https://github.com/debashish17/meta-virtual.git
cd meta-virtual
pnpm install
npx playwright install chromium   # once per machine, for pnpm test:e2e
pnpm dev            # web on :5173 + server on :2567 (records in memory, fixture AI)
```

Optional, the same demo on Postgres with row-level security:

```sh
pnpm db:start       # local Supabase in Docker (first run pulls ~1 GB of images)
pnpm demo:reset     # migrations + seed (Maya, Arjun, the Acme records); prints the server command
```

Then open two windows side by side:

* Maya: `http://localhost:5173/?name=Maya`
* Arjun: `http://localhost:5173/?name=Arjun`

Server health: `http://localhost:2567/health` (version, auth mode, LLM —
`fixture` when no key is set — and nothing secret).

> Panels read the in-memory mock API by default ("Demo data" notice). For the
> server-backed demo: `VITE_API=http pnpm dev` (dev sign-in, fixture AI unless
> `LLM_API_KEY` is set on the server).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

**Try it live.** Open [meta-virtual-office.vercel.app](https://meta-virtual-office.vercel.app)
in two browser windows (one of them private, so they are two people). Pick
*Join as Maya* in one and *Join as Arjun* in the other; a loading screen shows
the office loading, then you are in.

**Walk the floor.** WASD or arrows (Shift jogs), click to walk, click a desk
chair to sit or the tea counter for a drink (`E` nearby), scroll to zoom.
`?view=overview` frames the whole floor.

[![Maya checked in and seated at her desk in Customer success][walk-screenshot]](https://meta-virtual-office.vercel.app)

**Run the story.**

1. Both click **Check in**: each avatar walks to its own desk, sits and types.
2. Maya clicks **Book a room**: the Acme room, a title, an agenda, Arjun invited.
   She walks into the room; Arjun gets the invite and clicks **Join**.
3. In the room, Maya clicks **Process meeting**: the summary, the agenda and four
   proposed changes appear in both drawers.
4. Maya approves the date move, the commitment and the new task, and rejects the
   reassignment. The receipt *"Go-live 15 Nov → 22 Nov · Acme sync · Maya"*
   reaches Arjun live — in his drawer and on the Acme room's wall screen (click
   the screen for the large view).
5. Ask the office *"What's the status of the Acme integration?"* (an answer with
   its sources, now saying 22 Nov) and *"Who is Acme's CEO?"* (*"I don't have a
   record of that."*).
6. Notes are private, the company board is shared, and **Take a break** walks
   you to the tea point.

[![My day after the meeting: the follow-up and the meeting in the Acme room][panels-screenshot]](https://meta-virtual-office.vercel.app)

The screen keeps one layout: the top strip says where you are and what you
are doing, people and chat sit on the left, My day / Approvals / Notes on the
right, and Ask the office at the bottom. The 3-minute video script is
`docs/DEMO_SCRIPT.md`; the frozen demo script is `docs/PROJECT_BRIEF.md`
section 5; the backup-video runbook is `docs/DEMO_VIDEO.md`.

**Commands.**

```sh
pnpm dev            # web on :5173 + server on :2567
pnpm build          # web dist + server dist bundle
pnpm typecheck
pnpm lint
pnpm test           # Vitest unit tests (about 700, shared + web + server + scripts)
pnpm test:e2e       # Playwright, 13 two-browser specs on :5190/:2590
pnpm db:start       # local Supabase in Docker
pnpm db:stop        # stop local Supabase
pnpm db:reset       # local only: migrations + seed
pnpm db:seed        # local only: demo users + rows (idempotent)
```

**Deploy.** Web ships as a static build on Vercel; the server is one
long-lived container on Fly.io in Singapore, always on (Colyseus needs a
persistent process). The live site runs in fast mode — pick a name to sign
in, records kept in server memory — so `fly apps restart meta-virtual-office`
resets the demo to its seeded start. Full runbook in `docs/DEPLOY.md`; the
current state is in `docs/HANDOFF.md` section 0.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

* [X] Phases 1–4: contracts, multiplayer, memory backend, product UI, deploy
* [X] Phase 6 / Gate G8: office life — check-in, home desks, room bookings,
  receipts (USP A Phase 0), notes, free seating, company board
* [X] Live deploy: Vercel + Fly.io (Singapore, always on), checked end to end
  in two browsers
* [X] Polish: one overlay layout, a loading screen, a deterministic Acme
  meeting with live Ask
* [ ] Full mode: Supabase sign-in and Postgres on the hosted project
* [ ] Phase 7: final review
* [ ] USP A Phases 1–4 (per `docs/USP_A_IMPLEMENTATION_PLAN.md`)
* [ ] Phase 5 (optional): live meetings via LiveKit — voice, video, screen
  share, real-meeting transcripts, with the fixture as permanent fallback

Known limits of the live demo: names are picked, not signed in (two people
who pick the same name share one identity); records live in server memory
until the next restart; calls show "Calls unavailable" until a LiveKit
project exists. See the [open issues](https://github.com/debashish17/meta-virtual/issues)
for proposed features and known limitations.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

This repo is built by coding agents in work packages. Human contributions are
welcome through the same flow:

1. Read `AGENTS.md` first (rules, locked decisions, definition of done).
2. Read your work package in `docs/WORK_PACKAGES.md` and its gate in
   `docs/IMPLEMENTATION_PLAN.md`.
3. Work on your package's branch; keep to its "Owns" list.
4. `pnpm typecheck`, `pnpm lint` and `pnpm test` must pass (plus
   `pnpm test:e2e` when the package has e2e tests).
5. File a report in `docs/reports/` — only the lead merges into `main`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

All rights reserved — this repository is private and currently ships without a
license file. In particular the Mixamo characters under
`apps/web/public/assets/people/` may not be redistributed on their own (see
`AGENTS.md` section 5), so keep any remote private.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Debashish — [@debashish17](https://github.com/debashish17) —
[open an issue](https://github.com/debashish17/meta-virtual/issues) for bugs
and feature requests.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

* [Mixamo](https://www.mixamo.com/) characters and motion (Adobe; used in-app
  only, never redistributed)
* [Colyseus](https://colyseus.io/) authoritative multiplayer
* [Supabase](https://supabase.com/) Postgres with row-level security
* [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) and
  [three.js](https://threejs.org/) for the isometric office
* Muse Spark, through the Meta AI API, for live answers in Ask the office
* The Blender asset pipeline community for procedural-kit techniques



<p align="right">(<a href="#readme-top">back to top</a>)</p>

[contributors-shield]: https://img.shields.io/github/contributors/debashish17/meta-virtual.svg?style=for-the-badge
[contributors-url]: https://github.com/debashish17/meta-virtual/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/debashish17/meta-virtual.svg?style=for-the-badge
[forks-url]: https://github.com/debashish17/meta-virtual/network/members
[stars-shield]: https://img.shields.io/github/stars/debashish17/meta-virtual.svg?style=for-the-badge
[stars-url]: https://github.com/debashish17/meta-virtual/stargazers
[issues-shield]: https://img.shields.io/github/issues/debashish17/meta-virtual.svg?style=for-the-badge
[issues-url]: https://github.com/debashish17/meta-virtual/issues
[product-screenshot]: docs/screenshots/office-m2-overview.png
[walk-screenshot]: docs/screenshots/live-walk-to-desk.png
[panels-screenshot]: docs/screenshots/live-acme-meeting.png
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[R3F-url]: https://docs.pmnd.rs/react-three-fiber
[Three.js]: https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white
[Three-url]: https://threejs.org/
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[Node.js]: https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white
[Node-url]: https://nodejs.org/
[Colyseus]: https://img.shields.io/badge/Colyseus-332D3E?style=for-the-badge
[Colyseus-url]: https://colyseus.io/
[Zod-url]: https://zod.dev/
[Supabase]: https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white
[Supabase-url]: https://supabase.com/
[pnpm]: https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white
[pnpm-url]: https://pnpm.io/
[Vitest]: https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[Vitest-url]: https://vitest.dev/
[Playwright]: https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white
[Playwright-url]: https://playwright.dev/
[Blender]: https://img.shields.io/badge/Blender-F5792A?style=for-the-badge&logo=blender&logoColor=white
[Blender-url]: https://www.blender.org/
[Vercel-url]: https://vercel.com/
[Fly-url]: https://fly.io/
