Vacationer — AU Summer Internship and Vacationer Program Tracker

A curated tracker of Australian summer vacationer and internship programs (Big 4, banks, quant trading, tech, consulting) for penultimate-year students. No employer pays to be listed, no login wall, sorted by what closes next.

What it does

- Every program shows live status (open, rolling, opening soon, closed), deadline with a day counter, locations, work-rights eligibility, and a direct apply link
- Work-rights badges answer the most-asked question in AU recruiting up front: citizen/PR only, visa-friendly, sponsors visa, or role-dependent
- Track your own pipeline per program (saved, applied, online assessment, interview/AC, offer, rejected) — stored in localStorage, no account
- Add any deadline to your calendar as an .ics with a 2-day reminder
- Filter by sector, status, work rights, Melbourne-only, or your own list

Stack

- Next.js 16 (App Router, static render) + Tailwind v4, deployed on Vercel
- Data lives in data/programs.json — git is the database and the changelog
- Vercel Web Analytics for traffic

How the data stays fresh

A weekly GitHub Action (.github/workflows/refresh.yml) runs scripts/refresh.mjs, which asks Claude (with server-side web search) to re-verify every listing against official careers pages, close expired deadlines, and add newly opened programs. The script validates the result against the schema and the Action opens a PR — a human reviews the diff before merge, and merging auto-deploys.

Setup for the refresh pipeline

- Add an ANTHROPIC_API_KEY secret: repo Settings, Secrets and variables, Actions
- Enable "Allow GitHub Actions to create and approve pull requests": repo Settings, Actions, General
- Run it on demand from the Actions tab (workflow_dispatch), or wait for Tuesday's scheduled run
- Note: GitHub disables scheduled workflows after 60 days without repo activity — merging the weekly PR keeps it alive
- Cost: roughly 20-30 cents per run (web search is billed at 10 USD per 1,000 searches plus tokens)

Local dev

- npm install
- npm run dev
- Refresh script locally: ANTHROPIC_API_KEY=... node scripts/refresh.mjs

Contributing

Spotted a wrong date or a missing program? Open an issue with the program name, the official careers URL, and what needs to change. Corrections are cross-checked against the official page before merging.

Disclaimer

Deadlines and eligibility rules change quickly and some programs close early once filled. Always confirm on the employer's official page before planning around anything listed here.
