"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_LABELS,
  PIPELINE_STAGES,
  WORK_RIGHTS_LABELS,
  type Category,
  type PipelineStage,
  type Program,
  type Status,
  type WorkRights,
} from "@/lib/types";
import { useProgress } from "@/lib/useProgress";

const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  rolling: "Rolling",
  soon: "Opening soon",
  closed: "Closed",
};

const STAGE_CLASSES: Record<PipelineStage, string> = {
  none: "bg-surface-2 text-muted border-line",
  saved: "bg-accent-soft text-accent border-accent/30",
  applied: "bg-accent-soft text-accent border-accent/30",
  oa: "bg-warn-soft text-warn border-warn/30",
  interview: "bg-warn-soft text-warn border-warn/30",
  offer: "bg-good-soft text-good border-good/30",
  rejected: "bg-urgent-soft text-urgent border-urgent/30",
};

function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function daysUntil(iso: string, today: Date): number {
  const target = parseISO(iso);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatShort(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

/** Status once expired deadlines are accounted for. */
function effectiveStatus(p: Program, today: Date | null): Status {
  if (
    today &&
    p.status !== "closed" &&
    p.deadline &&
    daysUntil(p.deadline, today) < 0
  ) {
    return "closed";
  }
  return p.status;
}

function sortKey(p: Program, today: Date | null): [number, number] {
  const s = effectiveStatus(p, today);
  if (s === "closed") return [3, 0];
  if (s === "soon") return [2, p.opens ? parseISO(p.opens).getTime() : Infinity];
  if (p.deadline) return [0, parseISO(p.deadline).getTime()];
  return [1, 0];
}

function makeIcs(p: Program): string {
  const date = p.deadline!.replaceAll("-", "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//vacationer//tracker//EN",
    "BEGIN:VEVENT",
    `UID:${p.id}@vacationer`,
    `DTSTART;VALUE=DATE:${date}`,
    `SUMMARY:${p.firm} application closes — ${p.program.replace(/,/g, "\\,")}`,
    `DESCRIPTION:Apply: ${p.applyUrl}`,
    `URL:${p.applyUrl}`,
    "BEGIN:VALARM",
    "TRIGGER:-P2D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${p.firm} closes in 2 days`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"));
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
        active
          ? "border-accent bg-accent text-white dark:text-bg"
          : "border-line bg-surface text-muted hover:border-accent/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function DeadlineChip({ p, today }: { p: Program; today: Date | null }) {
  const s = effectiveStatus(p, today);

  if (s === "closed") {
    return (
      <span className="rounded-md bg-idle-soft px-2 py-0.5 font-mono text-[11.5px] font-semibold text-idle">
        Closed
      </span>
    );
  }
  if (s === "soon") {
    const when = p.opens
      ? today
        ? daysUntil(p.opens, today) <= 0
          ? "opens today"
          : `opens ${formatShort(p.opens)} · ${daysUntil(p.opens, today)}d`
        : `opens ${formatShort(p.opens)}`
      : `opens ${p.opensNote ?? "soon"}`;
    return (
      <span className="rounded-md bg-warn-soft px-2 py-0.5 font-mono text-[11.5px] font-semibold text-warn">
        {when}
      </span>
    );
  }
  if (p.deadline) {
    const days = today ? daysUntil(p.deadline, today) : null;
    const urgent = days !== null && days <= 7;
    const label =
      days === null
        ? `closes ${formatShort(p.deadline)}`
        : days === 0
          ? "closes today"
          : `closes ${formatShort(p.deadline)} · ${days}d left`;
    return (
      <span
        className={`rounded-md px-2 py-0.5 font-mono text-[11.5px] font-semibold ${
          urgent ? "bg-urgent-soft text-urgent" : "bg-good-soft text-good"
        }`}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-good-soft px-2 py-0.5 font-mono text-[11.5px] font-semibold text-good">
      Rolling — apply early
    </span>
  );
}

const RIGHTS_CLASSES: Record<WorkRights, string> = {
  "citizen-pr": "text-urgent border-urgent/40 bg-urgent-soft",
  "visa-friendly": "text-good border-good/40 bg-good-soft",
  "sponsors-visa": "text-accent border-accent/40 bg-accent-soft",
  "role-dependent": "text-warn border-warn/40 bg-warn-soft",
};

export default function Tracker({
  programs,
  lastUpdated,
}: {
  programs: Program[];
  lastUpdated: string;
}) {
  const [today, setToday] = useState<Date | null>(null);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Set<Category>>(new Set());
  const [statuses, setStatuses] = useState<Set<Status>>(new Set());
  const [rights, setRights] = useState<Set<WorkRights>>(new Set());
  const [melbOnly, setMelbOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const { progress, setStage } = useProgress();

  useEffect(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setToday(now);
  }, []);

  function toggle<T>(set: Set<T>, value: T, apply: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return programs
      .filter((p) => {
        const s = effectiveStatus(p, today);
        if (cats.size && !cats.has(p.category)) return false;
        if (statuses.size && !statuses.has(s)) return false;
        if (rights.size && !rights.has(p.workRights)) return false;
        if (melbOnly && !p.melbourne) return false;
        if (mineOnly && !(progress[p.id] && progress[p.id] !== "none"))
          return false;
        if (
          query &&
          !`${p.firm} ${p.program} ${p.notes} ${p.locations.join(" ")}`
            .toLowerCase()
            .includes(query)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const [ga, ka] = sortKey(a, today);
        const [gb, kb] = sortKey(b, today);
        return ga - gb || ka - kb || a.firm.localeCompare(b.firm);
      });
  }, [programs, q, cats, statuses, rights, melbOnly, mineOnly, progress, today]);

  const stats = useMemo(() => {
    let closing = 0,
      rolling = 0,
      soon = 0;
    for (const p of programs) {
      const s = effectiveStatus(p, today);
      if (s === "open" && p.deadline && (!today || daysUntil(p.deadline, today) <= 28))
        closing++;
      else if (s === "open" || s === "rolling") rolling++;
      else if (s === "soon") soon++;
    }
    const mine = Object.values(progress).filter(
      (st) => st !== "none" && st !== "saved"
    ).length;
    return { closing, rolling, soon, mine };
  }, [programs, progress, today]);

  const anyFilter =
    q !== "" ||
    cats.size > 0 ||
    statuses.size > 0 ||
    rights.size > 0 ||
    melbOnly ||
    mineOnly;

  return (
    <div className="flex flex-col gap-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            {
              n: stats.closing,
              label: "closing within 4 weeks",
              cls: "text-urgent",
              onClick: () => {
                setStatuses(new Set<Status>(["open"]));
                setMineOnly(false);
              },
            },
            {
              n: stats.rolling,
              label: "open now — rolling",
              cls: "text-good",
              onClick: () => {
                setStatuses(new Set<Status>(["open", "rolling"]));
                setMineOnly(false);
              },
            },
            {
              n: stats.soon,
              label: "opening soon",
              cls: "text-warn",
              onClick: () => {
                setStatuses(new Set<Status>(["soon"]));
                setMineOnly(false);
              },
            },
            {
              n: stats.mine,
              label: "you've applied to",
              cls: "text-accent",
              onClick: () => {
                setStatuses(new Set());
                setMineOnly(true);
              },
            },
          ] as const
        ).map((t) => (
          <button
            key={t.label}
            onClick={t.onClick}
            className="card-shadow rounded-xl border border-line bg-surface px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
          >
            <div className={`font-mono text-2xl font-semibold tabular ${t.cls}`}>
              {t.n}
            </div>
            <div className="mt-1 text-[13px] text-muted">{t.label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card-shadow flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search firms, programs, locations…"
          className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-faint">
            Sector
          </span>
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
            <Chip
              key={c}
              active={cats.has(c)}
              onClick={() => toggle(cats, c, setCats)}
            >
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-faint">
            Status
          </span>
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <Chip
              key={s}
              active={statuses.has(s)}
              onClick={() => toggle(statuses, s, setStatuses)}
            >
              {STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-faint">
            Work rights
          </span>
          {(Object.keys(WORK_RIGHTS_LABELS) as WorkRights[]).map((w) => (
            <Chip
              key={w}
              active={rights.has(w)}
              onClick={() => toggle(rights, w, setRights)}
            >
              {WORK_RIGHTS_LABELS[w]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Chip active={melbOnly} onClick={() => setMelbOnly(!melbOnly)}>
            📍 Melbourne only
          </Chip>
          <Chip active={mineOnly} onClick={() => setMineOnly(!mineOnly)}>
            My list
          </Chip>
          {anyFilter && (
            <button
              onClick={() => {
                setQ("");
                setCats(new Set());
                setStatuses(new Set());
                setRights(new Set());
                setMelbOnly(false);
                setMineOnly(false);
              }}
              className="ml-auto text-[13px] font-medium text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      <p className="font-mono text-[12px] text-faint">
        {filtered.length} of {programs.length} programs · sorted by what closes
        next · data verified {formatShort(lastUpdated)}
      </p>

      {/* Program list */}
      <div className="flex flex-col gap-3">
        {filtered.map((p) => {
          const s = effectiveStatus(p, today);
          const closed = s === "closed";
          const stage: PipelineStage = progress[p.id] ?? "none";
          const stripe =
            s === "closed"
              ? "border-l-idle"
              : s === "soon"
                ? "border-l-warn"
                : p.deadline && today && daysUntil(p.deadline, today) <= 7
                  ? "border-l-urgent"
                  : "border-l-good";
          return (
            <article
              key={p.id}
              className={`card-shadow flex flex-col gap-3 rounded-xl border border-l-4 border-line bg-surface p-4 sm:flex-row sm:items-start sm:gap-5 ${stripe} ${
                closed ? "opacity-70" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-bold tracking-tight">
                    {p.firm}
                  </h3>
                  <DeadlineChip p={p} today={today} />
                  <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                    {CATEGORY_LABELS[p.category]}
                  </span>
                </div>
                <p className="mb-2 text-[14px] font-medium text-muted">
                  {p.program}
                </p>
                <p className="mb-3 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
                  {p.notes}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[12px] text-muted">
                    📍 {p.locations.join(" · ")}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${RIGHTS_CLASSES[p.workRights]}`}
                  >
                    {WORK_RIGHTS_LABELS[p.workRights]}
                  </span>
                  <span className="font-mono text-[11px] text-faint">
                    verified {formatShort(p.verified)}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-row items-center gap-2 sm:w-[190px] sm:flex-col sm:items-stretch">
                {!closed ? (
                  <a
                    href={p.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-accent px-4 py-2 text-center text-[13.5px] font-semibold text-white transition-[filter] hover:brightness-110 dark:text-bg"
                  >
                    {s === "soon" ? "Watch page ↗" : "Apply ↗"}
                  </a>
                ) : (
                  <a
                    href={p.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-line px-4 py-2 text-center text-[13.5px] font-semibold text-muted hover:bg-surface-2"
                  >
                    View page ↗
                  </a>
                )}
                <select
                  value={stage}
                  onChange={(e) =>
                    setStage(p.id, e.target.value as PipelineStage)
                  }
                  aria-label={`Your application status for ${p.firm}`}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-[13px] font-medium focus:outline-none ${STAGE_CLASSES[stage]}`}
                >
                  {PIPELINE_STAGES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
                {p.deadline && !closed && (
                  <a
                    href={makeIcs(p)}
                    download={`${p.id}-deadline.ics`}
                    className="text-center font-mono text-[11.5px] text-accent hover:underline"
                  >
                    + deadline to calendar
                  </a>
                )}
              </div>
            </article>
          );
        })}

        {filtered.length === 0 && (
          <div className="card-shadow rounded-xl border border-line bg-surface p-10 text-center">
            <p className="mb-2 text-[15px] font-semibold">Nothing matches</p>
            <p className="text-[13.5px] text-muted">
              Try clearing a filter — or if a program is missing,{" "}
              <a
                href="https://github.com/IshaanKataria/vacationer-tracker/issues/new"
                className="text-accent hover:underline"
              >
                suggest it
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
