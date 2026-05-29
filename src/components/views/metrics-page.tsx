"use client";

import { useEffect, useMemo, useState } from "react";
import type { Filters, HeatMetric, MetricsPayload, RangeKey } from "./metrics/types.ts";
import {
  buildSeries, computeDeltas, computeTotals, dataSpan, filterRows,
  perDay, perModel, perProject, rangeStartMs, topSlices, type SeriesMetric,
} from "./metrics/aggregate.ts";
import { fmtCost, fmtCostFull, fmtDay, fmtInt, fmtTokens } from "./metrics/format.ts";
import { FilterBar } from "./metrics/filter-bar.tsx";
import { StatGrid, type StatDef } from "./metrics/stat-cards.tsx";
import { Heatmap } from "./metrics/heatmap.tsx";
import { Donut } from "./metrics/donut.tsx";
import { AreaChart } from "./metrics/area-chart.tsx";
import { GroupTable } from "./metrics/tables.tsx";
import { useCockpit } from "@/lib/client/store";
import { providerMeta } from "@/lib/shared/providers";

const HEAT_OPTS: { k: HeatMetric; label: string }[] = [
  { k: "sessions", label: "sessions" },
  { k: "cost", label: "cost" },
  { k: "output", label: "output" },
];
const AREA_OPTS: { k: SeriesMetric; label: string }[] = [
  { k: "cost", label: "cost" },
  { k: "output", label: "output" },
  { k: "sessions", label: "sessions" },
];

export function MetricsPage() {
  const [payload, setPayload] = useState<MetricsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const provider = useCockpit((s) => s.provider);
  const [filters, setFilters] = useState<Filters>({ range: "all", projects: [], models: [] });
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("sessions");
  const [areaMetric, setAreaMetric] = useState<SeriesMetric>("cost");

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as MetricsPayload;
      setPayload(j);
      setNow(Date.now());
      setErr(null);
      setFlashKey((k) => k + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void refresh(); const id = setInterval(() => void refresh(), 15_000); return () => clearInterval(id); }, []);

  const rows = useMemo(
    () => (payload?.sessions ?? []).filter((r) => r.provider === provider),
    [payload, provider],
  );

  const view = useMemo(() => {
    const filtered = filterRows(rows, filters, now);
    const totals = computeTotals(filtered);
    const deltas = computeDeltas(rows, filters, now);
    const projects = perProject(filtered);
    const models = perModel(filtered);
    const days = perDay(filtered);
    const span = dataSpan(rows);
    const from = rangeStartMs(filters.range, now) ?? span?.first ?? now;
    const series = buildSeries(days, areaMetric, from, now);
    const costByProject = topSlices(projects, 8, (g) => g.cost);
    const costByModel = topSlices(models, 8, (g) => g.cost);
    return { filtered, totals, deltas, projects, models, days, from, series, costByProject, costByModel, span };
  }, [rows, filters, now, areaMetric]);

  const allProjects = useMemo(() => perProject(rows).map((g) => ({ key: g.key, label: g.label, sub: g.sub })), [rows]);
  const allModels = useMemo(() => perModel(rows).map((g) => ({ key: g.key, label: g.label })), [rows]);

  const spanLabel = view.span
    ? `${fmtDay(new Date(view.span.first).toISOString().slice(0, 10))} → now`
    : "no data";

  const stats: StatDef[] = useMemo(() => {
    const t = view.totals;
    const d = view.deltas;
    const live = payload?.liveByProvider?.[provider] ?? 0;
    return [
      { key: "sessions", label: "Sessions", value: t.sessions, format: fmtInt, foot: `${live} live · ${t.done} done · ${t.error} error`, delta: d?.sessions, deltaGood: "up" },
      { key: "cost", label: "Est. cost", value: t.cost, format: fmtCostFull, foot: `public ${providerMeta(provider).vendor} list prices`, delta: d?.cost, deltaGood: "down", accent: true },
      { key: "output", label: "Output tokens", value: t.output, format: fmtTokens, foot: `${fmtTokens(t.input)} input`, delta: d?.output, deltaGood: "up" },
      { key: "cache", label: "Cache read", value: t.cacheRead, format: fmtTokens, foot: `${fmtTokens(t.cacheCreate)} cache create`, deltaGood: "up" },
      { key: "tools", label: "Tool calls", value: t.toolUses, format: fmtInt, foot: `${fmtInt(t.messages)} messages`, delta: d?.toolUses, deltaGood: "up" },
    ];
  }, [view.totals, view.deltas, payload?.liveByProvider, provider]);

  const activeProjects = useMemo(() => new Set(filters.projects), [filters.projects]);
  const toggleProject = (cwd: string) =>
    setFilters((f) => ({ ...f, projects: f.projects.includes(cwd) ? f.projects.filter((x) => x !== cwd) : [...f.projects, cwd] }));

  return (
    <div className="mx-shell">
      <div className="mx-header">
        <div>
          <h1>Metrics · {providerMeta(provider).label}</h1>
          <p className="sub">All-time {providerMeta(provider).vendor} usage, from <code>~/{providerMeta(provider).homeDir}</code>. Filter by range, project or model. Refreshes every 15s.</p>
        </div>
        <button className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`} onClick={() => void refresh()} disabled={loading} aria-label="Refresh">
          <RefreshIcon /><span>Refresh</span>
        </button>
      </div>

      {err && <div className="mx-err">{err}</div>}
      {!payload && loading && <div className="mx-stat-grid">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="mx-skel" />)}</div>}

      {payload && (
        <>
          <FilterBar
            range={filters.range}
            onRange={(r: RangeKey) => setFilters((f) => ({ ...f, range: r }))}
            projectOpts={allProjects}
            selectedProjects={filters.projects}
            onProjects={(v) => setFilters((f) => ({ ...f, projects: v }))}
            modelOpts={allModels}
            selectedModels={filters.models}
            onModels={(v) => setFilters((f) => ({ ...f, models: v }))}
            spanLabel={spanLabel}
            onClear={() => setFilters({ range: "all", projects: [], models: [] })}
          />

          <StatGrid stats={stats} flashKey={flashKey} />

          <section className="mx-card mx-wide">
            <div className="mx-card-h">
              <span>Activity calendar</span>
              <Toggle opts={HEAT_OPTS} value={heatMetric} onChange={setHeatMetric} />
            </div>
            <Heatmap bucket={view.days} metric={heatMetric} from={view.from} to={now} />
          </section>

          <section className="mx-card mx-wide">
            <div className="mx-card-h">
              <span>Over time</span>
              <Toggle opts={AREA_OPTS} value={areaMetric} onChange={setAreaMetric} />
            </div>
            <AreaChart points={view.series} format={areaMetric === "cost" ? fmtCost : fmtTokens} unit={areaMetric === "cost" ? "" : areaMetric === "sessions" ? "sessions" : "tok"} />
          </section>

          <div className="mx-donuts">
            <Donut title="Cost by project" slices={view.costByProject} total={view.totals.cost} format={fmtCostFull} centerLabel={fmtCost(view.totals.cost)} />
            <Donut title="Cost by model" slices={view.costByModel} total={view.totals.cost} format={fmtCostFull} centerLabel={fmtCost(view.totals.cost)} />
          </div>

          <section className="mx-card mx-wide">
            <div className="mx-card-h"><span>Per project</span><span className="mx-h-sub">click a row to filter</span></div>
            <GroupTable rows={view.projects} kind="project" activeKeys={activeProjects} onToggle={toggleProject} />
          </section>

          <section className="mx-card mx-wide">
            <div className="mx-card-h"><span>Per model</span></div>
            <GroupTable rows={view.models} kind="model" />
          </section>
        </>
      )}
    </div>
  );
}

function Toggle<T extends string>({ opts, value, onChange }: { opts: { k: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mx-toggle" role="radiogroup">
      {opts.map((o) => (
        <button key={o.k} role="radio" aria-checked={value === o.k} className={value === o.k ? "on" : ""} onClick={() => onChange(o.k)}>{o.label}</button>
      ))}
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" />
    </svg>
  );
}
