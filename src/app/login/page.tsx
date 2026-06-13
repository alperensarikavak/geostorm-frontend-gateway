"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { Loader2, Lock, ShieldAlert, User, Satellite, Key } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Please fill in all credentials.");
      return;
    }

    setLoading(true);

    try {
      await axios.post("/api/auth/login", { username, password });
      toast.success("Authentication successful. Redirecting to operations console...");
      
      // Delay slightly to show success state
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 800);
    } catch (error: any) {
      console.error(error);
      const message = error.response?.data?.error || "Invalid credentials.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center relative overflow-hidden selection:bg-cyan-500/30">
      <Toaster theme="dark" />

      {/* Cyberpunk Top Grid Background Header */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-cyan-950/10 via-transparent to-transparent pointer-events-none opacity-60" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:16px_16px] opacity-40 pointer-events-none" />

      <div className="w-full max-w-[420px] p-4 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Floating operations console logo */}
        <div className="flex flex-col items-center mb-6 space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <Satellite className="h-3.5 w-3.5 animate-pulse text-cyan-400" />
            GeoStorm-AI Operations Gateway
          </div>
        </div>

        {/* Login Credentials Card */}
        <Card className="border-slate-800/80 bg-slate-900/60 shadow-2xl shadow-slate-950/80 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500/30 via-cyan-400 to-cyan-500/30" />
          <CardHeader className="border-b border-slate-800/80 pb-4 text-center">
            <CardTitle className="text-xl font-bold tracking-tight text-slate-50 flex items-center justify-center gap-2">
              <Key className="h-5 w-5 text-cyan-400" />
              Console Access
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Authorize static operator credentials to view space anomaly dashboards.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
                  Operator Identity
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Enter username..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-11 border-slate-800 bg-slate-950/80 pl-10 text-sm text-slate-100 placeholder:text-slate-600 focus-visible:ring-cyan-500/20 disabled:opacity-50"
                    disabled={loading}
                    required
                  />
                  <User className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
                  Security Code
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="Enter password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 border-slate-800 bg-slate-950/80 pl-10 text-sm text-slate-100 placeholder:text-slate-600 focus-visible:ring-cyan-500/20 disabled:opacity-50"
                    disabled={loading}
                    required
                  />
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 px-5 text-sm font-semibold whitespace-nowrap text-slate-950 transition-all shadow-md shadow-cyan-950/20 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-900 disabled:text-slate-500 disabled:opacity-50 disabled:border-transparent disabled:shadow-none mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    Authorizing...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 text-slate-950" />
                    Operator Login
                  </>
                )}
              </button>
            </form>
          </CardContent>
        </Card>

        {/* Footer info message */}
        <div className="flex items-center justify-center gap-1.5 mt-6 text-slate-600 text-[10px] uppercase font-mono tracking-wider">
          <ShieldAlert className="h-3.5 w-3.5 text-slate-700" />
          <span>Local Demo Security Layer Active</span>
        </div>
      </div>
    </div>
  );
}
