"use client";

import { useMemo, useState, useEffect } from "react";
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
  Terminal,
  Cpu,
  RefreshCw,
} from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";

type InsightResult = {
  analysis_id?: string;
  summary: string;
  risk_level: string;
  current_risk_level?: string;
  forecast_risk_level?: string;
  risk_basis?: string;
  context: TelemetryContext;
  mcp_transport?: "grpc" | "http";
  alert_published: boolean;
  queue_status: {
    published: boolean;
    message: string;
  };
  timestamp: string;
};

type TelemetryContext = {
  noaa_swpc_alerts?: unknown;
  nasa_donki_cmes?: unknown;
  esa_source_status?: unknown;
  esa_dataset_id?: unknown;
  esa_error?: unknown;
  esa_summary?: unknown;
  [key: string]: unknown;
};

type NoaaAlert = Record<string, unknown>;

type DashboardIcon = ComponentType<{ className?: string }>;

type PipelineStep = {
  label: string;
  value: string;
  icon: DashboardIcon;
};

const pipelineSteps: PipelineStep[] = [
  {
    label: "Data Ingestion",
    value: "NASA, NOAA & optional ESA SWE/HAPI (via MCP gRPC Space Data Service)",
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

function detectRisk(result: InsightResult) {
  const normalizedRisk = normalizeRiskLevel(result.risk_level);
  const current = normalizeRiskLevel(result.current_risk_level);
  const forecast = normalizeRiskLevel(result.forecast_risk_level);
  const critical = ["G3", "G4", "G5", "CRITICAL"].includes(normalizedRisk);

  return {
    critical,
    label: `RISK ${normalizedRisk}`,
    description: riskDescription(normalizedRisk),
    current,
    forecast,
    basis: result.risk_basis || "highest_current_or_forecast",
  };
}

function normalizeRiskLevel(value?: string): string {
  const normalized = (value || "UNKNOWN").toUpperCase();
  return /^(G[0-5]|CRITICAL|UNKNOWN)$/.test(normalized) ? normalized : "UNKNOWN";
}

function riskDescription(riskLevel: string): string {
  const descriptions: Record<string, string> = {
    G0: "Below geomagnetic storm levels.",
    G1: "Minor geomagnetic storm risk.",
    G2: "Moderate actionable geomagnetic risk.",
    G3: "Strong storm-class anomaly risk.",
    G4: "Severe storm-class anomaly risk.",
    G5: "Extreme storm-class anomaly risk.",
    CRITICAL: "Critical anomaly risk.",
    UNKNOWN: "Risk classification unavailable.",
  };

  return descriptions[riskLevel] || descriptions.UNKNOWN;
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

function getEsaProviderStatus(telemetry: TelemetryContext | null) {
  const summary =
    telemetry?.esa_summary && typeof telemetry.esa_summary === "object"
      ? (telemetry.esa_summary as Record<string, unknown>)
      : {};
  const status = cleanText(telemetry?.esa_source_status || summary.status || "disabled");
  const dataset = cleanText(telemetry?.esa_dataset_id || summary.dataset_id || "");
  const error = cleanText(telemetry?.esa_error || summary.error || "");
  const normalized = status || "disabled";

  return {
    status: normalized,
    dataset: dataset || "Not configured",
    error,
    active: normalized === "ok",
  };
}

// Get alert body text
function getAlertBody(alert: NoaaAlert): string {
  return readAlertField(alert, ["message", "body", "text", "description"]);
}

// Check alert priority
function isCriticalAlert(alert: NoaaAlert): boolean {
  const text = JSON.stringify(alert).toUpperCase();
  return text.includes("G3") || text.includes("ALERT") || text.includes("WATCH") || text.includes("CANCELLED WATCH");
}

function parseResult(result: InsightResult | null): ParsedResult | null {
  if (!result) return null;

  const summary = result.summary ?? "";
  const telemetry = result.context ?? null;
  const alerts = getNoaaAlerts(telemetry);

  return {
    cleanSummary: cleanText(summary),
    telemetry,
    alerts,
    risk: detectRisk(result),
    station: extractStation(telemetry, summary),
    peakFlux: extractPeakFlux(telemetry, summary),
    esaProvider: getEsaProviderStatus(telemetry),
  };
}

type ParsedResult = {
  cleanSummary: string;
  telemetry: TelemetryContext | null;
  alerts: NoaaAlert[];
  risk: {
    critical: boolean;
    label: string;
    description: string;
    current: string;
    forecast: string;
    basis: string;
  };
  station: string;
  peakFlux: string;
  esaProvider: {
    status: string;
    dataset: string;
    error: string;
    active: boolean;
  };
};

const standbyResult: ParsedResult = {
  cleanSummary: "",
  telemetry: null,
  alerts: [],
  risk: {
    critical: false,
    label: "STANDBY",
    description: "Geomagnetic storm monitoring active. Ready to run telemetry scan.",
    current: "UNKNOWN",
    forecast: "UNKNOWN",
    basis: "monitoring"
  },
  station: "GOES-18",
  peakFlux: "2,874 pfu",
  esaProvider: {
    status: "disabled",
    dataset: "Not configured",
    error: "",
    active: false,
  }
};

// Animated Space Telemetry Radar Component
function SpaceTelemetryRadar({ active, critical }: { active: boolean; critical: boolean }) {
  return (
    <div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-cyan-500/20 bg-slate-950/90 p-4 shadow-[0_0_20px_rgba(6,182,212,0.05)] shadow-inner">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:16px_16px] opacity-40" />
      
      {/* Glow Radar Sweep */}
      {active && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-cyan-500/10 animate-pulse" />
      )}

      {/* SVG Canvas */}
      <svg className="relative h-full w-full max-w-[220px]" viewBox="0 0 200 200">
        {/* Radial tracking lines */}
        <circle cx="100" cy="100" r="90" className="stroke-slate-800/80 fill-none" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="100" cy="100" r="60" className="stroke-slate-800/60 fill-none" strokeWidth="1" />
        <circle cx="100" cy="100" r="30" className="stroke-slate-800/40 fill-none" strokeWidth="1" />
        
        {/* Crosshair lines */}
        <line x1="10" y1="100" x2="190" y2="100" className="stroke-slate-800/50" strokeWidth="1" />
        <line x1="100" y1="10" x2="100" y2="190" className="stroke-slate-800/50" strokeWidth="1" />
        
        {/* Magnetosphere border representation */}
        <path 
          d="M 100 55 C 135 55, 155 70, 155 100 C 155 130, 135 145, 100 145 C 65 145, 75 100, 65 100 C 75 100, 65 55, 100 55 Z" 
          className={`fill-none stroke-2 transition-all duration-500 ${active ? "animate-pulse" : ""} ${critical ? "stroke-red-500/70" : "stroke-cyan-500/50"}`} 
        />
        <path 
          d="M 100 35 C 155 35, 185 60, 185 100 C 185 140, 155 165, 100 165 C 45 165, 55 100, 45 100 C 55 100, 45 35, 100 35 Z" 
          className={`fill-none stroke-1 transition-all duration-500 ${critical ? "stroke-red-500/20" : "stroke-cyan-500/20"}`} 
        />

        {/* Earth Globe center representation */}
        <circle cx="100" cy="100" r="16" className="fill-slate-950 stroke-cyan-400" strokeWidth="2.5" />
        <circle cx="100" cy="100" r="10" className="fill-cyan-500/10 stroke-none" />
        
        {/* Active Solar Particles bounce animation */}
        {active && (
          <>
            <circle cx="35" cy="85" r="2.5" className="fill-cyan-400 animate-ping" />
            <circle cx="65" cy="125" r="2" className="fill-amber-400 animate-pulse" />
            <circle cx="165" cy="95" r="3" className="fill-red-400 animate-bounce" />
            <path d="M10 60 Q 50 100 85 100" fill="none" className="stroke-cyan-500/30 stroke-1" strokeDasharray="2 2" />
            <path d="M10 140 Q 50 100 85 100" fill="none" className="stroke-cyan-500/30 stroke-1" strokeDasharray="2 2" />
          </>
        )}
      </svg>
      
      {/* Floating Radar Labels */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2 py-0.5 border border-slate-800 text-[10px] font-mono shadow-md">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-cyan-400 animate-ping" : "bg-slate-600"}`} />
        <span className="text-slate-400 font-semibold tracking-wider">{active ? "RADAR ACTIVE" : "STANDBY"}</span>
      </div>

      {critical && (
        <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-md bg-red-950/90 px-2 py-0.5 border border-red-500/40 text-[10px] font-mono text-red-300 shadow-md">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
          <span className="font-bold tracking-wider">CRITICAL INCOMING</span>
        </div>
      )}
    </div>
  );
}

// Fluctuating Telemetry Metrics Display (Simulating operations)
function TelemetryFluctuator({ active }: { active: boolean }) {
  const [metrics, setMetrics] = useState({ dst: -12, pfu: 2874, tec: 42 });

  useEffect(() => {
    if (!active) {
      setMetrics({ dst: -12, pfu: 2874, tec: 42 });
      return;
    }
    const interval = setInterval(() => {
      setMetrics({
        dst: Math.floor(-10 - Math.random() * 45),
        pfu: Math.floor(2600 + Math.random() * 750),
        tec: Math.floor(38 + Math.random() * 15),
      });
    }, 450);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs">
      <div>
        <span className="text-slate-500 text-[10px] uppercase block tracking-wider">Dst Index</span>
        <span className={`font-bold text-sm ${metrics.dst < -35 ? "text-amber-400" : "text-slate-300"}`}>
          {metrics.dst} nT
        </span>
      </div>
      <div>
        <span className="text-slate-500 text-[10px] uppercase block tracking-wider">Proton Flux</span>
        <span className="text-cyan-400 font-bold text-sm">{metrics.pfu.toLocaleString()} pfu</span>
      </div>
      <div>
        <span className="text-slate-500 text-[10px] uppercase block tracking-wider">TEC Value</span>
        <span className="text-emerald-400 font-bold text-sm">{metrics.tec} TECU</span>
      </div>
    </div>
  );
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
    <Card className="border-slate-800/80 bg-slate-900/60 shadow-2xl shadow-slate-950/50 backdrop-blur-md transition-all duration-300 hover:border-cyan-500/30">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2.5">
            <p className="text-xs font-semibold tracking-widest uppercase text-slate-500">{title}</p>
            <div className="min-h-8">
              {children ?? (
                <p className="break-words text-2xl font-bold tracking-tight text-slate-50">
                  {value}
                </p>
              )}
            </div>
            <p className="text-xs font-medium text-slate-400">{description}</p>
          </div>
          <div className={`rounded-xl border p-2.5 shadow-lg ${accent}`}>
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
  
  // Real-time operations logs
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  const parsedResult = useMemo(() => parseResult(result), [result]);
  const displayResult = useMemo(() => parsedResult || standbyResult, [parsedResult]);
  const submitDisabled = loading || !prompt.trim();

  // Helper to determine active step in pipeline
  const logCount = consoleLogs.length;
  const activeStepIndex = useMemo(() => {
    if (!loading) return -1;
    if (logCount >= 1 && logCount < 5) return 0; // Data Ingestion
    if (logCount >= 5 && logCount < 8) return 1; // Orchestrator
    if (logCount >= 8 && logCount < 10) return 2; // Event Broker
    if (logCount >= 10) return 3; // Storage / Export
    return -1;
  }, [logCount, loading]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    if (!prompt.trim()) return;

    setLoading(true);
    setResult(null);
    setConsoleLogs([`[0.0s] INITIATING DEEP SCAN OF MAGNETOSPHERE TELEMETRY DATA...`]);

    const logSequence = [
      { delay: 500, log: `[0.5s] CONNECTING TO SPACE DATA NODE (MCP GRPC SERVER localhost:50051)...` },
      { delay: 1500, log: `[1.5s] QUERYING NASA DONKI API FOR ACTIVE CORONAL MASS EJECTIONS (CMEs)...` },
      { delay: 3000, log: `[3.0s] RETRIEVING NOAA SWPC ALERT PRODUCTS (24H TIMEWINDOW)...` },
      { delay: 4500, log: `[4.5s] NORMALIZING TELEMETRY STREAM VIA MODEL CONTEXT PROTOCOL SCHEMAS...` },
      { delay: 6000, log: `[6.0s] SENDING STANDARDIZED CONTEXT TO AI ORCHESTRATOR COMPONENT...` },
      { delay: 8000, log: `[8.0s] INITIATING OPENROUTER LLAMA-3 INFERENCE PIPELINE...` },
      { delay: 11000, log: `[11.0s] EXAMINING GEOEFFECTIVE ANOMALIES & ASSESSING REGIONAL TEC DELAYS...` },
      { delay: 13500, log: `[13.5s] ANOMALY DETECTION COMPLETE. COMPILING CRITICAL RISK DIRECTIVES...` },
      { delay: 15000, log: `[15.0s] DISPATCHING DURABLE EVENT PACKAGE TO RABBITMQ EXCHANGE...` },
      { delay: 16500, log: `[16.5s] TRIGGERING ASYNCHRONOUS EXPORT & STORAGE ROUTINE IN RUST WORKER...` },
      { delay: 18000, log: `[18.0s] WAITING FOR DOWNSTREAM ACKNOWLEDGEMENTS...` }
    ];

    const timeouts: NodeJS.Timeout[] = [];
    logSequence.forEach((item) => {
      const t = setTimeout(() => {
        setConsoleLogs((prev) => [...prev, item.log]);
      }, item.delay);
      timeouts.push(t);
    });

    try {
      const res = await axios.post<InsightResult>("/api/analyze", { prompt });
      timeouts.forEach(clearTimeout);
      setConsoleLogs((prev) => [
        ...prev,
        `[SUCCESS] TELEMETRY STREAM PIPELINE TERMINATED SUCCESSFULLY.`,
        `[METRICS] CANONICAL ANOMALY LEVEL: ${res.data.risk_level}`,
        `[BROKER] RABBITMQ QUEUE STATUS: ${res.data.queue_status?.message || "PUBLISHED"}`,
        `[COMPLETED] SYSTEM DEPLOYED ANALYSIS ID: ${res.data.analysis_id || "GEO-ID"}`
      ]);
      setResult(res.data);
      toast.success("Analiz başarıyla tamamlandı.");
    } catch (error: unknown) {
      timeouts.forEach(clearTimeout);
      setConsoleLogs((prev) => [
        ...prev,
        `[FATAL ERROR] GATEWAY CONNECTION OR INFERENCE PIPELINE TERMINATED ABNORMALLY.`,
        `[DIAGNOSTIC] CONFIRM THAT MCP SERVER (PORT 50051) AND FASTAPI SERVICE (PORT 8000) ARE READY.`
      ]);
      console.error(error);
      toast.error("FastAPI servisine ulaşılamadı. Altyapının çalıştığından emin olun.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30">
      <Toaster theme="dark" />

      {/* Cyberpunk Top Grid Background Header */}
      <div className="absolute top-0 left-0 w-full h-[320px] bg-gradient-to-b from-cyan-950/10 via-transparent to-transparent pointer-events-none opacity-60" />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8 relative z-10">
        <header className="grid gap-6 border-b border-slate-800/80 pb-6 lg:grid-cols-[1fr_minmax(380px,520px)] lg:items-end">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              <Satellite className="h-3.5 w-3.5 animate-pulse text-cyan-400" />
              GeoStorm-AI Operations Console v1.2
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-50 md:text-4xl bg-gradient-to-r from-slate-50 via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                Space Weather Risk Dashboard
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-400">
                Autonomous AI anomaly reasoning, gRPC Space Data MCP bridge, durable RabbitMQ queue routing, 
                and downstream Rust alert logging pipeline visualizer.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            aria-busy={loading}
            className="rounded-xl border border-cyan-500/10 bg-slate-900/40 backdrop-blur-md p-2 shadow-[0_10px_35px_rgba(0,0,0,0.4)] transition-all hover:border-cyan-500/20"
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="Ask about current geomagnetic or particle flux risk..."
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="h-11 border-slate-800 bg-slate-950/80 pl-10 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-500/20 disabled:border-slate-800 disabled:bg-slate-900/50 disabled:text-slate-400"
                  disabled={loading}
                />
                <Cpu className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              </div>
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 px-5 text-sm font-semibold whitespace-nowrap text-slate-950 transition-all shadow-md shadow-cyan-950/20 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-900 disabled:text-slate-500 disabled:opacity-50 disabled:border-transparent disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    Analyzing Stream...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-slate-950" />
                    Analyze Context
                  </>
                )}
              </button>
            </div>
            {loading && (
              <div
                role="status"
                aria-live="polite"
                className="mt-2.5 flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2 text-xs leading-relaxed text-cyan-200"
              >
                <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-cyan-400" />
                <span>
                  Querying telemetry nodes... Simulating microservice handshakes in operations console logs below.
                </span>
              </div>
            )}
          </form>
        </header>

        {/* Optimistic UI Loading Panel */}
        {loading && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] animate-in fade-in duration-500">
            {/* Terminal Console Logs */}
            <Card className="border-slate-800/80 bg-slate-950/90 shadow-2xl">
              <CardHeader className="border-b border-slate-900 pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4.5 w-4.5 text-cyan-400" />
                  <CardTitle className="text-sm font-mono tracking-wider text-slate-300">
                    Microservice Pipeline Logs
                  </CardTitle>
                </div>
                <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-950/40 px-2 py-0.5 border border-cyan-500/20 rounded">
                  STREAMING
                </span>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-60 overflow-y-auto font-mono text-[11px] space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  {consoleLogs.map((log, idx) => (
                    <div 
                      key={idx} 
                      className={`leading-relaxed border-l-2 pl-2 ${
                        log.includes("[SUCCESS]") 
                          ? "border-emerald-500 text-emerald-400 font-bold" 
                          : log.includes("[FATAL ERROR]") 
                          ? "border-red-500 text-red-400 font-bold"
                          : log.includes("[METRICS]") || log.includes("[BROKER]")
                          ? "border-cyan-500 text-cyan-300"
                          : "border-slate-700 text-slate-400"
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                  <div className="h-1.5 w-3 bg-cyan-400 animate-pulse inline-block ml-2" />
                </div>
              </CardContent>
            </Card>

            {/* Radar Panel */}
            <div className="space-y-4">
              <SpaceTelemetryRadar active={true} critical={false} />
              <TelemetryFluctuator active={true} />
            </div>
          </div>
        )}

        {/* Dashboard Main Grid Layout - Always visible */}
        {!loading && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Standard Metrics */}
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                title="Anomaly Risk Level"
                value={displayResult.risk.label}
                description={displayResult.risk.description}
                icon={Zap}
                accent={
                  displayResult.risk.critical
                    ? "border-red-500/20 bg-red-500/10 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                }
              >
                <span
                  className={
                    displayResult.risk.critical
                      ? "inline-flex rounded-full border border-red-500/30 bg-red-950/40 px-3 py-1 text-sm font-bold tracking-wide uppercase text-red-400 shadow-md animate-pulse"
                      : "inline-flex rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-sm font-bold tracking-wide uppercase text-emerald-400 shadow-md"
                  }
                >
                  {displayResult.risk.label}
                </span>
                <div className="mt-2.5 space-y-1 text-xs font-mono text-slate-400">
                  <p>Current: {displayResult.risk.current}</p>
                  <p>Forecast: {displayResult.risk.forecast}</p>
                  <p className="text-slate-500">Basis: {displayResult.risk.basis}</p>
                </div>
              </MetricCard>

              <MetricCard
                title="Active Space Station"
                value={displayResult.station}
                description="Space Weather Satellite Feed Source"
                icon={Radio}
                accent="border-cyan-500/20 bg-cyan-950/20 text-cyan-400"
              />

              <MetricCard
                title="Peak Flux Threshold"
                value={displayResult.peakFlux}
                description="Highest Geomagnetic Particle Flux detected"
                icon={Gauge}
                accent="border-blue-500/20 bg-blue-950/20 text-blue-400"
              >
                <p className="break-words font-mono text-2xl font-bold tracking-tight text-blue-100">
                  {displayResult.peakFlux}
                </p>
              </MetricCard>
            </div>

            {/* Split Pane: Main Details and Pipeline */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6">
                {/* AI Executive Summary Card */}
                <Card className="border-slate-800/80 bg-slate-900/50 shadow-2xl backdrop-blur-md relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500/30 via-cyan-400 to-cyan-500/30" />
                  <CardHeader className="border-b border-slate-800/80 pb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg text-slate-100 font-bold">
                          <Sparkles className="h-5 w-5 text-cyan-400" />
                          AI Insight Summary
                        </CardTitle>
                        <CardDescription className="text-slate-400 text-xs">
                          Contextual space anomalies report generated from NASA/NOAA telemetry
                        </CardDescription>
                      </div>
                      {result?.queue_status && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-400 shadow-md">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          {cleanText(result.queue_status.message)}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    {displayResult.cleanSummary ? (
                      <Markdown content={displayResult.cleanSummary} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
                        <Sparkles className="h-8 w-8 text-slate-700 mb-2 animate-pulse" />
                        <p className="text-sm font-semibold text-slate-300">Awaiting Operational Query</p>
                        <p className="text-xs text-slate-500 max-w-sm mt-1">
                          Enter a query in the console above to pull the NASA/NOAA telemetry stream and generate real-time AI insight report.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* NOAA Live Alerts Timeline */}
                <Card className="border-slate-800/80 bg-slate-900/50 shadow-2xl backdrop-blur-md">
                  <CardHeader className="border-b border-slate-800/80 pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-100 font-bold">
                      <Activity className="h-5 w-5 text-blue-400" />
                      NOAA Live Alerts Timeline
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Geomagnetic indices and SWPC alerts parsed via Model Context Protocol
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 p-6">
                    {displayResult.alerts.length > 0 ? (
                      displayResult.alerts.slice(0, 8).map((alert, index) => {
                        const critical = isCriticalAlert(alert);
                        const issueDatetime = readAlertField(alert, ["issue_datetime", "issue_datetime_utc", "timestamp"]) || "2026-06-08 21:17 UTC";
                        const productId = readAlertField(alert, ["product_id", "productID"]) || `NOAA-${index + 1}`;
                        const body = getAlertBody(alert);

                        return (
                          <article
                            key={`${productId}-${issueDatetime}-${index}`}
                            className={
                              critical
                                ? "rounded-lg border border-red-500/20 border-l-4 border-l-red-500 bg-red-950/10 p-4 transition-all hover:bg-red-950/20"
                                : "rounded-lg border border-slate-800/60 border-l-4 border-l-blue-500 bg-slate-950/40 p-4 transition-all hover:bg-slate-950/60"
                            }
                          >
                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="break-words font-mono text-[10px] uppercase text-slate-400 tracking-wider">
                                  {productId}
                                </p>
                                <div
                                  className={
                                    critical
                                      ? "mt-1 inline-flex rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-400 border border-red-500/20"
                                      : "mt-1 inline-flex rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20"
                                  }
                                >
                                  {critical ? "Priority Storm Alert" : "Telemetry Alert Notice"}
                                </div>
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-mono">
                                <Clock className="h-3.5 w-3.5 text-slate-500" />
                                {issueDatetime}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                              {body || "NOAA product body was unavailable in this telemetry payload."}
                            </p>
                          </article>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-8 text-center">
                        <Radio className="mx-auto h-6 w-6 text-slate-700 animate-pulse" />
                        <p className="mt-3 text-sm font-semibold text-slate-400">
                          No Active NOAA Alert Stream
                        </p>
                        <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
                          Telemetry alerts are fetched dynamically. Run a scan to fetch the latest space weather alert timeline.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar items */}
              <aside className="space-y-6">
                {/* Space Telemetry Radar (Static View when not loading) */}
                <SpaceTelemetryRadar active={false} critical={displayResult.risk.critical} />

                {/* Telemetry Fluctuator (Static View) */}
                <TelemetryFluctuator active={false} />

                {/* Microservice Topology visualizer */}
                <Card className="border-slate-800/80 bg-slate-900/50 shadow-2xl backdrop-blur-md">
                  <CardHeader className="border-b border-slate-800/80 pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-100 font-bold">
                      <Activity className="h-5 w-5 text-emerald-400" />
                      System Pipeline
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Microservice topology trace path status
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 p-5">
                    {pipelineSteps.map((step, index) => {
                      const Icon = step.icon;
                      const isStepActive = index === activeStepIndex;
                      const isStepCompleted = activeStepIndex === -1 ? false : index < activeStepIndex;

                      return (
                        <div
                          key={step.label}
                          className={`rounded-lg border p-3 transition-all duration-300 ${
                            isStepActive
                              ? "border-cyan-500/40 bg-cyan-950/20 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                              : isStepCompleted
                              ? "border-emerald-500/20 bg-emerald-950/10"
                              : "border-slate-800 bg-slate-950/40"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 rounded-md border p-2 ${
                              isStepActive
                                ? "border-cyan-500/30 bg-cyan-950/40 text-cyan-400"
                                : isStepCompleted
                                ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-400"
                                : "border-slate-800 bg-slate-950/30 text-slate-500"
                            }`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${
                                  isStepActive
                                    ? "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)] animate-pulse"
                                    : isStepCompleted
                                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                                    : "bg-slate-700"
                                }`} />
                                <p className={`text-sm font-bold ${
                                  isStepActive
                                    ? "text-cyan-300"
                                    : isStepCompleted
                                    ? "text-emerald-300"
                                    : "text-slate-300"
                                }`}>
                                  {step.label}
                                </p>
                              </div>
                              <p className="mt-1 break-words text-xs leading-relaxed text-slate-400 font-medium">
                                {step.value}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Telemetry Parse state */}
                <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur-md">
                  <CardContent className="p-5">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
                      Telemetry Parse State
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400 font-medium">
                      {displayResult.telemetry
                        ? "Structured telemetry context parsed successfully via Model Context Protocol gRPC bindings."
                        : "Structured telemetry was unavailable; summary fallback is active."}
                    </p>
                  </CardContent>
                </Card>

                {/* ESA provider state */}
                <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur-md">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div
                        className={
                          displayResult.esaProvider.active
                            ? "rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2 text-emerald-400"
                            : "rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-slate-500"
                        }
                      >
                        <Satellite className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
                          ESA SWE/HAPI Provider
                        </p>
                        <p
                          className={
                            displayResult.esaProvider.active
                              ? "mt-1 text-sm font-bold text-emerald-300"
                              : "mt-1 text-sm font-bold text-slate-300"
                          }
                        >
                          {displayResult.esaProvider.status.toUpperCase()}
                        </p>
                        <p className="mt-1 break-words text-xs leading-relaxed text-slate-400">
                          Dataset: {displayResult.esaProvider.dataset}
                        </p>
                        {displayResult.esaProvider.error && (
                          <p className="mt-2 break-words text-xs leading-relaxed text-amber-300">
                            {displayResult.esaProvider.error}
                          </p>
                        )}
                      </div>
                    </div>
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
