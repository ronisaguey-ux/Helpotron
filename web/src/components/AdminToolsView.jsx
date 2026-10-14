import React, { useState, useEffect } from "react";
import {
  Cpu,
  Server,
  Zap,
  HardDrive,
  MessageSquare,
  Terminal,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Trash2,
} from "lucide-react";
import api from "../api.js";

export default function AdminToolsView() {
  // 1. Engine status state
  const [nodes, setNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [nodesError, setNodesError] = useState(false);

  // 2. Model scorecards state
  const [modelMetrics, setModelMetrics] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // 3. Storage telemetry state
  const [storageData, setStorageData] = useState(null);

  // 4. Inquiries queue state
  const [inquiries, setInquiries] = useState([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(true);
  const [replyTextMap, setReplyTextMap] = useState({});
  const [replyingId, setReplyingId] = useState(null);
  const [deletingInquiryId, setDeletingInquiryId] = useState(null);
  const [replyFeedback, setReplyFeedback] = useState("");

  // 5. Agent command console state
  const [commandInput, setCommandInput] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([
    {
      type: "system",
      text: "Helpotron Fleet Command Shell v4.0.0 [Admin Session Active]. Type a command or question below.",
      time: new Date().toLocaleTimeString(),
    },
  ]);

  // Fetch Engine nodes (real nodes or honest empty)
  const loadEngineNodes = async () => {
    setNodesLoading(true);
    setNodesError(false);
    try {
      const res = await api.adminSystemMapNodes();
      setNodes(Array.isArray(res?.nodes) ? res.nodes : []);
    } catch (e) {
      console.warn("Failed to load engine nodes:", e);
      setNodes([]);
      setNodesError(true);
    } finally {
      setNodesLoading(false);
    }
  };

  // Fetch Model scorecards
  const loadModelMetrics = async () => {
    setModelsLoading(true);
    try {
      const res = await fetch("/api/admin/model-metrics").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (res?.models && Array.isArray(res.models)) {
        setModelMetrics(res.models);
      } else {
        // No fabricated scorecards: an unreported endpoint stays empty,
        // and the table surface below shows an honest "no data" row.
        setModelMetrics([]);
      }
    } catch (e) {
      setModelMetrics([]);
    } finally {
      setModelsLoading(false);
    }
  };

  // Fetch Storage telemetry
  const loadStorage = async () => {
    try {
      const res = await fetch("/api/admin/system-health").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setStorageData(res || null);
    } catch (e) {
      setStorageData(null);
    }
  };

  // Fetch Inquiries
  const loadInquiries = async () => {
    setInquiriesLoading(true);
    try {
      const res = await api.getAllAdminMessages();
      const list = Array.isArray(res?.messages) ? res.messages : (Array.isArray(res) ? res : []);
      setInquiries(list);
    } catch (e) {
      console.warn("Failed fetching inquiries:", e);
      setInquiries([]);
    } finally {
      setInquiriesLoading(false);
    }
  };

  useEffect(() => {
    loadEngineNodes();
    loadModelMetrics();
    loadStorage();
    loadInquiries();
  }, []);

  // Handle Reply to Inquiry
  const handleReplyInquiry = async (messageId) => {
    const text = (replyTextMap[messageId] || "").trim();
    if (!text) return;
    setReplyingId(messageId);
    setReplyFeedback("");
    try {
      await api.replyToAdminMessage(messageId, text);
      setReplyFeedback(`Reply sent to inquiry #${messageId}`);
      setInquiries((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reply: text, status: "replied" } : m))
      );
      setReplyTextMap((prev) => ({ ...prev, [messageId]: "" }));
      setTimeout(() => setReplyFeedback(""), 3500);
    } catch (e) {
      setReplyFeedback("Failed sending reply.");
    } finally {
      setReplyingId(null);
    }
  };

  const handleDeleteInquiry = async (messageId) => {
    setDeletingInquiryId(messageId);
    try {
      await api.deleteAdminMessage(messageId);
      setInquiries((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      console.warn("Failed to delete inquiry:", e);
    } finally {
      setDeletingInquiryId(null);
    }
  };

  // Handle Agent Command Box Submission
  const handleExecuteCommand = async (cmdToRun) => {
    const query = (cmdToRun || commandInput).trim();
    if (!query || commandBusy) return;

    const time = new Date().toLocaleTimeString();
    setConsoleLogs((prev) => [...prev, { type: "user", text: query, time }]);
    setCommandInput("");
    setCommandBusy(true);

    try {
      const res = await api.agentChat({
        assignment_id: 0,
        text: query,
        session_mode_override: "auto",
      });

      const reply = res?.reply || "Done.";
      setConsoleLogs((prev) => [
        ...prev,
        {
          type: "agent",
          text: reply,
          time: new Date().toLocaleTimeString(),
          execution: res?.execution,
        },
      ]);
    } catch (err) {
      setConsoleLogs((prev) => [
        ...prev,
        {
          type: "error",
          text: err?.message || "Execution error encountered on agent channel.",
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setCommandBusy(false);
    }
  };

  const numOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const dbUsed = numOrNull(storageData?.database_size_mb);
  const vectorUsed = numOrNull(storageData?.vector_index_size_mb);
  const lakeUsed = numOrNull(storageData?.datalake_size_mb);
  const totalStorageUsed = [dbUsed, vectorUsed, lakeUsed].every((v) => v !== null)
    ? dbUsed + vectorUsed + lakeUsed
    : null;
  const storageLimit = numOrNull(storageData?.storage_limit_mb);
  const storagePercent =
    totalStorageUsed !== null && storageLimit !== null && storageLimit > 0
      ? Math.min(100, Math.round((totalStorageUsed / storageLimit) * 100))
      : null;

  return (
    <div className="space-y-6">
      {/* View Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-title-md text-title-md text-on-surface font-semibold flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            Platform Engines, Subsystems &amp; Command Shell
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
            Two-column progressive disclosure: live node telemetry, model scorecards, storage quotas, and autonomous shell.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            loadEngineNodes();
            loadModelMetrics();
            loadStorage();
            loadInquiries();
          }}
          className="h-10 px-4 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-caps text-xs flex items-center gap-2 transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-primary" />
          <span>Refresh Subsystems</span>
        </button>
      </div>

      {replyFeedback && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-code-sm text-primary">
          {replyFeedback}
        </div>
      )}

      {/* 2-Column Progressive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Engine Status, Model Scorecards, Storage (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Subsystem Engine Status */}
          <div className="p-6 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                <h3 className="font-title-md text-sm font-semibold text-on-surface">
                  System Services
                </h3>
              </div>
              <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/10 px-2 py-0.5 rounded-full">
                Live
              </span>
            </div>

            {nodesLoading ? (
              <div className="p-6 text-center text-xs font-code-sm text-on-surface-variant">
                Loading system status…
              </div>
            ) : nodesError || nodes.length === 0 ? (
              <div className="p-6 rounded-xl bg-surface-container-low/50 border border-outline-variant/20 text-center space-y-2">
                <p className="font-code-sm text-xs text-on-surface-variant">
                  No system services are reporting right now.
                </p>
                <button
                  type="button"
                  onClick={loadEngineNodes}
                  className="text-primary hover:underline text-xs font-code-sm"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {nodes.map((n) => {
                  const isHealthy = n.status === "operational" || n.status === "healthy";
                  return (
                    <div
                      key={n.name}
                      className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-title-md text-xs font-medium text-on-surface truncate">
                          {n.name}
                        </div>
                        <div className="font-code-sm text-[11px] text-on-surface-variant mt-0.5">
                          p95: {n.p95_latency_ms != null ? `${n.p95_latency_ms}ms` : "—"}
                        </div>
                      </div>
                      <span
                        className={`font-chip-status text-[10px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5 shrink-0 ${
                          isHealthy
                            ? "bg-sem-green/15 text-sem-green"
                            : "bg-sem-amber/15 text-sem-amber"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isHealthy ? "bg-sem-green" : "bg-sem-amber"
                          }`}
                        />
                        {n.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model Scorecards */}
          <div className="p-6 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="font-title-md text-sm font-semibold text-on-surface">
                  Model Scorecards &amp; Latency Profiles
                </h3>
              </div>
              <span className="font-code-sm text-[11px] text-on-surface-variant">
                p50 / p95 Real-World Tail
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-container-low/80 font-label-caps text-[10px] uppercase text-on-surface-variant border-b border-outline-variant/20">
                    <th className="py-2.5 px-3">Model / Architecture</th>
                    <th className="py-2.5 px-3">p50</th>
                    <th className="py-2.5 px-3">p95 (Tail)</th>
                    <th className="py-2.5 px-3">Success</th>
                    <th className="py-2.5 px-3 text-right">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15 font-code-sm">
                  {modelMetrics.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-center text-outline text-xs">
                        No model metrics reported by the server yet — nothing is estimated.
                      </td>
                    </tr>
                  )}
                  {modelMetrics.map((m) => (
                    <tr key={m.name} className="hover:bg-surface-container-low/40">
                      <td className="py-3 px-3">
                        <span className="text-on-surface font-medium block">{m.name}</span>
                        <span className="text-outline text-[10px]">{m.provider || "—"}</span>
                      </td>
                      <td className="py-3 px-3 text-on-surface-variant">
                        {m.p50_ms ? `${m.p50_ms}ms` : "—"}
                      </td>
                      <td className="py-3 px-3 text-primary font-medium">
                        {m.p95_ms ? `${m.p95_ms}ms` : "—"}
                      </td>
                      <td className="py-3 px-3 text-sem-green">
                        {m.success_rate != null ? `${m.success_rate}%` : "—"}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`font-chip-status text-[10px] px-2 py-0.5 rounded-full ${
                            m.status === "operational"
                              ? "text-sem-green bg-sem-green/10"
                              : "text-on-surface-variant bg-surface-container-high/60"
                          }`}
                        >
                          {m.status === "operational" ? "ONLINE" : "NOT REPORTED"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Storage & Sandbox Capacity */}
          <div className="p-6 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                <h3 className="font-title-md text-sm font-semibold text-on-surface">
                  Storage, Data Lake &amp; Sandboxes
                </h3>
              </div>
              <span className="font-code-sm text-[11px] text-on-surface-variant">
                {totalStorageUsed !== null
                  ? `${totalStorageUsed.toFixed(1)} MB / ${storageLimit} MB (${storagePercent}%)`
                  : "Not reported by server"}
              </span>
            </div>

            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: storagePercent !== null ? `${storagePercent}%` : "0%" }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-code-sm text-xs">
              <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20">
                <span className="text-outline text-[10px] block uppercase">SQLite WAL State</span>
                <span className="text-on-surface text-sm font-semibold mt-1 block">
                  {dbUsed !== null ? `${dbUsed.toFixed(1)} MB` : "—"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20">
                <span className="text-outline text-[10px] block uppercase">Vector Index Cache</span>
                <span className="text-primary text-sm font-semibold mt-1 block">
                  {vectorUsed !== null ? `${vectorUsed.toFixed(1)} MB` : "—"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20">
                <span className="text-outline text-[10px] block uppercase">Data Lake Pipeline</span>
                <span className="text-secondary text-sm font-semibold mt-1 block">
                  {lakeUsed !== null ? `${lakeUsed.toFixed(1)} MB` : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Student Inquiries + Command Shell (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Agent Command Box */}
          <div className="p-6 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h3 className="font-title-md text-sm font-semibold text-on-surface">
                  Admin Fleet Shell
                </h3>
              </div>
              <span className="font-code-sm text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                AUTO-ADMIN
              </span>
            </div>

            {/* Terminal Window Output */}
            <div className="h-64 rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-3.5 overflow-y-auto space-y-2 font-code-sm text-xs">
              {consoleLogs.map((log, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-outline">
                    <span>[{log.time}]</span>
                    <span className={log.type === "user" ? "text-primary" : log.type === "agent" ? "text-secondary" : "text-on-surface-variant"}>
                      {log.type === "user" ? "OPERATOR>" : log.type === "agent" ? "AGENT>" : "SYS>"}
                    </span>
                  </div>
                  <div className={`whitespace-pre-wrap pl-2 border-l-2 ${
                    log.type === "user"
                      ? "border-primary text-on-surface"
                      : log.type === "agent"
                      ? "border-secondary text-primary"
                      : log.type === "error"
                      ? "border-error text-error"
                      : "border-outline text-on-surface-variant"
                  }`}>
                    {log.text}
                  </div>
                </div>
              ))}
              {commandBusy && (
                <div className="text-primary text-xs animate-pulse pl-2">
                  Executing command via orchestrator…
                </div>
              )}
            </div>

            {/* Command Suggestions */}
            <div className="flex flex-wrap gap-1.5">
              {[
                "Check system health",
                "Show platform stats",
                "Lookup user activity",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleExecuteCommand(s)}
                  disabled={commandBusy}
                  className="px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant text-[11px] font-code-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input Row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteCommand();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Type agent command or inquiry..."
                disabled={commandBusy}
                className="flex-1 h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface placeholder:text-outline border border-outline-variant/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={commandBusy || !commandInput.trim()}
                className="h-10 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-xs flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Run</span>
              </button>
            </form>
          </div>

          {/* Student & Tenant Inquiries */}
          <div className="p-6 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-secondary" />
                <h3 className="font-title-md text-sm font-semibold text-on-surface">
                  Direct Student Inquiries
                </h3>
              </div>
              <span className="font-code-sm text-[10px] text-secondary bg-secondary/15 px-2 py-0.5 rounded-full">
                {inquiries.length} {inquiries.length === 1 ? "inquiry" : "inquiries"}
              </span>
            </div>

            {inquiriesLoading ? (
              <div className="p-4 text-center text-xs font-code-sm text-on-surface-variant">
                Loading messages…
              </div>
            ) : inquiries.length === 0 ? (
              <div className="p-4 rounded-xl bg-surface-container-low/40 text-center font-code-sm text-xs text-on-surface-variant">
                No open student inquiries in the inbox.
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {inquiries.map((m) => {
                  const isReplied = m.status === "replied" || !!m.reply;
                  return (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-semibold text-on-surface block">
                            {m.subject || "Student Assistance Request"}
                          </span>
                          <span className="font-code-sm text-[10px] text-outline">
                            From {m.public_id || m.user_id || "Anonymous User"} · {m.created_at ? new Date(m.created_at).toLocaleDateString() : "Recent"}
                          </span>
                        </div>
                        <span
                          className={`font-chip-status text-[9px] uppercase px-2 py-0.5 rounded-full shrink-0 ${
                            isReplied
                              ? "bg-sem-green/15 text-sem-green"
                              : "bg-sem-amber/15 text-sem-amber"
                          }`}
                        >
                          {isReplied ? "Replied" : "Open"}
                        </span>
                      </div>

                      <p className="text-on-surface-variant bg-surface-container-lowest/50 p-2.5 rounded-lg border border-outline-variant/10 text-[11px]">
                        {m.message || m.body || "(No message body)"}
                      </p>

                      {isReplied && m.reply && (
                        <div className="pl-2.5 border-l-2 border-primary text-[11px] text-primary font-code-sm">
                          <span className="text-outline text-[9px] block uppercase">Operator Reply:</span>
                          {m.reply}
                        </div>
                      )}

                      {!isReplied && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            aria-label="Operator reply message"
                            placeholder="Type response..."
                            value={replyTextMap[m.id] || ""}
                            onChange={(e) =>
                              setReplyTextMap((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                            className="flex-1 min-h-[40px] px-2.5 rounded-lg bg-surface-container text-on-surface border border-outline-variant/30 text-xs focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={replyingId === m.id}
                            onClick={() => handleReplyInquiry(m.id)}
                            className="min-h-[40px] px-3 rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Reply</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInquiry(m.id)}
                            disabled={deletingInquiryId === m.id}
                            className="h-8 w-8 rounded-lg hover:bg-error/15 text-on-surface-variant hover:text-error flex items-center justify-center transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Dismiss inquiry"
                          >
                            {deletingInquiryId === m.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
