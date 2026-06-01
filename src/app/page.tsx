"use client";

import { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Sparkles, Loader2, Satellite } from "lucide-react";

export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await axios.post("/api/analyze", { prompt });
      setResult(res.data);
      toast.success("Analiz başarıyla tamamlandı.");
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || "FastAPI servisine ulaşılamadı. Lütfen backend'in çalıştığından emin olun.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30">
      <Toaster theme="dark" />
      
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-full mb-2 border border-indigo-500/20">
            <Satellite className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
            Geostorm Telemetri
          </h1>
          <p className="text-slate-400 text-lg">
            Uzay havası verilerini analiz edin ve anomalileri tespit edin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
          <div className="relative flex gap-2 p-2 bg-slate-900 rounded-xl border border-slate-800 shadow-2xl">
            <Input
              type="text"
              placeholder="Örn: TEC verilerinde anomali var mı?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="border-0 bg-transparent text-lg focus-visible:ring-0 focus-visible:ring-offset-0 text-slate-200 placeholder:text-slate-500 h-12"
              disabled={loading}
            />
            <Button 
              type="submit" 
              size="lg"
              disabled={loading || !prompt.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg h-12 px-6"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Analiz Et
                </>
              )}
            </Button>
          </div>
        </form>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in duration-500">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-slate-800"></div>
              <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin absolute top-0 left-0"></div>
            </div>
            <p className="text-slate-400 animate-pulse">AI modeli verileri inceliyor...</p>
          </div>
        )}

        {result && !loading && (
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-500">
            <CardHeader>
              <CardTitle className="text-xl text-slate-200 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Analiz Sonucu
              </CardTitle>
              <CardDescription className="text-slate-400">
                AI Insight Engine tarafından oluşturulan rapor
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none text-slate-300">
                <p className="whitespace-pre-wrap leading-relaxed">{result.summary}</p>
              </div>
              {result.queue_status && (
                <div className="mt-6 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                  <span className="text-sm text-indigo-300">
                    {result.queue_status}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
