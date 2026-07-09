import Tracker from "@/components/Tracker";
import data from "@/data/programs.json";
import type { Program } from "@/lib/types";

const programs = data.programs as unknown as Program[];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-8 sm:pt-14">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Vacationer
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Curated AU internships &amp; grad roles for students in finance,
            consulting, quant and tech.
          </p>
        </div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          No sponsored listings · no login wall · sorted by what closes next
        </p>
      </header>

      <main>
        <Tracker programs={programs} lastUpdated={data.lastUpdated} />
      </main>

      <footer className="mt-14 border-t border-line pt-6 text-[13px] leading-relaxed text-faint">
        <p className="mb-2">
          <span className="font-semibold text-muted">How this stays fresh:</span>{" "}
          a weekly AI research pass re-verifies every listing against official
          careers pages and hunts for newly opened programs; every change is
          human-reviewed before it ships. The full dataset and its history are
          public on{" "}
          <a
            href="https://github.com/IshaanKataria/vacationer-tracker"
            className="text-accent hover:underline"
          >
            GitHub
          </a>
          .
        </p>
        <p className="mb-2">
          <span className="font-semibold text-muted">Your progress</span> is
          stored in your browser only — nothing leaves your device, no account
          needed.
        </p>
        <p>
          Deadlines and eligibility change fast — always confirm on the
          employer&apos;s page before planning around a date. Spotted an error
          or a missing program?{" "}
          <a
            href="https://github.com/IshaanKataria/vacationer-tracker/issues/new"
            className="text-accent hover:underline"
          >
            Open an issue
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
