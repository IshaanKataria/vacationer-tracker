"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_LABELS,
  PIPELINE_STAGES,
  ROLE_TYPE_LABELS,
  WORK_RIGHTS_LABELS,
  type Category,
  type PipelineStage,
  type Program,
  type RoleType,
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

const RIGHTS_SHORT: Record<WorkRights, string> = {
  "citizen-pr": "Citizen / PR",
  "visa-friendly": "Visa OK",
  "sponsors-visa": "Sponsors visa",
  "role-dependent": "Varies by role",
};

const RIGHTS_CLASSES: Record<WorkRights, string> = {
  "citizen-pr": "text-urgent border-urgent/40 bg-urgent-soft",
  "visa-friendly": "text-good border-good/40 bg-good-soft",
  "sponsors-visa": "text-accent border-accent/40 bg-accent-soft",
  "role-dependent": "text-warn border-warn/40 bg-warn-soft",
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

const STAGE_DOT: Record<PipelineStage, string> = {
  none: "",
  saved: "bg-accent",
  applied: "bg-accent",
  oa: "bg-warn",
  interview: "bg-warn",
  offer: "bg-good",
  rejected: "bg-urgent",
};

function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function daysUntil(iso: string, today: Date): number {
  return Math.round((parseISO(iso).getTime() - today.getTime()) / 86400000);
}

function formatShort(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

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
  return (
    "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"))
  );
}

function monogram(firm: string): { initials: string; hue: number } {
  const words = firm.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const initials =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : firm.slice(0, 2).toUpperCase();
  let hash = 0;
  for (const ch of firm) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return { initials, hue: hash };
}

function Monogram({ firm, size }: { firm: string; size: "sm" | "lg" }) {
  const { initials, hue } = monogram(firm);
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg font-semibold text-white ${
        size === "sm" ? "h-10 w-10 text-[13px]" : "h-12 w-12 text-[15px]"
      }`}
      style={{ background: `hsl(${hue} 45% 42%)` }}
    >
      {initials}
    </div>
  );
}

function DeadlineChip({
  p,
  today,
  compact,
}: {
  p: Program;
  today: Date | null;
  compact?: boolean;
}) {
  const s = effectiveStatus(p, today);
  const base = `rounded-md px-2 py-0.5 font-mono font-semibold ${
    compact ? "text-[10.5px]" : "text-[11.5px]"
  }`;

  if (s === "closed")
    return <span className={`${base} bg-idle-soft text-idle`}>Closed</span>;

  if (s === "soon") {
    const label = p.opens
      ? today && daysUntil(p.opens, today) <= 0
        ? "opens today"
        : `opens ${formatShort(p.opens)}`
      : compact
        ? "soon"
        : `opens ${p.opensNote ?? "soon"}`;
    return <span className={`${base} bg-warn-soft text-warn`}>{label}</span>;
  }

  if (p.deadline) {
    const days = today ? daysUntil(p.deadline, today) : null;
    const urgent = days !== null && days <= 7;
    const label =
      days === null
        ? `closes ${formatShort(p.deadline)}`
        : days === 0
          ? "closes today"
          : compact
            ? `${days}d left`
            : `closes ${formatShort(p.deadline)} · ${days}d left`;
    return (
      <span
        className={`${base} ${urgent ? "bg-urgent-soft text-urgent" : "bg-good-soft text-good"}`}
      >
        {label}
      </span>
    );
  }
  return (
    <span className={`${base} bg-good-soft text-good`}>
      {compact ? "Rolling" : "Rolling — apply early"}
    </span>
  );
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

function DetailPanel({
  p,
  today,
  stage,
  setStage,
  onClose,
}: {
  p: Program;
  today: Date | null;
  stage: PipelineStage;
  setStage: (id: string, stage: PipelineStage) => void;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const closed = effectiveStatus(p, today) === "closed";

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("type", p.roleType);
    url.searchParams.set("job", p.id);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function onApplyClick() {
    const s = effectiveStatus(p, today);
    const applyable = s === "open" || s === "rolling";
    if (applyable && (stage === "none" || stage === "saved"))
      setStage(p.id, "applied");
  }

  return (
    <div className="card-shadow rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-[22px] font-bold leading-tight tracking-tight sm:text-[26px] [text-wrap:balance]">
            {p.program}
          </h2>
          <p className="mt-1 text-[15px] font-semibold text-accent">{p.firm}</p>
        </div>
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-2"
          >
            ✕
          </button>
        ) : (
          <Monogram firm={p.firm} size="lg" />
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-muted">
          📍 {p.locations.join(" · ")}
        </span>
        <DeadlineChip p={p} today={today} />
        {p.deadlineNote && (
          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-faint">
            {p.deadlineNote}
          </span>
        )}
        <span
          className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${RIGHTS_CLASSES[p.workRights]}`}
        >
          {WORK_RIGHTS_LABELS[p.workRights]}
        </span>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-muted">
          {CATEGORY_LABELS[p.category]}
        </span>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-muted">
          {ROLE_TYPE_LABELS[p.roleType].replace(/s$/, "")}
        </span>
      </div>

      <h3 className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-faint">
        Notes
      </h3>
      <p className="mb-6 max-w-[70ch] text-[14px] leading-relaxed text-muted">
        {p.notes}
      </p>

      <div className="flex flex-col gap-2.5">
        <a
          href={p.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onApplyClick}
          className={
            closed
              ? "rounded-lg border border-line px-4 py-2.5 text-center text-[14px] font-semibold text-muted hover:bg-surface-2"
              : "rounded-lg bg-accent px-4 py-2.5 text-center text-[14.5px] font-semibold text-white transition-[filter] hover:brightness-110 dark:text-bg"
          }
        >
          {closed
            ? "View page ↗"
            : effectiveStatus(p, today) === "soon"
              ? "Watch page ↗"
              : "Apply now ↗"}
        </a>
        {!closed && effectiveStatus(p, today) !== "soon" && (
          <p className="text-center text-[11.5px] text-faint">
            Clicking Apply marks it as Applied in your list — adjust below.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(p.id, e.target.value as PipelineStage)}
            aria-label={`Your application status for ${p.firm}`}
            className={`min-w-0 flex-1 cursor-pointer rounded-lg border px-3 py-2 text-[13px] font-medium focus:outline-none ${STAGE_CLASSES[stage]}`}
          >
            {PIPELINE_STAGES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>
          <button
            onClick={copyLink}
            className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-muted hover:bg-surface-2"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          {p.deadline && !closed && (
            <a
              href={makeIcs(p)}
              download={`${p.id}-deadline.ics`}
              className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-accent hover:bg-surface-2"
            >
              + calendar
            </a>
          )}
        </div>
        <p className="mt-1 text-right font-mono text-[10.5px] text-faint">
          verified {formatShort(p.verified)} · always confirm on the
          employer&apos;s page
        </p>
      </div>
    </div>
  );
}

export default function Tracker({
  programs,
  lastUpdated,
}: {
  programs: Program[];
  lastUpdated: string;
}) {
  const [today, setToday] = useState<Date | null>(null);
  const [roleTab, setRoleTab] = useState<RoleType>("internship");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Set<Category>>(new Set());
  const [statuses, setStatuses] = useState<Set<Status>>(new Set());
  const [rights, setRights] = useState<Set<WorkRights>>(new Set());
  const [melbOnly, setMelbOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const { progress, setStage } = useProgress();
  // Flips to true one render AFTER the URL params have been applied, so the
  // selection-fallback effect can't clobber a deep-linked job.
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setToday(now);
    const params = new URLSearchParams(window.location.search);
    const job = params.get("job");
    const type = params.get("type");
    const linked = job ? programs.find((p) => p.id === job) : undefined;
    if (linked) {
      setRoleTab(linked.roleType);
      setSelectedId(linked.id);
    } else if (type === "graduate" || type === "internship") {
      setRoleTab(type);
    }
    setUrlReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set("type", roleTab);
    if (selectedId) url.searchParams.set("job", selectedId);
    else url.searchParams.delete("job");
    window.history.replaceState(null, "", url.toString());
  }, [roleTab, selectedId, urlReady]);

  const tabPrograms = useMemo(
    () => programs.filter((p) => p.roleType === roleTab),
    [programs, roleTab]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return tabPrograms
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
  }, [tabPrograms, q, cats, statuses, rights, melbOnly, mineOnly, progress, today]);

  // Keep a valid selection: fall back to the top of the current list.
  useEffect(() => {
    if (!urlReady) return;
    if (!filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
      setMobileDetail(false);
    }
  }, [filtered, selectedId, urlReady]);

  const selected = filtered.find((p) => p.id === selectedId) ?? filtered[0];

  const stats = useMemo(() => {
    let closing = 0,
      rolling = 0,
      soon = 0;
    for (const p of tabPrograms) {
      const s = effectiveStatus(p, today);
      if (s === "open" && p.deadline && (!today || daysUntil(p.deadline, today) <= 28))
        closing++;
      else if (s === "open" || s === "rolling") rolling++;
      else if (s === "soon") soon++;
    }
    const mine = tabPrograms.filter((p) => {
      const st = progress[p.id];
      return st && st !== "none" && st !== "saved";
    }).length;
    return { closing, rolling, soon, mine };
  }, [tabPrograms, progress, today]);

  const activeFilterCount =
    cats.size + statuses.size + rights.size + (melbOnly ? 1 : 0) + (mineOnly ? 1 : 0);
  const anyFilter = activeFilterCount > 0 || q !== "";

  function toggle<T>(set: Set<T>, value: T, apply: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  function clearFilters() {
    setQ("");
    setCats(new Set());
    setStatuses(new Set());
    setRights(new Set());
    setMelbOnly(false);
    setMineOnly(false);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Search bar */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search company or role…"
        className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-[14.5px] text-ink card-shadow placeholder:text-faint focus:border-accent focus:outline-none"
      />

      {/* Role-type tabs */}
      <div
        role="tablist"
        aria-label="Opportunity type"
        className="card-shadow grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1"
      >
        {(Object.keys(ROLE_TYPE_LABELS) as RoleType[]).map((t) => {
          const count = programs.filter((p) => p.roleType === t).length;
          const active = roleTab === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setRoleTab(t)}
              className={`rounded-lg px-4 py-2.5 text-[15px] font-semibold transition-colors ${
                active
                  ? "bg-accent text-white dark:text-bg"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {ROLE_TYPE_LABELS[t]}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 font-mono text-[11.5px] tabular ${
                  active ? "bg-white/20 dark:bg-bg/20" : "bg-surface-2 text-faint"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

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
            <div className="mt-1 text-[12.5px] text-muted">{t.label}</div>
          </button>
        ))}
      </div>

      {/* Toolbar: results + filters toggle */}
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-faint">
          {filtered.length} results · sorted by what closes next · verified{" "}
          {formatShort(lastUpdated)}
        </p>
        <div className="flex items-center gap-2">
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              showFilters || activeFilterCount > 0
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
        </div>
      </div>

      {/* Collapsible filter panel */}
      {showFilters && (
        <div className="card-shadow flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-faint">
              Sector
            </span>
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
              <Chip key={c} active={cats.has(c)} onClick={() => toggle(cats, c, setCats)}>
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
              <Chip key={w} active={rights.has(w)} onClick={() => toggle(rights, w, setRights)}>
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
          </div>
        </div>
      )}

      {/* Master-detail */}
      <div className="grid gap-4 lg:grid-cols-[minmax(330px,2fr)_3fr] lg:items-start">
        {/* Card list */}
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => {
            const s = effectiveStatus(p, today);
            const closed = s === "closed";
            const stage: PipelineStage = progress[p.id] ?? "none";
            const isSelected = selected?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedId(p.id);
                  setMobileDetail(true);
                }}
                aria-current={isSelected}
                className={`card-shadow rounded-xl border p-3.5 text-left transition-colors ${
                  isSelected
                    ? "border-accent bg-accent-soft/60"
                    : "border-line bg-surface hover:border-accent/40"
                } ${closed ? "opacity-65" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <Monogram firm={p.firm} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[14.5px] font-bold tracking-tight">
                        {p.firm}
                      </p>
                      <DeadlineChip p={p} today={today} compact />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">
                      {p.program}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-line bg-surface-2 px-2 py-px text-[10.5px] text-muted">
                        {CATEGORY_LABELS[p.category]}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-px text-[10.5px] font-semibold ${RIGHTS_CLASSES[p.workRights]}`}
                      >
                        {RIGHTS_SHORT[p.workRights]}
                      </span>
                      <span className="rounded-full border border-line bg-surface-2 px-2 py-px text-[10.5px] text-muted">
                        📍 {p.locations[0]}
                        {p.locations.length > 1 ? ` +${p.locations.length - 1}` : ""}
                      </span>
                      {stage !== "none" && (
                        <span className="ml-auto flex items-center gap-1 font-mono text-[10.5px] font-semibold text-muted">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${STAGE_DOT[stage]}`}
                          />
                          {PIPELINE_STAGES.find((st) => st.value === stage)?.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
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

        {/* Detail panel — desktop */}
        <div className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto lg:block">
          {selected ? (
            <DetailPanel
              p={selected}
              today={today}
              stage={progress[selected.id] ?? "none"}
              setStage={setStage}
            />
          ) : (
            <div className="card-shadow rounded-xl border border-line bg-surface p-10 text-center text-[13.5px] text-muted">
              Select a program to see details.
            </div>
          )}
        </div>
      </div>

      {/* Detail overlay — mobile */}
      {mobileDetail && selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-bg/95 p-3 backdrop-blur-sm lg:hidden">
          <DetailPanel
            p={selected}
            today={today}
            stage={progress[selected.id] ?? "none"}
            setStage={setStage}
            onClose={() => setMobileDetail(false)}
          />
        </div>
      )}
    </div>
  );
}
