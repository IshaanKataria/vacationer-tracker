import Tracker from "@/components/Tracker";
import data from "@/data/programs.json";
import type { Program } from "@/lib/types";

const programs = data.programs as unknown as Program[];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-8 sm:pt-14">
      <header className="mb-8 border-b border-line pb-7">
        <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Summer 2026/27 · Australia
        </p>
        <h1 className="mb-3 font-display text-4xl font-bold tracking-tight sm:text-5xl [text-wrap:balance]">
          Vacationer
        </h1>
        <p className="max-w-[62ch] text-[15.5px] leading-relaxed text-muted sm:text-[17px]">
          Every Big&nbsp;4, bank, quant and tech vacationer program worth
          applying to — live status, deadlines and direct apply links, curated
          for penultimate-year students.{" "}
          <strong className="font-semibold text-ink">
            No employer pays to be here. No login wall. Sorted by what closes
            next.
          </strong>
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
