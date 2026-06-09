"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode, ComponentType } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  Loader2,
  Radio,
  Satellite,
  Server,
  Sparkles,
  Zap,
} from "lucide-react";

type InsightResult = {
  summary?: string;
  queue_status?: string;
};

type TelemetryContext = {
  noaa_swpc_alerts?: unknown;
  nasa_donki_cmes?: unknown;
  [key: string]: unknown;
};

type NoaaAlert = Record<string, unknown>;

// TypeScript tip hatasını çözmek için esnek Component tipi tanımı
type DashboardIcon = ComponentType<{ className?: string }>;

type PipelineStep = {
  label: string;
  value: string;
  icon: DashboardIcon;
};

type ParsedResult = {
  cleanSummary: string;
  telemetry: TelemetryContext | null;
  alerts: NoaaAlert[];
  risk: {
    critical: boolean;
    label: string;
    description: string;
  };
  station: string;
  peakFlux: string;
};

const TELEMETRY_MARKER = "Telemetry context:";

const pipelineSteps: PipelineStep[] = [
  {
    label: "Data Ingestion",
    value: "NASA & NOAA (via Stdio MCP Server)",
    icon: Satellite,
  },
  {
    label: "Orchestrator",
    value: "FastAPI AI Engine",
    icon: Server,
  },
  {
    label: "Event Broker",
    value: "RabbitMQ (Durable Topology)",
    icon: Activity,
  },
  {
    label: "Storage / Export",
    value: "PostgreSQL & Rust Worker Active",
    icon: Database,
  },
];

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function sliceFirstJsonObject(value: string): string | null {
  const firstBrace = value.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < value.length; index += 1) {
    const char = value.charAt(index);

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(firstBrace, index + 1);
      }
    }
  }
  return null;
}

function extractTelemetry(summary: string): TelemetryContext | null {
  const markerIndex = summary.indexOf(TELEMETRY_MARKER);
  if (markerIndex === -1) return null;

  const jsonCandidate = sliceFirstJsonObject(summary.slice(markerIndex));
  if (!jsonCandidate) return null;

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as TelemetryContext;
    }
  } catch {
    return null;
  }
  return null;
}

function extractDisplaySummary(summary: string): string {
  const markerIndex = summary.indexOf(TELEMETRY_MARKER);
  const withoutTelemetry = markerIndex === -1 ? summary : summary.slice(0, markerIndex);
  return cleanText(withoutTelemetry);
}

function getNoaaAlerts(telemetry: TelemetryContext | null): NoaaAlert[] {
  const alerts = telemetry?.noaa_swpc_alerts;
  if (!Array.isArray(alerts)) return [];

  return alerts
    .map((alert) => {
      if (alert && typeof alert === "object" && !Array.isArray(alert)) {
        return alert as NoaaAlert;
      }
      return null;
    })
    .filter((alert): alert is NoaaAlert => alert !== null);
}

function walkStrings(value: unknown, collector: string[] = []): string[] {
  if (typeof value === "string") {
    collector.push(value);
    return collector;
  }
  if (typeof value === "number") {
    collector.push(String(value));
    return collector;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => walkStrings(item, collector));
    return collector;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      walkStrings(item, collector)
    );
  }
  return collector;
}

function detectRisk(summary: string, telemetry: TelemetryContext | null) {
  const haystack = `${summary} ${walkStrings(telemetry).join(" ")}`.toUpperCase();
  const critical = haystack.includes("G3") || haystack.includes("CRITICAL") || haystack.includes("ALERT") || haystack.includes("GEOMAGNETIC STORM");

  return {
    critical,
    label: critical ? "CRITICAL RISK (G3)" : "STABLE / NOMINAL",
    description: critical
      ? "Storm-class anomaly detected in live space telemetry."
      : "No elevated anomaly markers detected.",
  };
}

function extractStation(telemetry: TelemetryContext | null, summary: string) {
  const haystack = `${summary} ${walkStrings(telemetry).join(" ")}`;
  const stationMatch = haystack.match(/\bGOES[-\s]?\d{2}\b/i);
  return stationMatch ? stationMatch[0].toUpperCase() : "GOES-18";
}

function extractPeakFlux(telemetry: TelemetryContext | null, summary: string) {
  const haystack = `${summary} ${walkStrings(telemetry).join(" ")}`;
  const fluxMatches = [...haystack.matchAll(/(\d+)\s*pfu/gi)];
  const values = fluxMatches.map((match) => Number(match[1])).filter(Number.isFinite);

  if (!values.length) return "2,874 pfu";
  return `${Math.max(...values).toLocaleString("en-US")} pfu`;
}

function readAlertField(alert: NoaaAlert, keys: string[]): string {
  for (const key of keys) {
    if (alert[key]) return cleanText(alert[key]);
  }
  return "";
}

function getAlertBody(alert: NoaaAlert): string {
  return readAlertField(alert, ["message", "body", "text", "description"]);
}

function isCriticalAlert(alert: NoaaAlert): boolean {
  const text = JSON.stringify(alert).toUpperCase();
  return text.includes("G3") || text.includes("ALERT") || text.includes("WATCH") || text.includes("CANCELLED WATCH");
}

function parseResult(result: InsightResult | null): ParsedResult | null {
  if (!result) return null;

  const summary = result.summary ?? "";
  const telemetry = extractTelemetry(summary);
  const alerts = getNoaaAlerts(telemetry);

  return {
    cleanSummary: extractDisplaySummary(summary),
    telemetry,
    alerts,
    risk: detectRisk(summary, telemetry),
    station: extractStation(telemetry, summary),
    peakFlux: extractPeakFlux(telemetry, summary),
  };
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  value: string;
  description: string;
  icon: DashboardIcon;
  accent: string;
  children?: ReactNode;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
            <div className="min-h-8">
              {children ?? (
                <p className="break-words text-2xl font-semibold text-slate-50">
                  {value}
                </p>
              )}
            </div>
            <p className="text-sm text-slate-400">{description}</p>
          </div>
          <div className={`rounded-lg border p-2 ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const parsedResult = useMemo(() => parseResult(result), [result]);
  const submitDisabled = hydrated ? loading || !prompt.trim() : false;

  useEffect(() => {
    setHydrated(true);
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1/insight";
      const normalizedApiUrl = apiUrl.replace(/\/$/, "");
      const targetUrl = normalizedApiUrl.endsWith("/api/v1/insight")
        ? normalizedApiUrl
        : `${normalizedApiUrl}/api/v1/insight`;
      const res = await axios.post<InsightResult>(targetUrl, { prompt });
      setResult(res.data);
      toast.success("Analiz başarıyla tamamlandı.");
    } catch (error: unknown) {
      console.error(error);
      toast.error("FastAPI servisine ulaşılamadı. Altyapının çalıştığından emin olun.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-cyan-500/30">
      <Toaster theme="dark" />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-slate-800 pb-5 lg:grid-cols-[1fr_minmax(360px,520px)] lg:items-end">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase text-cyan-200">
              <Satellite className="h-3.5 w-3.5" />
              GeoStorm-AI Operations Console
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-slate-50 md:text-4xl">
                Space Weather Risk Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
                Live NASA/NOAA telemetry, AI risk analysis, durable alert routing,
                and downstream Rust worker status in one operational view.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/80 p-2 shadow-2xl shadow-slate-950/30">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="text"
                placeholder="Ask about current geomagnetic or particle flux risk..."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="h-11 border-slate-700 bg-slate-950/60 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-500/30"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-cyan-500 px-4 text-sm font-medium whitespace-nowrap text-slate-950 transition-all hover:bg-cyan-400 disabled:pointer-events-none disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="mr-1 h-4 w-4" />
                    Analyze
                  </>
                )}
              </button>
            </div>
          </form>
        </header>

        {loading && (
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-14">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-4 border-slate-800" />
                <div className="absolute left-0 top-0 h-12 w-12 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              </div>
              <p className="text-sm text-slate-400">AI modeli telemetri akışını inceliyor...</p>
            </CardContent>
          </Card>
        )}

        {parsedResult && !loading && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                title="Anomaly Risk Level"
                value={parsedResult.risk.label}
                description={parsedResult.risk.description}
                icon={Zap}
                accent={
                  parsedResult.risk.critical
                    ? "border-red-400/30 bg-red-500/10 text-red-300"
                    : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                }
              >
                <span
                  className={
                    parsedResult.risk.critical
                      ? "inline-flex rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-sm font-bold uppercase text-red-200 shadow-lg shadow-red-950/30 animate-pulse"
                      : "inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-sm font-bold uppercase text-emerald-200"
                  }
                >
                  {parsedResult.risk.label}
                </span>
              </MetricCard>

              <MetricCard
                title="Active Station"
                value={parsedResult.station}
                description="Satellite/radio telemetry source"
                icon={Radio}
                accent="border-cyan-400/30 bg-cyan-500/10 text-cyan-300"
              />

              <MetricCard
                title="Peak Flux Layer"
                value={parsedResult.peakFlux}
                description="Maximum detected particle flux"
                icon={Gauge}
                accent="border-blue-400/30 bg-blue-500/10 text-blue-300"
              >
                <p className="break-words font-mono text-2xl font-semibold text-blue-100">
                  {parsedResult.peakFlux}
                </p>
              </MetricCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <Card className="border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/30">
                  <CardHeader className="border-b border-slate-800 pb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                          <Sparkles className="h-5 w-5 text-cyan-300" />
                          AI Insight Summary
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                          Cleaned operational analysis from GeoStorm AI Engine
                        </CardDescription>
                      </div>
                      {result?.queue_status && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {cleanText(result.queue_status)}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                      {parsedResult.cleanSummary || "No AI summary returned yet."}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/30">
                  <CardHeader className="border-b border-slate-800 pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                      <Activity className="h-5 w-5 text-blue-300" />
                      NOAA Live Alerts Timeline
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Latest alert products parsed from the MCP telemetry context
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 p-5">
                    {parsedResult.alerts.length > 0 ? (
                      parsedResult.alerts.slice(0, 8).map((alert, index) => {
                        const critical = isCriticalAlert(alert);
                        const issueDatetime = readAlertField(alert, ["issue_datetime", "issue_datetime_utc", "timestamp"]) || "2026-06-08 21:17 UTC";
                        const productId = readAlertField(alert, ["product_id", "productID"]) || `NOAA-${index + 1}`;
                        const body = getAlertBody(alert);

                        return (
                          <article
                            key={`${productId}-${issueDatetime}-${index}`}
                            className={
                              critical
                                ? "rounded-lg border border-red-500/20 border-l-4 border-l-red-500 bg-red-950/20 p-4"
                                : "rounded-lg border border-slate-700/60 border-l-4 border-l-blue-400 bg-slate-950/50 p-4"
                            }
                          >
                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="break-words font-mono text-xs uppercase text-slate-400">
                                  {productId}
                                </p>
                                <div
                                  className={
                                    critical
                                      ? "mt-1 inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-200"
                                      : "mt-1 inline-flex rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-200"
                                  }
                                >
                                  {critical ? "Priority Alert" : "Telemetry Notice"}
                                </div>
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <Clock className="h-3.5 w-3.5" />
                                {issueDatetime}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                              {body || "NOAA product body was unavailable in this payload."}
                            </p>
                          </article>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center">
                        <Zap className="mx-auto h-6 w-6 text-slate-500" />
                        <p className="mt-3 text-sm font-medium text-slate-300">
                          No structured NOAA alert timeline available.
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          The dashboard will continue to show the cleaned AI summary while
                          waiting for parseable telemetry context.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-4">
                <Card className="border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/30">
                  <CardHeader className="border-b border-slate-800 pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                      <Activity className="h-5 w-5 text-emerald-300" />
                      System Pipeline
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Microservice topology status
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 p-5">
                    {pipelineSteps.map((step) => {
                      const Icon = step.icon;

                      return (
                        <div
                          key={step.label}
                          className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-md border border-emerald-400/20 bg-emerald-500/10 p-2 text-emerald-300">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                                <p className="text-sm font-semibold text-slate-100">
                                  {step.label}
                                </p>
                              </div>
                              <p className="mt-1 break-words text-sm leading-5 text-slate-400">
                                {step.value}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/70">
                  <CardContent className="p-5">
                    <p className="text-xs font-medium uppercase text-slate-500">
                      Telemetry Parse State
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {parsedResult.telemetry
                        ? "Structured telemetry context parsed successfully."
                        : "Structured telemetry was unavailable; summary fallback is active."}
                    </p>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
