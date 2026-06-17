import { useState, useMemo } from "react";
import {
  Sparkles,
  FileText,
  BarChart3,
  Hash,
  MessageSquare,
  Wand2,
  AlertCircle,
  X,
} from "lucide-react";
import { UploadCard } from "./components/UploadCard.jsx";
import { OverviewTab } from "./components/OverviewTab.jsx";
import { BrandsTab } from "./components/BrandsTab.jsx";
import { TweetsTab } from "./components/TweetsTab.jsx";
import { CaptionStudio } from "./components/CaptionStudio.jsx";

/* ============================================================
 * APP
 * ============================================================ */

export default function App() {
  const [tweets, setTweets] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const selection = useMemo(
    () => ({
      ids: selectedIds,
      has: (uid) => selectedIds.has(uid),
      count: selectedIds.size,
      toggle: (uid) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(uid)) next.delete(uid);
          else next.add(uid);
          return next;
        }),
      add: (uids) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const u of uids) next.add(u);
          return next;
        }),
      remove: (uids) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const u of uids) next.delete(u);
          return next;
        }),
      clear: () => setSelectedIds(new Set()),
    }),
    [selectedIds],
  );

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "brands", label: "Brands", icon: Hash },
    {
      id: "tweets",
      label: "Tweets",
      icon: MessageSquare,
      badge: selection.count || null,
    },
    {
      id: "captions",
      label: "Caption Studio",
      icon: Wand2,
      badge: selection.count || null,
    },
  ];

  const loaded = tweets.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-slate-900">Tweet Studio</h1>
            <p className="text-xs text-slate-500">
              Sentiment · Tone · Brand voice captions
            </p>
          </div>
          {loaded && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-500 mr-2">
                <FileText className="w-4 h-4" />
                <span>
                  {fileName} · {tweets.length.toLocaleString()} tweets
                </span>
              </div>
              <button
                onClick={() => {
                  setTweets([]);
                  setFileName("");
                  setError("");
                }}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                New file
              </button>
            </>
          )}
        </div>
        {loaded && (
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 -mb-px">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                  {t.badge ? (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-xs font-semibold tabular-nums">
                      {t.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError("")}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {!loaded && (
          <UploadCard
            onLoad={(rows, name) => {
              setTweets(rows);
              setFileName(name);
              setError("");
              setSelectedIds(new Set());
            }}
            onError={setError}
          />
        )}
        {loaded && tab === "overview" && <OverviewTab tweets={tweets} />}
        {loaded && tab === "brands" && <BrandsTab tweets={tweets} />}
        {loaded && tab === "tweets" && (
          <TweetsTab
            tweets={tweets}
            selection={selection}
            onJumpToCaptions={() => setTab("captions")}
          />
        )}
        {loaded && tab === "captions" && (
          <CaptionStudio
            tweets={tweets}
            selection={selection}
            onGoToTweets={() => setTab("tweets")}
          />
        )}
      </main>
    </div>
  );
}
