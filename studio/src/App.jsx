import { useState, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import {
  Upload, FileText, Sparkles, Copy, Check, AlertCircle, BarChart3,
  Hash, MessageSquare, TrendingUp, Heart, Repeat2, Eye, Wand2, Filter, X,
} from 'lucide-react'

/* ============================================================
 * LEXICONS & TONE PATTERNS
 * ============================================================ */

const POSITIVE_WORDS = new Set([
  'love','loved','loving','amazing','awesome','great','fantastic','wonderful','excellent',
  'beautiful','perfect','happy','excited','thrilled','delighted','enjoy','enjoyed',
  'best','better','good','nice','cool','wow','yay','win','wins','winning','success',
  'proud','grateful','thankful','thanks','thank','blessed','inspire','inspired',
  'inspiring','stunning','gorgeous','brilliant','genius','masterpiece','legendary',
  'iconic','favorite','fave','incredible','magical','vibes','slay','slayed','ate',
  'bomb','fire','lit','dope','goat','queen','king','support','supporting','cutie',
  'cute','adorable','pretty','sweet','bloom','blooming','obsessed','impressed',
  'recommend','worth','quality','smooth','soft','fresh','charming','elegant',
])

const NEGATIVE_WORDS = new Set([
  'hate','terrible','awful','horrible','bad','worst','worse','sad','angry','mad',
  'upset','disappoint','disappointed','disappointing','fail','failed','failure',
  'broken','ugly','stupid','dumb','trash','garbage','lame','boring','cringe','flop',
  'flopped','cancel','cancelled','scam','fake','mid','cheap','gross','annoying',
  'annoyed','frustrated','frustrating','ugh','yikes','reject','hurt','hurting',
  'tired','sucks','suck','sucked','overpriced','rip','ripoff','regret','regretted',
  'delayed','delay','missing','lost','stolen','rude',
])

const INTENSIFIERS = new Set(['very','really','so','super','extremely','absolutely','totally','completely'])
const NEGATIONS = new Set(['not','no','never','dont',"don't","doesn't","didn't","isn't","wasn't","won't"])

// Note: 😭 and 🥺 are intentionally treated as POSITIVE in social-media context
// ("so good I'm crying" / affectionate). Move them to NEGATIVE_EMOJI if your
// dataset is mostly customer-support / complaints rather than fan reactions.
const POSITIVE_EMOJI = ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💖','💕','💓','💞','💗','💘','😍','🥰','😘','😊','🙂','😄','😁','😃','😆','🥳','🎉','✨','⭐','🌟','💫','🔥','💯','👏','👍','🙌','🤩','😎','💪','🏆','🥇','🌸','🌺','🌼','🌷','🌹','🌻','🌈','😭','🥺']
const NEGATIVE_EMOJI = ['😢','😞','😔','😟','😕','☹️','🙁','😣','😖','😫','😩','😤','😠','😡','🤬','👎','💔','😱','😰','😨','😥']
const NEGATIVE_EMOTICONS = /(:\(|:-\(|D:|:\/)/g

const TONE_DEFS = [
  { tag: 'Excited',       color: 'bg-orange-100 text-orange-800' },
  { tag: 'Promotional',   color: 'bg-purple-100 text-purple-800' },
  { tag: 'Informational', color: 'bg-slate-100 text-slate-800' },
  { tag: 'Playful',       color: 'bg-pink-100 text-pink-800' },
  { tag: 'Inspirational', color: 'bg-amber-100 text-amber-800' },
  { tag: 'Urgent',        color: 'bg-red-100 text-red-800' },
  { tag: 'Question',      color: 'bg-sky-100 text-sky-800' },
  { tag: 'CTA',           color: 'bg-indigo-100 text-indigo-800' },
  { tag: 'Storytelling',  color: 'bg-emerald-100 text-emerald-800' },
  { tag: 'Community',     color: 'bg-teal-100 text-teal-800' },
  { tag: 'Gratitude',     color: 'bg-yellow-100 text-yellow-800' },
]
const TONE_COLOR = Object.fromEntries(TONE_DEFS.map(t => [t.tag, t.color]))

const TONE_PATTERNS = [
  { tag: 'Excited',       match: (t, m) => m.exclaim >= 2 || m.capsRatio > 0.3 || /\b(wow|omg|yay|yesss+|yess+|let\'?s go|insane|unreal)\b/i.test(t) },
  { tag: 'Promotional',   match: (t) => /\b(available|check out|shop now|launch|launching|announcing|new collection|drop|dropping|sale|off|discount|pre-?order|now available|just dropped|new!)\b/i.test(t) },
  { tag: 'Informational', match: (t) => /\b(update|announcement|fyi|reminder|guide|explained|learn|here\'?s how|breakdown)\b/i.test(t) },
  { tag: 'Playful',       match: (t, m) => m.emoji >= 3 || /\b(lol|haha|hehe|teehee|aww+|bestie|besties|lmao)\b/i.test(t) },
  { tag: 'Inspirational', match: (t) => /\b(dream|believe|journey|grow|growth|strength|courage|shine|bloom|rise|possible|never give up|keep going|you can|we can)\b/i.test(t) },
  { tag: 'Urgent',        match: (t) => /\b(now|today|tonight|hurry|last chance|limited|ends soon|don\'?t miss|only \d+ (left|hours|days)|this week|tomorrow)\b/i.test(t) },
  { tag: 'Question',      match: (t) => /\?/.test(t) && /\b(what|how|why|who|when|which|where|should|would|could|do you|have you|are you)\b/i.test(t) },
  { tag: 'CTA',           match: (t) => /\b(follow|share|retweet|rt|like|tag|comment|reply|dm|drop a|click|swipe|link in bio|subscribe|join)\b/i.test(t) },
  { tag: 'Storytelling',  match: (t) => t.length > 160 && /\b(when|remember|once|today i|so i|then|after|before)\b/i.test(t) },
  { tag: 'Community',     match: (t) => /\b(we|us|our|together|fam|family|crew|team|community|everyone|y\'?all)\b/i.test(t) },
  { tag: 'Gratitude',     match: (t) => /\b(thank|thanks|grateful|appreciate|appreciated|blessed|bless)\b/i.test(t) },
]

/* ============================================================
 * ANALYSIS
 * ============================================================ */

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean)
}

function countEmoji(text, list) {
  let count = 0
  for (const e of list) {
    const re = new RegExp(e.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')
    const m = text.match(re)
    if (m) count += m.length
  }
  return count
}

function analyzeSentiment(text) {
  if (!text) return { score: 0, label: 'neutral', magnitude: 0 }
  const tokens = tokenize(text)
  let pos = 0, neg = 0
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    const prev = tokens[i - 1] || ''
    const prev2 = tokens[i - 2] || ''
    const boost = INTENSIFIERS.has(prev) ? 1.5 : 1
    const negated = NEGATIONS.has(prev) || NEGATIONS.has(prev2)
    if (POSITIVE_WORDS.has(w)) { if (negated) neg += boost; else pos += boost }
    else if (NEGATIVE_WORDS.has(w)) { if (negated) pos += boost; else neg += boost }
  }
  pos += countEmoji(text, POSITIVE_EMOJI) * 0.8
  neg += countEmoji(text, NEGATIVE_EMOJI) * 0.8
  neg += (text.match(NEGATIVE_EMOTICONS) || []).length * 0.8
  const raw = pos - neg
  const norm = raw / Math.max(1, Math.sqrt(pos + neg + 1))
  const score = Math.max(-1, Math.min(1, norm / 3))
  const magnitude = pos + neg
  let label = 'neutral'
  if (score > 0.12) label = 'positive'
  else if (score < -0.12) label = 'negative'
  return { score, label, magnitude }
}

function analyzeTone(text) {
  if (!text) return []
  const exclaim = (text.match(/!/g) || []).length
  const letters = text.replace(/[^a-zA-Z]/g, '')
  const caps = text.replace(/[^A-Z]/g, '').length
  const capsRatio = letters.length ? caps / letters.length : 0
  const emoji = countEmoji(text, POSITIVE_EMOJI) + countEmoji(text, NEGATIVE_EMOJI)
  const meta = { exclaim, capsRatio, emoji }
  return TONE_PATTERNS.filter(p => p.match(text, meta)).map(p => p.tag)
}

/* ============================================================
 * CSV PARSING
 * ============================================================ */

const FIELD_MAP = {
  text:    ['text', 'content', 'tweet', 'body', 'message', 'full_text'],
  date:    ['createdAt', 'created_at', 'date', 'timestamp', 'time'],
  likes:   ['likeCount', 'likes', 'favorite_count', 'favoriteCount', 'like'],
  rts:     ['retweetCount', 'retweets', 'retweet_count'],
  replies: ['replyCount', 'replies', 'reply_count'],
  views:   ['viewCount', 'views', 'view_count', 'impressions'],
  author:  ['authorUsername', 'author', 'user', 'username', 'screen_name'],
  url:     ['url', 'tweet_url', 'link'],
  id:      ['id', 'id_str', 'tweet_id'],
  brand:   ['sourceTerm', 'brand', 'query', 'searchTerm', 'topic'],
}

function pick(row, candidates) {
  const keys = Object.keys(row)
  for (const c of candidates) {
    const k = keys.find(k => k.toLowerCase() === c.toLowerCase())
    if (k !== undefined) return row[k]
  }
  return ''
}

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function normalize(row) {
  const text = String(pick(row, FIELD_MAP.text) || '')
  return {
    id: String(pick(row, FIELD_MAP.id) || ''),
    url: String(pick(row, FIELD_MAP.url) || ''),
    date: String(pick(row, FIELD_MAP.date) || ''),
    author: String(pick(row, FIELD_MAP.author) || ''),
    brand: String(pick(row, FIELD_MAP.brand) || ''),
    text,
    likes: toNum(pick(row, FIELD_MAP.likes)),
    retweets: toNum(pick(row, FIELD_MAP.rts)),
    replies: toNum(pick(row, FIELD_MAP.replies)),
    views: toNum(pick(row, FIELD_MAP.views)),
  }
}

function enrich(r) {
  const sentiment = analyzeSentiment(r.text)
  const tones = analyzeTone(r.text)
  const engagement = r.likes + r.retweets * 2 + r.replies
  const emoji = countEmoji(r.text, POSITIVE_EMOJI) + countEmoji(r.text, NEGATIVE_EMOJI)
  const hashtags = (r.text.match(/#\w+/g) || []).length
  const mentions = (r.text.match(/@\w+/g) || []).length
  return { ...r, sentiment, tones, engagement, emoji, hashtags, mentions, length: r.text.length }
}

function parseCSV(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data || [])
          .map(normalize)
          .filter(r => r.text)
          .map((r, i) => enrich({ ...r, uid: r.id || `tw_${i}` }))
        resolve(rows)
      },
      error: reject,
    })
  })
}

/* ============================================================
 * UI PRIMITIVES
 * ============================================================ */

function Stat({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700',
    green: 'bg-green-50 text-green-700',
    rose:  'bg-rose-50 text-rose-700',
    sky:   'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {Icon && <div className={`p-1.5 rounded-lg ${tones[tone]}`}><Icon className="w-4 h-4" /></div>}
        <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

function Bar({ label, value, total, color = 'bg-indigo-500' }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500 tabular-nums">{value} <span className="text-slate-400">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Chip({ children, color = 'bg-slate-100 text-slate-700' }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{children}</span>
}

function SentimentChip({ label }) {
  const map = {
    positive: 'bg-green-100 text-green-800',
    neutral:  'bg-slate-100 text-slate-700',
    negative: 'bg-rose-100 text-rose-800',
  }
  return <Chip color={map[label]}>{label}</Chip>
}

/* ============================================================
 * UPLOAD
 * ============================================================ */

function UploadCard({ onLoad, onError }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const [paste, setPaste] = useState('')

  const handleFile = async (file) => {
    try {
      const text = await file.text()
      const rows = await parseCSV(text)
      if (!rows.length) throw new Error('No valid rows found. CSV needs at least a "text" column.')
      onLoad(rows, file.name)
    } catch (e) { onError(e.message) }
  }

  const handlePaste = async () => {
    try {
      const rows = await parseCSV(paste)
      if (!rows.length) throw new Error('No valid rows found in pasted text.')
      onLoad(rows, 'pasted.csv')
    } catch (e) { onError(e.message) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => ref.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition ${drag ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
      >
        <Upload className="w-12 h-12 mx-auto text-slate-400" />
        <div className="mt-3 text-slate-900 font-medium text-lg">Drop a tweets CSV here</div>
        <div className="text-sm text-slate-500 mt-1">or click to browse</div>
        <input ref={ref} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
      </div>

      <details className="bg-white rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Or paste CSV text</summary>
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
        >Analyze pasted CSV</button>
      </details>

      <div className="text-xs text-slate-500 text-center">
        Auto-detects columns. Works with <code className="px-1 bg-slate-100 rounded">tweet_scraper.py</code> output,
        Apify exports, or any CSV with a <code className="px-1 bg-slate-100 rounded">text</code> column.
      </div>
    </div>
  )
}

/* ============================================================
 * OVERVIEW TAB
 * ============================================================ */

function OverviewTab({ tweets }) {
  const total = tweets.length
  const byLabel = { positive: 0, neutral: 0, negative: 0 }
  const toneCounts = {}
  let totalLikes = 0, totalRts = 0, totalReplies = 0, totalLen = 0, totalEmoji = 0, totalHashtags = 0
  for (const t of tweets) {
    byLabel[t.sentiment.label]++
    for (const tag of t.tones) toneCounts[tag] = (toneCounts[tag] || 0) + 1
    totalLikes += t.likes; totalRts += t.retweets; totalReplies += t.replies
    totalLen += t.length; totalEmoji += t.emoji; totalHashtags += t.hashtags
  }
  const toneSorted = Object.entries(toneCounts).sort((a, b) => b[1] - a[1])
  const avgLen = total ? Math.round(totalLen / total) : 0
  const avgEmoji = total ? (totalEmoji / total).toFixed(1) : 0
  const top = [...tweets].sort((a, b) => b.engagement - a.engagement).slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={MessageSquare} label="Tweets" value={total.toLocaleString()} tone="sky" />
        <Stat icon={Heart} label="Total Likes" value={totalLikes.toLocaleString()} tone="rose" />
        <Stat icon={Repeat2} label="Total Retweets" value={totalRts.toLocaleString()} tone="green" />
        <Stat icon={TrendingUp} label="Avg Tweet Length" value={avgLen} sub={`${avgEmoji} emoji/tweet avg`} tone="amber" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900">Sentiment Distribution</h3>
          </div>
          <div className="space-y-3">
            <Bar label="Positive" value={byLabel.positive} total={total} color="bg-green-500" />
            <Bar label="Neutral"  value={byLabel.neutral}  total={total} color="bg-slate-400" />
            <Bar label="Negative" value={byLabel.negative} total={total} color="bg-rose-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900">Tone Mix</h3>
          </div>
          <div className="space-y-2">
            {toneSorted.slice(0, 8).map(([tag, count]) => (
              <Bar key={tag} label={tag} value={count} total={total} color="bg-indigo-500" />
            ))}
            {!toneSorted.length && <div className="text-sm text-slate-500">No tone patterns detected.</div>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-4">Top performers</h3>
        <div className="space-y-3">
          {top.map(t => (
            <div key={t.id || t.text.slice(0, 20)} className="flex gap-3 p-3 border border-slate-100 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-900">@{t.author || 'unknown'}</span>
                  {t.brand && <Chip>{t.brand}</Chip>}
                  <SentimentChip label={t.sentiment.label} />
                  {t.tones.slice(0, 2).map(tag => <Chip key={tag} color={TONE_COLOR[tag]}>{tag}</Chip>)}
                </div>
                <div className="text-sm text-slate-700 line-clamp-3">{t.text}</div>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-slate-500 tabular-nums">
                <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {t.likes}</span>
                <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" /> {t.retweets}</span>
                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {t.replies}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * BRANDS TAB
 * ============================================================ */

function BrandsTab({ tweets }) {
  const brandRows = useMemo(() => {
    const groups = {}
    for (const t of tweets) {
      const key = t.brand || '(unlabeled)'
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    }
    return Object.entries(groups).map(([brand, list]) => {
      const sent = { positive: 0, neutral: 0, negative: 0 }
      let likes = 0, rts = 0, replies = 0
      const toneCount = {}
      for (const t of list) {
        sent[t.sentiment.label]++
        likes += t.likes; rts += t.retweets; replies += t.replies
        for (const tag of t.tones) toneCount[tag] = (toneCount[tag] || 0) + 1
      }
      const topTones = Object.entries(toneCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)
      return { brand, count: list.length, sent, likes, rts, replies, topTones }
    }).sort((a, b) => b.count - a.count)
  }, [tweets])

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs uppercase tracking-wide text-slate-600">
            <th className="px-4 py-3">Brand</th>
            <th className="px-4 py-3">Tweets</th>
            <th className="px-4 py-3">Sentiment</th>
            <th className="px-4 py-3">Engagement</th>
            <th className="px-4 py-3">Dominant Tones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {brandRows.map(r => (
            <tr key={r.brand} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{r.brand}</td>
              <td className="px-4 py-3 text-slate-700 tabular-nums">{r.count}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs tabular-nums">+{r.sent.positive}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs tabular-nums">·{r.sent.neutral}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-xs tabular-nums">−{r.sent.negative}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                <div className="flex gap-3">
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {r.likes}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" /> {r.rts}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {r.replies}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {r.topTones.map(t => <Chip key={t} color={TONE_COLOR[t]}>{t}</Chip>)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ============================================================
 * TWEETS TAB
 * ============================================================ */

function TweetsTab({ tweets, selection, onJumpToCaptions }) {
  const [q, setQ] = useState('')
  const [sentFilter, setSentFilter] = useState('all')
  const [toneFilter, setToneFilter] = useState('all')
  const [sortKey, setSortKey] = useState('engagement')
  const [onlySelected, setOnlySelected] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tweets
      .filter(t => !needle || t.text.toLowerCase().includes(needle) || t.author.toLowerCase().includes(needle) || t.brand.toLowerCase().includes(needle))
      .filter(t => sentFilter === 'all' || t.sentiment.label === sentFilter)
      .filter(t => toneFilter === 'all' || t.tones.includes(toneFilter))
      .filter(t => !onlySelected || selection.has(t.uid))
      .sort((a, b) => {
        if (sortKey === 'engagement') return b.engagement - a.engagement
        if (sortKey === 'sentiment') return b.sentiment.score - a.sentiment.score
        if (sortKey === 'date') return (b.date || '').localeCompare(a.date || '')
        return 0
      })
      .slice(0, 500)
  }, [tweets, q, sentFilter, toneFilter, sortKey, onlySelected, selection])

  const visibleIds = useMemo(() => filtered.map(t => t.uid), [filtered])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selection.has(id))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 min-w-[200px] relative">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search text, author, brand..."
            className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm" />
          {q && <button onClick={() => setQ('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
        </div>
        <select value={sentFilter} onChange={e => setSentFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="all">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
        <select value={toneFilter} onChange={e => setToneFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="all">All tones</option>
          {TONE_DEFS.map(t => <option key={t.tag} value={t.tag}>{t.tag}</option>)}
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="engagement">Sort: Engagement</option>
          <option value="sentiment">Sort: Sentiment</option>
          <option value="date">Sort: Date</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 px-2 py-1.5 border border-slate-200 rounded-lg bg-white cursor-pointer">
          <input type="checkbox" checked={onlySelected} onChange={e => setOnlySelected(e.target.checked)} className="accent-indigo-600" />
          Selected only
        </label>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {tweets.length}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-sm">
        <span className="font-medium text-indigo-900">{selection.count} selected</span>
        <span className="text-indigo-700/70">·</span>
        <button
          onClick={() => allVisibleSelected ? selection.remove(visibleIds) : selection.add(visibleIds)}
          disabled={!visibleIds.length}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
        >
          {allVisibleSelected ? 'Unselect visible' : `Select all visible (${visibleIds.length})`}
        </button>
        <button
          onClick={selection.clear}
          disabled={!selection.count}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >Clear all</button>
        {selection.count > 0 && (
          <button
            onClick={onJumpToCaptions}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Wand2 className="w-3.5 h-3.5" /> Use in Caption Studio
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map(t => {
          const checked = selection.has(t.uid)
          return (
            <label
              key={t.uid}
              className={`block bg-white border rounded-xl p-4 shadow-sm cursor-pointer transition ${checked ? 'border-indigo-400 ring-1 ring-indigo-200 bg-indigo-50/30' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => selection.toggle(t.uid)}
                  className="mt-1 w-4 h-4 accent-indigo-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">@{t.author || 'unknown'}</span>
                    {t.brand && <Chip>{t.brand}</Chip>}
                    <SentimentChip label={t.sentiment.label} />
                    {t.tones.map(tag => <Chip key={tag} color={TONE_COLOR[tag]}>{tag}</Chip>)}
                    <span className="ml-auto text-xs text-slate-400">{t.date}</span>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{t.text}</div>
                  <div className="mt-2 flex gap-4 text-xs text-slate-500 tabular-nums">
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {t.likes}</span>
                    <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" /> {t.retweets}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {t.replies}</span>
                    {t.views > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {t.views}</span>}
                    {t.url && (
                      <a href={t.url} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="ml-auto text-indigo-600 hover:underline">Open →</a>
                    )}
                  </div>
                </div>
              </div>
            </label>
          )
        })}
        {!filtered.length && <div className="text-center py-12 text-slate-500">No tweets match these filters.</div>}
      </div>
    </div>
  )
}

/* ============================================================
 * CAPTION STUDIO
 * ============================================================ */

const CAPTION_TONES = ['Playful', 'Excited', 'Promotional', 'Inspirational', 'Informational', 'Community', 'Gratitude', 'CTA']

function CaptionStudio({ tweets, selection, onGoToTweets }) {
  const brands = useMemo(() => {
    const s = new Set(tweets.map(t => t.brand).filter(Boolean))
    return Array.from(s).sort()
  }, [tweets])

  // 'auto' = top N of brand by engagement; 'manual' = user-selected from Tweets tab
  const [sourceMode, setSourceMode] = useState('auto')
  const [brand, setBrand] = useState(brands[0] || '')
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('Playful')
  const [count, setCount] = useState(5)
  const [length, setLength] = useState('twitter') // twitter (280) | short (≤120) | thread-starter
  const [copied, setCopied] = useState(false)

  // If the user navigates here with tweets already selected, auto-preselect
  // manual mode. This uses the React-canonical "adjusting state during render"
  // pattern — a no-op when selectionSize is stable, flips once on the edge.
  const selectionSize = selection?.count ?? 0
  const [prevSelectionSize, setPrevSelectionSize] = useState(0)
  if (prevSelectionSize !== selectionSize) {
    setPrevSelectionSize(selectionSize)
    if (selectionSize > 0 && prevSelectionSize === 0 && sourceMode === 'auto') {
      setSourceMode('manual')
    }
  }

  const selectedTweets = useMemo(
    () => selection ? tweets.filter(t => selection.has(t.uid)) : [],
    [tweets, selection]
  )

  const brandTweets = useMemo(
    () => brand ? tweets.filter(t => t.brand === brand) : tweets,
    [brand, tweets]
  )

  // What we actually use to derive style + examples
  const referenceTweets = sourceMode === 'manual' ? selectedTweets : brandTweets

  const stats = useMemo(() => {
    if (!referenceTweets.length) return null
    const lens = referenceTweets.map(t => t.length)
    const emo  = referenceTweets.map(t => t.emoji)
    const hash = referenceTweets.map(t => t.hashtags)
    const tones = {}
    for (const t of referenceTweets) for (const tag of t.tones) tones[tag] = (tones[tag] || 0) + 1
    const topTones = Object.entries(tones).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)
    return {
      avgLen:   Math.round(lens.reduce((a, b) => a + b, 0) / lens.length),
      avgEmoji: (emo.reduce((a, b) => a + b, 0) / emo.length).toFixed(1),
      avgHash:  (hash.reduce((a, b) => a + b, 0) / hash.length).toFixed(1),
      topTones,
    }
  }, [referenceTweets])

  // Examples: in auto mode take top-8 by engagement; in manual mode use up to 12
  // of the user's picks as-is (ordered by engagement for consistency).
  const topExamples = useMemo(() => {
    if (sourceMode === 'manual') {
      return [...referenceTweets].sort((a, b) => b.engagement - a.engagement).slice(0, 12)
    }
    return [...referenceTweets].sort((a, b) => b.engagement - a.engagement).slice(0, 8)
  }, [referenceTweets, sourceMode])

  const prompt = useMemo(() => {
    if (!topExamples.length) return ''
    const lenGuide = {
      twitter: 'Keep each caption under 280 characters.',
      short: 'Keep each caption short — under 120 characters, punchy.',
      thread: 'Write each as a thread-opener (hook tweet) under 280 chars; it should invite a follow-up.',
    }[length]

    const examples = topExamples.map((t, i) =>
      `${i + 1}. (${t.likes} likes, ${t.retweets} RTs) "${t.text.replace(/\s+/g, ' ').trim()}"`
    ).join('\n')

    const voiceLabel = sourceMode === 'manual'
      ? `the voice of these ${topExamples.length} hand-picked reference tweets`
      : `the voice of the brand "${brand || 'this account'}"`

    const refHeader = sourceMode === 'manual'
      ? 'Style reference — these are the tweets I personally selected as my voice reference:'
      : 'Style reference — here are the top-performing tweets from this brand (by engagement):'

    return `You're helping me write captions in ${voiceLabel}.

${refHeader}
${examples}

Observed style signals:
- Average tweet length: ~${stats.avgLen} characters
- Average emoji per tweet: ${stats.avgEmoji}
- Average hashtags per tweet: ${stats.avgHash}
- Dominant tones: ${stats.topTones.join(', ') || 'varied'}

Task:
Write ${count} caption options for a new tweet about: "${topic || '[TOPIC GOES HERE]'}".

Constraints:
- Match the voice you see in the examples (vocabulary, rhythm, emoji usage, hashtag habits).
- Target tone for these specific captions: ${tone}.
- ${lenGuide}
- Number each option. Keep them distinct — vary the angle, hook, and opener.
- No hashtag dumps — use hashtags only if the examples suggest it.
- Don't use em-dashes or corporate-speak unless the examples do.`
  }, [sourceMode, brand, topic, tone, count, length, topExamples, stats])

  const copy = async () => {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-slate-900">Caption Studio</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Style reference</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSourceMode('auto')}
                className={`p-2.5 rounded-lg border text-left text-xs transition ${sourceMode === 'auto' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="font-semibold text-slate-900">Auto</div>
                <div className="text-slate-500">Top tweets from the selected brand</div>
              </button>
              <button onClick={() => setSourceMode('manual')}
                className={`p-2.5 rounded-lg border text-left text-xs transition ${sourceMode === 'manual' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  Manual
                  {selectionSize > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold tabular-nums">
                      {selectionSize}
                    </span>
                  )}
                </div>
                <div className="text-slate-500">Tweets you picked on the Tweets tab</div>
              </button>
            </div>
          </div>

          {sourceMode === 'auto' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Brand</label>
              <select value={brand} onChange={e => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="">(All brands — general voice)</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}

          {sourceMode === 'manual' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-slate-700 uppercase tracking-wide">
                  {selectionSize} selected tweet{selectionSize === 1 ? '' : 's'}
                </div>
                <button onClick={onGoToTweets}
                  className="text-xs font-medium text-indigo-700 hover:text-indigo-900">
                  {selectionSize === 0 ? 'Pick tweets →' : 'Edit selection →'}
                </button>
              </div>
              {selectionSize === 0 ? (
                <div className="text-xs text-slate-500">
                  Go to the Tweets tab, check off the ones you want Claude to learn from, then come back here.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {selectedTweets.slice(0, 20).map(t => (
                    <div key={t.uid} className="flex items-start gap-2 text-xs">
                      <button
                        onClick={() => selection.toggle(t.uid)}
                        className="mt-0.5 text-slate-400 hover:text-rose-600 shrink-0"
                        title="Remove from selection"
                      ><X className="w-3 h-3" /></button>
                      <div className="flex-1 min-w-0 text-slate-700 truncate">
                        {t.brand && <span className="text-slate-400 mr-1">[{t.brand}]</span>}
                        {t.text}
                      </div>
                    </div>
                  ))}
                  {selectedTweets.length > 20 && (
                    <div className="text-[11px] text-slate-500 pt-1">+ {selectedTweets.length - 20} more…</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Topic / Idea</label>
            <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={3}
              placeholder="e.g., launch of our new pastel lipstick, teasing a Gwenuhit drop, thanking fans for 10k followers..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Tone</label>
              <select value={tone} onChange={e => setTone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                {CAPTION_TONES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">How Many</label>
              <select value={count} onChange={e => setCount(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n} options</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['twitter', 'Standard', '≤280 chars'],
                ['short', 'Short', '≤120 chars'],
                ['thread', 'Thread Hook', 'Opener'],
              ].map(([v, label, sub]) => (
                <button key={v} onClick={() => setLength(v)}
                  className={`p-2 rounded-lg border text-xs text-left transition ${length === v ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="font-medium text-slate-900">{label}</div>
                  <div className="text-slate-500">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {stats && (
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="font-medium text-slate-700 mb-1">
                Style signals detected from {
                  sourceMode === 'manual'
                    ? `${referenceTweets.length} selected tweet${referenceTweets.length === 1 ? '' : 's'}`
                    : `${brand || 'all brands'} (${referenceTweets.length} tweets)`
                }:
              </div>
              <div>• Avg length ~{stats.avgLen} chars · {stats.avgEmoji} emoji · {stats.avgHash} hashtags</div>
              <div>• Dominant tones: {stats.topTones.join(', ') || '—'}</div>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-3">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h3 className="font-semibold text-slate-900">Prompt to paste into Claude</h3>
            </div>
            <button onClick={copy} disabled={!prompt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
            </button>
          </div>
          {!prompt && (
            <div className="text-sm text-slate-500 py-8 text-center">
              {topExamples.length
                ? 'Enter a topic to build a prompt.'
                : sourceMode === 'manual'
                  ? 'Select some tweets on the Tweets tab to use as your style reference.'
                  : 'No tweets available for the selected brand.'}
            </div>
          )}
          {prompt && (
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-4 whitespace-pre-wrap font-mono text-slate-800 max-h-[600px] overflow-auto">{prompt}</pre>
          )}
          <div className="mt-3 text-xs text-slate-500">
            Paste this into any Claude chat (including this Cowork session). Claude will respond with {count} on-brand caption variations you can iterate on.
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * APP
 * ============================================================ */

export default function App() {
  const [tweets, setTweets] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const selection = useMemo(() => ({
    ids: selectedIds,
    has: (uid) => selectedIds.has(uid),
    count: selectedIds.size,
    toggle: (uid) => setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid); else next.add(uid)
      return next
    }),
    add: (uids) => setSelectedIds(prev => {
      const next = new Set(prev)
      for (const u of uids) next.add(u)
      return next
    }),
    remove: (uids) => setSelectedIds(prev => {
      const next = new Set(prev)
      for (const u of uids) next.delete(u)
      return next
    }),
    clear: () => setSelectedIds(new Set()),
  }), [selectedIds])

  const tabs = [
    { id: 'overview', label: 'Overview',        icon: BarChart3 },
    { id: 'brands',   label: 'Brands',          icon: Hash },
    { id: 'tweets',   label: 'Tweets',          icon: MessageSquare, badge: selection.count || null },
    { id: 'captions', label: 'Caption Studio',  icon: Wand2,         badge: selection.count || null },
  ]

  const loaded = tweets.length > 0

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-slate-900">Tweet Studio</h1>
            <p className="text-xs text-slate-500">Sentiment · Tone · Brand voice captions</p>
          </div>
          {loaded && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-500 mr-2">
                <FileText className="w-4 h-4" />
                <span>{fileName} · {tweets.length.toLocaleString()} tweets</span>
              </div>
              <button onClick={() => { setTweets([]); setFileName(''); setError('') }}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                New file
              </button>
            </>
          )}
        </div>
        {loaded && (
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 -mb-px">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
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
            <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </div>
        )}
        {!loaded && <UploadCard onLoad={(rows, name) => { setTweets(rows); setFileName(name); setError(''); setSelectedIds(new Set()) }} onError={setError} />}
        {loaded && tab === 'overview' && <OverviewTab tweets={tweets} />}
        {loaded && tab === 'brands'   && <BrandsTab tweets={tweets} />}
        {loaded && tab === 'tweets'   && <TweetsTab tweets={tweets} selection={selection} onJumpToCaptions={() => setTab('captions')} />}
        {loaded && tab === 'captions' && <CaptionStudio tweets={tweets} selection={selection} onGoToTweets={() => setTab('tweets')} />}
      </main>
    </div>
  )
}
