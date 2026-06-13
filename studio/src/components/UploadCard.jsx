import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { parseCSV } from "../lib/csv.js";

/* ============================================================
 * UPLOAD
 * ============================================================ */

export function UploadCard({ onLoad, onError }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState("");

  const handleFile = async (file) => {
    try {
      const text = await file.text();
      const rows = await parseCSV(text);
      if (!rows.length)
        throw new Error(
          'No valid rows found. CSV needs at least a "text" column.',
        );
      onLoad(rows, file.name);
    } catch (e) {
      onError(e.message);
    }
  };

  const handlePaste = async () => {
    try {
      const rows = await parseCSV(paste);
      if (!rows.length) throw new Error("No valid rows found in pasted text.");
      onLoad(rows, "pasted.csv");
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => ref.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}
      >
        <Upload className="w-12 h-12 mx-auto text-slate-400" />
        <div className="mt-3 text-slate-900 font-medium text-lg">
          Drop a tweets CSV here
        </div>
        <div className="text-sm text-slate-500 mt-1">or click to browse</div>
        <input
          ref={ref}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
        />
      </div>

      <details className="bg-white rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Or paste CSV text
        </summary>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="id,text,authorUsername,createdAt,likeCount,..."
          className="mt-3 w-full h-40 p-3 border border-slate-200 rounded-lg font-mono text-xs"
        />
        <button
          onClick={handlePaste}
          disabled={!paste.trim()}
          className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700"
        >
          Analyze pasted CSV
        </button>
      </details>

      <div className="text-xs text-slate-500 text-center">
        Auto-detects columns. Works with{" "}
        <code className="px-1 bg-slate-100 rounded">tweet_scraper.py</code>{" "}
        output, Apify exports, or any CSV with a{" "}
        <code className="px-1 bg-slate-100 rounded">text</code> column.
      </div>
    </div>
  );
}
