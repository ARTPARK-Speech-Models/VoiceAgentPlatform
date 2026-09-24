import { useState, useRef } from "react";
import { baseURL } from "../url";
/* ── RAG & Functions subsection ─────────────────────────────── */

const RAG_SOURCES = ["url", "file", "text"];

export default function RAGFunctions({ agentName, config, onChange }) {
  const [open, setOpen] = useState(false);
  const [activeSources, setActiveSources] = useState([]);
  const [urls, setUrls] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [files, setFiles] = useState([]);
  const [ragText, setRagText] = useState("");
  const [textSource, setTextSource] = useState("");
  const [mcpManifest, setMcpManifest] = useState("");
  const [mcpURL, setmcpURL] = useState(config?.mcpURL ?? "");
  const [mcpExecution, setMcpExecution] = useState("");
  const fileRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null); // { status: 'success'|'partial'|'error', data?, message? }

  const toggleSource = (src) =>
    setActiveSources(prev =>
      prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]
    );

  const addUrl = () => {
    const u = urlInput.trim();
    if (u && !urls.includes(u)) { setUrls([...urls, u]); setUrlInput(""); }
  };

  const removeUrl = (u) => setUrls(urls.filter(x => x !== u));

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files ?? []);
    setFiles(prev => {
      const names = prev.map(f => f.name);
      return [...prev, ...picked.filter(f => !names.includes(f.name))];
    });
  };

  const removeFile = (name) => setFiles(files.filter(f => f.name !== name));

  const hasContent = urls.length > 0 || files.length > 0 || ragText.trim().length > 0;

  const handleSave = async () => {
    if (!hasContent || saving) return;
    // Guard before setSaving(true): this used to `throw` outside the try below,
    // which left the button stuck in "saving" and surfaced nothing to the user.
    if (!agentName) {
      setSaveResult({ status: "error", message: "Give the agent a name before adding knowledge sources." });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const formData = new FormData();
      formData.append("agent_name", agentName.toLowerCase() ?? "default");

      urls.forEach(u => formData.append("urls", u));
      files.forEach(f => formData.append("files", f));

      if (ragText.trim()) {
        formData.append("text", ragText);
        if (textSource.trim()) formData.append("text_source", textSource.trim());
      }

      const res = await fetch(baseURL + "api/llm/ingest/data", {
        headers: {
          'ngrok-skip-browser-warning': 'true'
        },
        method: "POST",
        body: formData,
        credentials: "include"
      });

      const data = await res.json().catch(() => null);

      if (!res.ok && res.status !== 422) {
        throw new Error(data?.detail || `Request failed with status ${res.status}`);
      }

      const status = data.failed === 0 ? "success" : data.ingested === 0 ? "error" : "partial";
      setSaveResult({ status, data });
    } catch (err) {
      setSaveResult({ status: "error", message: err.message || "Something went wrong while saving." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">RAG & Functions</p>
            <p className="text-xs text-slate-500">Knowledge sources and API integrations · optional</p>
          </div>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="p-5 flex flex-col gap-6 border-t border-slate-100">

          {/* ── RAG ─────────────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Knowledge Base (RAG)</p>
            <p className="text-xs text-slate-400 mb-3">Select one or more source types to ground the agent's responses.</p>

            {/* Source type toggles */}
            <div className="flex flex-wrap gap-2 mb-4">
              {RAG_SOURCES.map(src => {
                const active = activeSources.includes(src);
                const icons = {
                  url:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
                  file: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
                  text: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>,
                };
                return (
                  <button
                    key={src}
                    onClick={() => toggleSource(src)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
                    }`}
                  >
                    {icons[src]}
                    {src.charAt(0).toUpperCase() + src.slice(1)}
                  </button>
                );
              })}
            </div>

            {/* URL source */}
            {activeSources.includes("url") && (
              <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  URLs
                </p>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                    placeholder="https://docs.example.com/..."
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder:text-slate-400"
                  />
                  <button onClick={addUrl} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-1">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add
                  </button>
                </div>
                {urls.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {urls.map(u => (
                      <div key={u} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        <span className="flex-1 text-slate-700 truncate">{u}</span>
                        <button onClick={() => removeUrl(u)} className="text-slate-400 hover:text-red-500 transition">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No URLs added yet.</p>
                )}
              </div>
            )}

            {/* File source */}
            {activeSources.includes("file") && (
              <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Files
                </p>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-xl py-5 transition text-slate-400 hover:text-emerald-600 mb-2"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span className="text-xs font-medium">Click to upload files</span>
                  <span className="text-xs">PDF, DOCX, TXT supported</span>
                </button>
                {files.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {files.map(f => (
                      <div key={f.name} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span className="flex-1 text-slate-700 truncate">{f.name}</span>
                        <span className="text-slate-400 shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                        <button onClick={() => removeFile(f.name)} className="text-slate-400 hover:text-red-500 transition">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Text source */}
            {activeSources.includes("text") && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
                  Raw Text
                </p>
                <input
                  type="text"
                  value={textSource}
                  onChange={e => setTextSource(e.target.value)}
                  placeholder="Optional label for this text (e.g. 'Return Policy')"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder:text-slate-400 mb-2"
                />
                <textarea
                  value={ragText}
                  onChange={e => setRagText(e.target.value)}
                  placeholder="Paste or type any text you want the agent to reference during conversations..."
                  rows={6}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder:text-slate-400 resize-y"
                />
                <p className="text-xs text-slate-400 mt-1">{ragText.length} characters</p>
              </div>
            )}

            {activeSources.length === 0 && (
              <p className="text-xs text-slate-400 flex items-center gap-1.5 py-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Select a source type above to add knowledge to your agent.
              </p>
            )}
          </div>

          {/* ── Save ─────────────────────────────────────── */}
          <div className="flex flex-col gap-3 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-slate-400">
                {hasContent ? "Save to add these sources to the agent's knowledge base." : "Add a URL, file, or text to enable saving."}
              </p>
              <button
                onClick={handleSave}
                disabled={!hasContent || saving}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                  !hasContent || saving
                    ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200"
                }`}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12a9 9 0 1 1-9-9"/>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Save Data
                  </>
                )}
              </button>
            </div>

            {saveResult && (
              <div className={`text-xs rounded-lg px-3 py-2.5 border flex flex-col gap-1.5 ${
                saveResult.status === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : saveResult.status === "partial"
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-red-50 border-red-200 text-red-700"
              }`}>
                <p className="font-semibold">
                  {saveResult.status === "success" && "All sources ingested successfully."}
                  {saveResult.status === "partial" && "Some sources failed to ingest."}
                  {saveResult.status === "error" && (saveResult.message || "Ingestion failed.")}
                </p>
                {saveResult.data?.results?.length > 0 && (
                  <ul className="flex flex-col gap-0.5">
                    {saveResult.data.results.map((r, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className={r.status === "ok" ? "text-emerald-600" : "text-red-600"}>
                          {r.status === "ok" ? "✓" : "✕"}
                        </span>
                        <span className="truncate">{r.source}</span>
                        {r.detail && <span className="text-slate-400">— {r.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-100"/>

          {/* ── Functions ─────────────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Functions</p>
            <p className="text-xs text-slate-400 mb-4">Connect external APIs the agent can call during a conversation.</p>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  MCP Server URL
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={mcpURL}
                    onChange={e => {
                      const next = e.target.value;
                      setmcpURL(next);
                      onChange?.({
                        ...config,
                        mcpURL: next
                      });
                    }}
                    placeholder="https://api.example.com/sse"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pl-9 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder:text-slate-400"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <p className="text-xs text-slate-400 mt-1">URL to your MCP Server.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  MCP Manifest Endpoint
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={mcpManifest}
                    onChange={e => setMcpManifest(e.target.value)}
                    placeholder="https://api.example.com/mcp/manifest"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pl-9 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder:text-slate-400"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <p className="text-xs text-slate-400 mt-1">URL to fetch the MCP tool manifest JSON.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  MCP Execution Endpoint
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={mcpExecution}
                    onChange={e => setMcpExecution(e.target.value)}
                    placeholder="https://api.example.com/mcp/execute"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pl-9 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder:text-slate-400"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <p className="text-xs text-slate-400 mt-1">URL the agent will POST to when invoking a tool.</p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}