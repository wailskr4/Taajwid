import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  SpellCheck,
  Volume2,
} from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

// Texte Warsh (édition à vérifier, voir note plus bas)
const WARSH_EDITION = 'ara-quranwarsh'
const WARSH_TEXT_URL = (id) =>
  `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/${WARSH_EDITION}/${id}.min.json`

// Audio Warsh : Yassin Al-Jazaery (récitateur algérien) sur everyayah.com
const WARSH_AUDIO_BASE = 'https://everyayah.com/data/Warsh/Warsh_Yassin_Al_Jazaery_64kbps'
const warshAudio = (surah, ayah) =>
  `${WARSH_AUDIO_BASE}/${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`

const BISMILLAH = ['بسم', 'الله', 'الرحمن', 'الرحيم']

const VERSES_PER_PAGE = 20
const WORDS_PER_PAGE = 110 // soft cap so pages of long verses stay readable
const LOOKAHEAD = 3
const RESYNC = 12
const MAX_ALTERNATIVES = 3
const SETTLE_MS = 900 // silence after the last word before the page is closed
const MATCH_THRESHOLD = 0.85 // share of matched words for a verse to count as "match"

const LANG_KEY = 'quran-recognition-lang'
const EMPTY = {}
const EMPTY_LIST = []

const DIALECTS = [
  { code: 'ar-SA', label: 'العربية (السعودية)' },
  { code: 'ar-EG', label: 'العربية (مصر)' },
  { code: 'ar-DZ', label: 'العربية (الجزائر)' },
  { code: 'ar-MA', label: 'العربية (المغرب)' },
]

const QURAN_FONT = "'Amiri Quran', 'Scheherazade New', 'Noto Naskh Arabic', 'Traditional Arabic', serif"

const surahCache = new Map()

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

const toArabicNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])

function versesLabel(n) {
  if (n === 1) return 'آية واحدة'
  if (n === 2) return 'آيتان'
  if (n >= 3 && n <= 10) return `${n} آيات`
  return `${n} آية`
}

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* -------------------------------------------------------------------------- */
/*  Arabic normalisation and fuzzy matching                                   */
/* -------------------------------------------------------------------------- */

const normalizeArabic = (text = '', dagger = 'drop') =>
  text
    .normalize('NFC')
    .replace(/[٠-٩]/g, '')
    .replace(/\u0670/g, dagger === 'alif' ? 'ا' : '')
    .replace(/[\u064B-\u065F\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ی/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// Letters speech engines (and dialects) commonly confuse.
const CONFUSABLE = [
  ['ث', 'س', 'ص'],
  ['ذ', 'ز', 'ظ', 'ض'],
  ['ت', 'ط'],
  ['ك', 'ق'],
  ['ح', 'ه'],
  ['ع', 'ء', 'ا'],
]

const GROUP_OF = {}
CONFUSABLE.forEach((group, i) => group.forEach((c) => (GROUP_OF[c] = i)))

const WEAK = new Set(['ا', 'و', 'ي', 'ء'])

const subCost = (x, y) =>
  x === y ? 0 : GROUP_OF[x] !== undefined && GROUP_OF[x] === GROUP_OF[y] ? 0.4 : 1

const gapCost = (c) => (WEAK.has(c) ? 0.6 : 1)

function similarity(a, b) {
  if (a === b) return 1
  if (!a.length || !b.length) return 0

  let prev = [0]
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + gapCost(b[j - 1])

  for (let i = 1; i <= a.length; i++) {
    const cur = [prev[0] + gapCost(a[i - 1])]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + gapCost(a[i - 1]),
        cur[j - 1] + gapCost(b[j - 1]),
        prev[j - 1] + subCost(a[i - 1], b[j - 1]),
      )
    }
    prev = cur
  }

  return Math.max(0, 1 - prev[b.length] / Math.max(a.length, b.length))
}

const needed = (len) => (len <= 2 ? 1 : len === 3 ? 0.8 : len === 4 ? 0.74 : 0.68)

const wordScore = (word, token) =>
  Math.max(similarity(word, token.norm), similarity(word, token.alt))

function findMatch(spoken, i, tokens, pointer, limit, look, bump = 0) {
  let best = null
  const consider = (cand) => {
    if (!best || cand.score > best.score) best = cand
  }

  for (let k = 0; k <= look && pointer + k < limit; k++) {
    const token = tokens[pointer + k]
    const need = needed(token.norm.length) + bump
    const penalty = k * 0.02

    const single = wordScore(spoken[i], token)
    if (single >= need) consider({ skip: k, used: 1, span: 1, score: single - penalty })

    // Two spoken words that are really one written word.
    if (i + 1 < spoken.length) {
      const merged = wordScore(spoken[i] + spoken[i + 1], token)
      if (merged >= need + 0.08) {
        consider({ skip: k, used: 2, span: 1, score: merged - penalty - 0.02 })
      }
    }

    // One spoken word that covers two written words.
    if (pointer + k + 1 < limit) {
      const next = tokens[pointer + k + 1]
      const joined = { norm: token.norm + next.norm, alt: token.alt + next.alt }
      const score = wordScore(spoken[i], joined)
      if (score >= needed(joined.norm.length) + 0.08 + bump) {
        consider({ skip: k, used: 1, span: 2, score: score - penalty - 0.02 })
      }
    }
  }

  return best
}

function align(spoken, tokens, start, limit, progress, final) {
  const states = { ...progress.states }
  const heard = { ...progress.heard }

  let pointer = start
  let misses = progress.misses
  let gain = 0
  let i = 0

  while (i < spoken.length && pointer < limit) {
    let cand = findMatch(spoken, i, tokens, pointer, limit, LOOKAHEAD)

    if (!cand && misses >= 2) {
      cand = findMatch(spoken, i, tokens, pointer, limit, RESYNC, 0.1)
    }

    if (cand) {
      if (final) {
        for (let k = 0; k < cand.skip; k++) states[pointer + k] = 'review'
      }
      for (let s = 0; s < cand.span; s++) {
        states[pointer + cand.skip + s] = 'match'
        delete heard[pointer + cand.skip + s]
      }
      gain += cand.span
      pointer += cand.skip + cand.span
      i += cand.used
      misses = 0
      continue
    }

    // Close-but-wrong word followed by a clear match: flag it for review.
    if (
      final &&
      tokens[pointer].norm.length >= 3 &&
      i + 1 < spoken.length &&
      similarity(spoken[i], tokens[pointer].norm) >= 0.5 &&
      findMatch(spoken, i + 1, tokens, pointer + 1, limit, LOOKAHEAD)
    ) {
      states[pointer] = 'review'
      heard[pointer] = spoken[i]
      pointer += 1
      i += 1
      continue
    }

    misses += 1
    i += 1
  }

  return { pointer, states, heard, misses, gain }
}

// Some engines repeat the previous final result at the start of the next one.
function stripRepeated(words, last) {
  if (last.length >= 2 && words.length >= last.length && last.every((w, i) => words[i] === w)) {
    return words.slice(last.length)
  }
  return words
}

/* -------------------------------------------------------------------------- */
/*  Text -> pages                                                             */
/* -------------------------------------------------------------------------- */

function buildText(surahId, ayahs) {
  const list = ayahs.map((ayah) => {
    const tokens = []

    ayah.text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((raw) => {
        const norm = normalizeArabic(raw)
        if (norm) {
          tokens.push({ text: raw, norm, alt: normalizeArabic(raw, 'alif'), ayah: ayah.numberInSurah })
        } else if (tokens.length) {
          tokens[tokens.length - 1].text += ` ${raw}`
        }
      })

    return { number: ayah.numberInSurah, audio: ayah.audio, tokens }
  })

let bismillah = ''
const first = list[0]

// La basmala est affichée séparément pour les sourates
// qui commencent par elle, sauf At-Tawbah (sourate 9).
if (surahId !== 1 && surahId !== 9) {
  bismillah = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'

  if (
    first &&
    BISMILLAH.every((word, i) => first.tokens[i]?.norm === word)
  ) {
    first.tokens = first.tokens.slice(4)
  }
}
  const pages = []
  let offset = 0
  let i = 0

  while (i < list.length) {
    const group = []
    let words = 0

    while (
      i < list.length &&
      group.length < VERSES_PER_PAGE &&
      (group.length === 0 || words + list[i].tokens.length <= WORDS_PER_PAGE)
    ) {
      group.push(list[i])
      words += list[i].tokens.length
      i += 1
    }

    const tokens = group.flatMap((a) => a.tokens)
    let local = 0
    const pageAyahs = group.map((a) => {
      const from = local
      local += a.tokens.length
      return { number: a.number, audio: a.audio, from, to: local }
    })

    pages.push({
      key: `p${pages.length}`,
      ayahNumber: group[0].number,
      lastAyahNumber: group[group.length - 1].number,
      part: pages.length + 1,
      parts: 0,
      tokens,
      ayahs: pageAyahs,
      start: offset,
      end: offset + tokens.length,
    })

    offset += tokens.length
  }

  pages.forEach((p) => (p.parts = pages.length))

  return { pages, bismillah, tokens: pages.flatMap((p) => p.tokens) }
}

const emptyProgress = () => ({ pointer: 0, states: {}, heard: {}, misses: 0 })

// Where to continue on a page: right after its last coloured word.
function resumePointer(target, states) {
  let last = -1
  for (let n = target.start; n < target.end; n++) if (states[n]) last = n
  return last === -1 ? target.start : last + 1
}

/* -------------------------------------------------------------------------- */
/*  Word styling (theme-aware, never colour-only)                             */
/* -------------------------------------------------------------------------- */

function wordStyle(state, current = false) {
  const style = { transition: 'background-color .25s ease, box-shadow .25s ease' }

  if (state === 'match') {
    style.backgroundColor = 'var(--color-highlight)'
    style.boxShadow = 'inset 0 -3px 0 var(--color-success)'
  } else if (state === 'preview') {
    style.backgroundColor = 'color-mix(in srgb, var(--color-highlight) 50%, transparent)'
    style.boxShadow = 'inset 0 -3px 0 color-mix(in srgb, var(--color-success) 40%, transparent)'
  } else if (state === 'review') {
    style.backgroundColor = 'color-mix(in srgb, var(--color-warning) 22%, var(--color-surface))'
    style.textDecorationLine = 'underline'
    style.textDecorationStyle = 'dotted'
    style.textDecorationColor = 'var(--color-warning)'
    style.textDecorationThickness = '2px'
    style.textUnderlineOffset = '0.45em'
  }

  if (current) {
    style.outline = '2px solid var(--color-primary)'
    style.outlineOffset = '2px'
  }

  return style
}

const STATE_LABEL = { match: 'تطابق', review: 'للمراجعة' }

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function Reading({
  surahId,
  surahName = '',
  isCompleted = false,
  onToggleCompleted,
  onBack,
  verseProgress = EMPTY,
  onUpdateVerseProgress,
  bookmarks = EMPTY_LIST,
  onAddBookmark,
  onRemoveBookmark,
}) {
  const [surah, setSurah] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [listening, setListening] = useState(false)
  const [autoStopped, setAutoStopped] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [wordStates, setWordStates] = useState({})
  const [wordHeard, setWordHeard] = useState({})
  const [pointer, setPointer] = useState(0)
  const [preview, setPreview] = useState(null) // { states, pointer } – tentative, from interim results
  const [pageIndex, setPageIndex] = useState(0)
  const [playingAyah, setPlayingAyah] = useState(null)
  const [lang, setLang] = useState(() => {
    const saved = safeGet(LANG_KEY)
    return DIALECTS.some((d) => d.code === saved) ? saved : 'ar-SA'
  })
  const [simpleMode, setSimpleMode] = useState(
    () => document.documentElement.dataset.a11ySimple === 'on',
  )

  const recognitionRef = useRef(null)
  const wantListeningRef = useRef(false)
  const progressRef = useRef(emptyProgress())
  const lastFinalRef = useRef([])
  const pendingRef = useRef(null) // latest interim words not yet committed
  const settleRef = useRef(null)
  const wakeLockRef = useRef(null)
  const audioRef = useRef(null)
  const queueRef = useRef([])
  const articleRef = useRef(null)
  const onUpdateRef = useRef(onUpdateVerseProgress)

  const built = useMemo(() => (surah ? buildText(surahId, surah.ayahs) : null), [surah, surahId])
  const page = built?.pages[pageIndex] ?? null

  const builtRef = useRef(null)
  const pageRef = useRef(null)

  useEffect(() => {
    builtRef.current = built
    pageRef.current = page
    onUpdateRef.current = onUpdateVerseProgress
  }, [built, page, onUpdateVerseProgress])

const bookmarkedSet = useMemo(
  () => new Set(bookmarks.map((bookmark) => bookmark.verseNumber)),
  [bookmarks]
)


  /* ---- settings sync ---- */
  useEffect(() => {
    const sync = () => setSimpleMode(document.documentElement.dataset.a11ySimple === 'on')
    window.addEventListener('a11y-settings-changed', sync)
    return () => window.removeEventListener('a11y-settings-changed', sync)
  }, [])

  useEffect(() => {
    safeSet(LANG_KEY, lang)
  }, [lang])

  /* ---- load surah (cached, abortable, with fallback source) ---- */
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function fetchWithFallback(sources) {
      let lastError = null

      for (const { url, parser } of sources) {
        try {
          const response = await fetch(url, { signal: controller.signal })
          if (!response.ok) {
            lastError = new Error(`HTTP ${response.status}`)
            continue
          }
          const parsed = parser(await response.json())
          if (parsed) return parsed
          lastError = new Error('bad data')
        } catch (err) {
          if (err.name === 'AbortError') throw err
          lastError = err
        }
      }

      throw lastError || new Error('all sources failed')
    }

    async function loadSurah() {
      wantListeningRef.current = false
      clearTimeout(settleRef.current)
      try {
        recognitionRef.current?.abort()
      } catch {
        /* already stopped */
      }
      try {
        wakeLockRef.current?.release()
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null
      setListening(false)

      queueRef.current = []
      audioRef.current?.pause()
      setPlayingAyah(null)
      pendingRef.current = null
      setError('')
      setTranscript('')
      setAutoStopped(false)
      setPageIndex(0)
      const initialProgress = emptyProgress()
      progressRef.current = initialProgress
      setWordStates(initialProgress.states)
      setWordHeard(initialProgress.heard)
      setPointer(initialProgress.pointer)
      setPreview(null)
      lastFinalRef.current = []

const cacheKey = `${WARSH_EDITION}-${surahId}`
const cached = surahCache.get(cacheKey)

if (cached) {
  setSurah(cached)
  setLoading(false)
  return
}

      setLoading(true)
      setSurah(null)

const parseWarsh = (data) => {
  const list = data.chapter
  if (!Array.isArray(list) || !list.length) return null
  return {
    name: '',
    numberOfAyahs: list.length,
    ayahs: list.map((v) => ({
      numberInSurah: v.verse,
      text: v.text,
      audio: warshAudio(surahId, v.verse),
    })),
  }
}

const sources = [
  { url: WARSH_TEXT_URL(surahId), parser: parseWarsh },
  // même fichier, version non minifiée, en cas d'échec
  { url: WARSH_TEXT_URL(surahId).replace('.min.json', '.json'), parser: parseWarsh },
]
      try {
        const data = await fetchWithFallback(sources)
surahCache.set(`${WARSH_EDITION}-${surahId}`, data)
        if (!cancelled) setSurah(data)
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          setError('تعذر تحميل السورة من جميع المصادر. تحقق من اتصال الإنترنت ثم حاول مجدداً.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSurah()

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahId, reloadKey])

  /* ---- cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      shutdownMic(true)
      audioRef.current?.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- report verse results to the app (never downgrades an existing "match") ---- */
  useEffect(() => {
    if (!page) return

    page.ayahs.forEach((ayah) => {
      const total = ayah.to - ayah.from
      if (!total) return

      let matched = 0
      let colored = 0
      for (let n = page.start + ayah.from; n < page.start + ayah.to; n++) {
        if (wordStates[n]) colored += 1
        if (wordStates[n] === 'match') matched += 1
      }
      if (colored < total) return

      const status = matched / total >= MATCH_THRESHOLD ? 'match' : 'review'
      const previous = verseProgress[ayah.number]
      if (previous === status || previous === 'match') return

      onUpdateRef.current?.(ayah.number, status)
    })
  }, [page, wordStates, verseProgress])

  /* ---- keep the word being read in view ---- */
  useEffect(() => {
    if (!listening) return
    const el = document.getElementById(`w-${preview?.pointer ?? pointer}`)
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top < 120 || rect.bottom > window.innerHeight - 160) {
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
  }, [listening, pointer, preview])

  /* ---- keep the verse being played in view ---- */
  useEffect(() => {
    if (playingAyah === null) return
    document
      .getElementById(`v-${playingAyah}`)
      ?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [playingAyah])

  /* ------------------------------------------------------------------------ */
  /*  Progress + microphone                                                   */
  /* ------------------------------------------------------------------------ */

  function commit(next) {
    progressRef.current = next
    setWordStates(next.states)
    setWordHeard(next.heard)
    setPointer(next.pointer)
    setPreview(null)
  }

  async function requestWakeLock() {
    try {
      wakeLockRef.current = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      wakeLockRef.current = null
    }
  }

  function releaseWakeLock() {
    try {
      wakeLockRef.current?.release()
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null
  }

  // Closes the microphone immediately. `abort` drops any pending audio.
  function shutdownMic(abort = false) {
    wantListeningRef.current = false
    clearTimeout(settleRef.current)

    const recognition = recognitionRef.current
    if (recognition) {
      try {
        if (abort) recognition.abort()
        else recognition.stop()
      } catch {
        /* already stopped */
      }
    }

    releaseWakeLock()
    setListening(false)
  }

  // Page finished: colour anything left, close the mic, and stop.
  function completePage(next, current, auto = true) {
    const states = { ...next.states }
    for (let n = current.start; n < current.end; n++) {
      if (!states[n]) states[n] = 'review'
    }

    pendingRef.current = null
    commit({ ...next, states, pointer: current.end, misses: 0 })
    shutdownMic(true)
    setAutoStopped(auto)
  }

  // Commits the latest interim words as if they were final.
  function flushPending() {
    clearTimeout(settleRef.current)

    const pending = pendingRef.current
    pendingRef.current = null

    const tokens = builtRef.current?.tokens
    const current = pageRef.current
    if (!pending || !tokens || !current) return

    const base = progressRef.current
    const out = align(pending.words, tokens, base.pointer, current.end, base, true)
    lastFinalRef.current = pending.all

    if (out.pointer >= current.end) completePage(out, current)
    else if (out.gain > 0) commit(out)
  }

  function stopListening() {
    flushPending()
    shutdownMic(false)
  }

  function handleResult(event) {
    const tokens = builtRef.current?.tokens
    const current = pageRef.current
    if (!tokens || !current) return

    clearTimeout(settleRef.current)

    let committed = progressRef.current
    let heardText = ''
    let finalized = false
    let previewOut = null

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      let best = null

      const count = Math.min(result.length, MAX_ALTERNATIVES)
      for (let a = 0; a < count; a++) {
        const text = result[a].transcript
        const all = normalizeArabic(text).split(' ').filter(Boolean)
        const words = stripRepeated(all, lastFinalRef.current)
        const out = align(words, tokens, committed.pointer, current.end, committed, result.isFinal)

        if (!best || out.gain > best.out.gain) best = { out, text, all, words }
      }

      if (!best) continue
      heardText = best.text

      if (result.isFinal) {
        committed = best.out
        lastFinalRef.current = best.all
        finalized = true
        pendingRef.current = null
        previewOut = null
      } else {
        previewOut = best.out
        pendingRef.current = { words: best.words, all: best.all }
      }
    }

    setTranscript(heardText.trim())

    if (finalized) {
      if (committed.pointer >= current.end) {
        completePage(committed, current)
        return
      }
      commit(committed)
    }

    // Interim results colour the words lightly right away, so reading feels live.
    if (previewOut) {
      setPreview({ states: previewOut.states, pointer: previewOut.pointer })

      // Everything reached? Wait a moment for silence, then close the page.
      if (previewOut.pointer >= current.end) {
        settleRef.current = setTimeout(flushPending, SETTLE_MS)
      }
    }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('المتصفح لا يدعم التعرف على الصوت. جرّب متصفحاً يدعم هذه الخاصية.')
      return
    }

    const current = pageRef.current
    if (!current) return

    // Don't let the recitation audio feed the microphone.
    if (audioRef.current && !audioRef.current.paused) stopAudio()

    // Starting on a finished page practises it again.
    if (progressRef.current.pointer >= current.end) resetPage(current)

    recognitionRef.current?.abort?.()
    wantListeningRef.current = true
    lastFinalRef.current = []
    pendingRef.current = null
    setAutoStopped(false)
    setError('')

    const recognition = new SpeechRecognition()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = MAX_ALTERNATIVES

    const restarts = []

    recognition.onstart = () => {
      setListening(true)
      requestWakeLock()
    }

    recognition.onresult = handleResult

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return

      shutdownMic(true)

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('الميكروفون غير مسموح به. فعّل الإذن من إعدادات المتصفح ثم حاول مجدداً.')
      } else if (event.error === 'audio-capture') {
        setError('لم يتم العثور على ميكروفون. تحقق من الجهاز ثم حاول مجدداً.')
      } else if (event.error === 'network') {
        setError('التعرف على الصوت يحتاج إلى اتصال بالإنترنت.')
      } else if (event.error === 'language-not-supported') {
        setError('هذه اللهجة غير مدعومة في متصفحك. جرّب لهجة أخرى من القائمة.')
      } else {
        setError('لم نتمكن من التعرف على الصوت. حاول مجدداً.')
      }
    }

    // Browsers end the session after a pause; keep it going until the page is done.
    recognition.onend = () => {
      if (!wantListeningRef.current || recognitionRef.current !== recognition) {
        setListening(false)
        return
      }

      flushPending()
      if (!wantListeningRef.current) return // the flush finished the page

      const now = Date.now()
      while (restarts.length && now - restarts[0] > 4000) restarts.shift()
      restarts.push(now)

      if (restarts.length > 5) {
        shutdownMic(true)
        setError('توقف الميكروفون بشكل متكرر. حاول مجدداً.')
        return
      }

      lastFinalRef.current = []
      setTimeout(() => {
        if (!wantListeningRef.current || recognitionRef.current !== recognition) return
        try {
          recognition.start()
        } catch {
          shutdownMic(true)
          setError('تعذر إعادة تشغيل الميكروفون. حاول مجدداً.')
        }
      }, 200)
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch {
      shutdownMic(true)
      setError('تعذر تشغيل الميكروفون. حاول مجدداً.')
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Page actions                                                            */
  /* ------------------------------------------------------------------------ */

  function resetPage(target) {
    const { states, heard } = progressRef.current
    const nextStates = { ...states }
    const nextHeard = { ...heard }

    for (let n = target.start; n < target.end; n++) {
      delete nextStates[n]
      delete nextHeard[n]
    }

    lastFinalRef.current = []
    pendingRef.current = null
    setTranscript('')
    setAutoStopped(false)

    commit({ pointer: target.start, states: nextStates, heard: nextHeard, misses: 0 })
  }

  function goToPage(index) {
    const target = built?.pages[index]
    if (!target || index === pageIndex) return

    stopListening()
    stopAudio()

    const base = progressRef.current
    lastFinalRef.current = []
    setTranscript('')
    setAutoStopped(false)
    setPageIndex(index)
    // Keep earlier results; just continue from where this page was left.
    commit({ ...base, pointer: resumePointer(target, base.states), misses: 0 })

    articleRef.current?.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  function finishPage() {
    if (!page) return
    flushPending()
    if (progressRef.current.pointer >= page.end && !wantListeningRef.current) {
      shutdownMic(true)
      return
    }
    completePage(progressRef.current, page, false)
  }

  function resetPractice() {
    shutdownMic(true)
    stopAudio()
    setError('')
    if (page) resetPage(page)
  }

const toggleBookmark = useCallback(
  (verseNumber) => {
    if (bookmarkedSet.has(verseNumber)) {
      onRemoveBookmark?.(verseNumber)
    } else {
      onAddBookmark?.(verseNumber)
    }
  },
  [bookmarkedSet, onAddBookmark, onRemoveBookmark]
)

  /* ------------------------------------------------------------------------ */
  /*  Audio (one verse, or the whole page in sequence)                        */
  /* ------------------------------------------------------------------------ */

  function stopAudio() {
    queueRef.current = []
    audioRef.current?.pause()
    setPlayingAyah(null)
  }

  function playNext() {
    const next = queueRef.current.shift()
    if (!next) {
      setPlayingAyah(null)
      return
    }

    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current

    audio.pause()
    audio.src = next.audio
    audio.onended = playNext
    audio.onerror = () => {
      queueRef.current = []
      setPlayingAyah(null)
      setError('تعذر تشغيل الصوت. حاول مجدداً.')
    }

    setPlayingAyah(next.number)
    audio.play().catch(() => {
      queueRef.current = []
      setPlayingAyah(null)
      setError('تعذر تشغيل الصوت حالياً.')
    })
  }

  function playAyahs(list) {
    const playable = list.filter((a) => a.audio)
    if (!playable.length) {
      setError('الصوت غير متاح حالياً.')
      return
    }

    if (wantListeningRef.current) stopListening()
    setError('')
    queueRef.current = playable.slice()
    playNext()
  }

  const toggleAyahAudio = (ayah) =>
    playingAyah === ayah.number ? stopAudio() : playAyahs([ayah])

  const togglePageAudio = () => (playingAyah !== null ? stopAudio() : page && playAyahs(page.ayahs))

  /* ------------------------------------------------------------------------ */
  /*  Derived values                                                          */
  /* ------------------------------------------------------------------------ */

  const totalWords = built?.tokens.length ?? 0
  const matchedCount = Object.values(wordStates).filter((s) => s === 'match').length
  const surahPercent = totalWords ? Math.round((matchedCount / totalWords) * 100) : 0

  const pageMatchedCount = page
    ? page.tokens.filter((_, i) => wordStates[page.start + i] === 'match').length
    : 0
  const pageProgress = page?.tokens.length
    ? Math.round((pageMatchedCount / page.tokens.length) * 100)
    : 0

  const pageDone = useMemo(() => {
    if (!built) return []
    return built.pages.map((p) => {
      for (let n = p.start; n < p.end; n++) if (!wordStates[n]) return false
      return p.end > p.start
    })
  }, [built, wordStates])

  const report = useMemo(() => {
    if (!page) return null

    let matched = 0
    let pending = 0
    const review = []

    page.tokens.forEach((token, i) => {
      const state = wordStates[page.start + i]
      if (state === 'match') matched += 1
      else if (state === 'review') review.push({ text: token.text, heard: wordHeard[page.start + i] })
      else pending += 1
    })

    const total = page.tokens.length

    return {
      total,
      matched,
      pending,
      review,
      percent: total ? Math.round((matched / total) * 100) : 0,
      complete: pointer >= page.end,
    }
  }, [page, wordStates, wordHeard, pointer])

  const lastPage = built ? pageIndex >= built.pages.length - 1 : true
  const allDone = pageDone.length > 0 && pageDone.every(Boolean)

  const bigButton = simpleMode ? 'min-h-14 text-lg font-bold' : 'min-h-12 font-semibold'
  const focusRing = { outlineColor: 'var(--color-primary)' }
  const card = { backgroundColor: 'var(--color-surface)' }
  const primaryBtn = { backgroundColor: 'var(--color-primary)', color: '#FFFFFF', ...focusRing }
  const outlineBtn = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-primary)',
    ...focusRing,
  }

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <main dir="rtl" lang="ar" className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => {
            shutdownMic(true)
            stopAudio()
            onBack?.()
          }}
          className="mb-6 inline-flex min-h-12 items-center gap-2 rounded-xl px-4 py-3 font-medium transition hover:opacity-70 focus-visible:outline-2"
          style={{ color: 'var(--color-primary)', ...focusRing }}
        >
          <ArrowRight size={20} aria-hidden="true" />
          العودة إلى السور
        </button>

        <header className="mb-8 rounded-3xl p-6 shadow-sm sm:p-8" style={card}>
          <div className="mb-3 flex items-center gap-3" style={{ color: 'var(--color-primary)' }}>
            <BookOpen size={25} aria-hidden="true" />
            <span className="font-medium">رحلة التعلم</span>
          </div>

          <h1 className="text-3xl font-bold sm:text-4xl" style={{ color: 'var(--color-primary)' }}>
            {surahName ? `سورة ${surahName}` : surah?.name}
          </h1>

          {surah && <p className="mt-2 opacity-70">{versesLabel(surah.numberOfAyahs)}</p>}

          <p className="mt-4 leading-8 opacity-80">
            اقرأ بهدوء، واستمع إلى التلاوة، واستخدم الميكروفون لتجربة المتابعة الصوتية.
          </p>
        </header>

        {loading && (
          <div
            className="flex items-center justify-center gap-3 rounded-2xl p-10"
            style={card}
            role="status"
          >
            <LoaderCircle className="animate-spin motion-reduce:animate-none" style={{ color: 'var(--color-primary)' }} />
            <span>جارٍ تحميل السورة...</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border p-4"
            style={{
              borderColor: 'var(--color-warning)',
              backgroundColor: 'color-mix(in srgb, var(--color-warning) 14%, var(--color-surface))',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !surah && (
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="min-h-12 rounded-xl px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={primaryBtn}
          >
            إعادة المحاولة
          </button>
        )}

        {built && page && (
          <>
            {/* Tools */}
            <section aria-label="أدوات القراءة" className="mb-6 rounded-2xl p-5 shadow-sm" style={card}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  className="inline-flex min-h-14 items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: listening ? 'var(--color-error)' : 'var(--color-primary)',
                    ...focusRing,
                  }}
                >
                  {listening ? <MicOff size={19} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
                  {listening ? 'إيقاف الميكروفون' : 'ابدأ القراءة الصوتية'}
                </button>

                <button
                  type="button"
                  onClick={togglePageAudio}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 py-3 font-medium transition hover:opacity-80 focus-visible:outline-2"
                  style={outlineBtn}
                >
                  {playingAyah !== null ? (
                    <Pause size={18} aria-hidden="true" />
                  ) : (
                    <Volume2 size={18} aria-hidden="true" />
                  )}
                  {playingAyah !== null ? 'إيقاف التلاوة' : 'استمع إلى الصفحة'}
                </button>

                <button
                  type="button"
                  onClick={resetPractice}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 py-3 transition hover:opacity-80 focus-visible:outline-2"
                  style={outlineBtn}
                >
                  <RotateCcw size={18} aria-hidden="true" />
                  إعادة هذه الصفحة
                </button>

                <label className="flex items-center gap-2 text-sm opacity-80">
                  <span>اللهجة</span>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    disabled={listening}
                    className="min-h-11 rounded-lg border px-3 py-2 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    {DIALECTS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="mt-4 text-sm leading-7 opacity-70" role="status" aria-live="polite">
                {listening
                  ? 'الميكروفون يعمل. تابع القراءة بوضوح، وسيتوقف تلقائياً عند انتهاء الصفحة.'
                  : autoStopped
                    ? 'أُغلق الميكروفون تلقائياً لأنك أنهيت الصفحة.'
                    : 'يمكنك الاستماع إلى كل آية أو تجربة المتابعة الصوتية.'}
              </p>

              {listening && (
                <p className="mt-2 flex min-h-6 items-center gap-2 text-sm opacity-70" aria-live="off">
                  <span
                    className="size-2.5 shrink-0 rounded-full motion-safe:animate-pulse"
                    style={{ backgroundColor: 'var(--color-error)' }}
                    aria-hidden="true"
                  />
                  {transcript ? `أسمع: ${transcript}` : 'في انتظار صوتك…'}
                </p>
              )}

              <div className="mt-5">
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span>المتابعة التقريبية للسورة</span>
                  <span>{surahPercent}٪</span>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full"
                  style={{ backgroundColor: 'var(--color-secondary)' }}
                  role="progressbar"
                  aria-valuenow={surahPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="نسبة الكلمات المتطابقة تقريباً"
                >
                  <div
                    className="h-full rounded-full transition-all motion-reduce:transition-none"
                    style={{ width: `${surahPercent}%`, backgroundColor: 'var(--color-success)' }}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="rounded px-2" style={wordStyle('match')}>كلمة</span>
                  تطابق محتمل
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded px-2" style={wordStyle('review')}>كلمة</span>
                  تحتاج إلى مراجعة
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded px-2" style={wordStyle('preview')}>كلمة</span>
                  قيد المتابعة
                </span>
              </div>
            </section>

            {/* Reading area */}
            <section ref={articleRef} className="scroll-mt-4 rounded-3xl p-5 shadow-sm sm:p-8" style={card}>
              <nav
                aria-label="التنقل بين صفحات القراءة"
                className="mb-6 rounded-2xl p-4 sm:p-5"
                style={{ backgroundColor: 'var(--color-secondary)' }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-base font-bold sm:text-lg" style={{ color: 'var(--color-primary)' }}>
                    الصفحة {pageIndex + 1} من {built.pages.length}
                  </p>
                  <span
                    className="rounded-full px-3 py-1 text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)' }}
                  >
                    {page.ayahNumber === page.lastAyahNumber
                      ? `الآية ${page.ayahNumber}`
                      : `الآيات ${page.ayahNumber}–${page.lastAyahNumber}`}
                  </span>
                </div>

                {built.pages.length > 1 && (
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {built.pages.map((p, i) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => goToPage(i)}
                        aria-current={i === pageIndex ? 'page' : undefined}
                        aria-label={`الصفحة ${i + 1}${pageDone[i] ? ' — مكتملة' : ''}`}
                        className="min-h-10 min-w-10 shrink-0 rounded-lg border px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          ...focusRing,
                          borderColor: pageDone[i] ? 'var(--color-success)' : 'var(--color-border)',
                          backgroundColor: i === pageIndex ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: i === pageIndex ? '#FFFFFF' : 'var(--color-text)',
                        }}
                      >
                        {toArabicNum(i + 1)}
                        {pageDone[i] ? ' ✓' : ''}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  className="mb-2 h-2.5 overflow-hidden rounded-full"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                  role="progressbar"
                  aria-label="تقدم القراءة في الصفحة الحالية"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pageProgress}
                >
                  <div
                    className="h-full rounded-full transition-all motion-reduce:transition-none"
                    style={{ width: `${pageProgress}%`, backgroundColor: 'var(--color-success)' }}
                  />
                </div>

                <p className="mb-4 text-sm leading-6 opacity-80">
                  تمت متابعة {pageMatchedCount} من {page.tokens.length} كلمة في هذه الصفحة ({pageProgress}٪)
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={pageIndex === 0}
                    onClick={() => goToPage(pageIndex - 1)}
                    className={`${bigButton} w-full rounded-xl px-4 shadow-sm transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40`}
                    style={{ ...focusRing, backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)' }}
                  >
                    الصفحة السابقة
                  </button>
                  <button
                    type="button"
                    disabled={lastPage}
                    onClick={() => goToPage(pageIndex + 1)}
                    className={`${bigButton} w-full rounded-xl px-4 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40`}
                    style={{
                      ...primaryBtn,
                      boxShadow: report?.complete ? '0 0 0 3px var(--color-accent)' : undefined,
                    }}
                  >
                    الصفحة التالية
                  </button>
                </div>
              </nav>

{pageIndex === 0 && built?.bismillah && (
  <div
    dir="rtl"
    lang="ar"
    className="mb-6 text-center text-3xl leading-loose"
    style={{
      fontFamily: QURAN_FONT,
      color: 'var(--color-text)',
    }}
  >
    {built.bismillah}
  </div>
)}

              <article
                className="rounded-2xl border p-4 sm:p-6"
                style={{ borderColor: 'var(--color-border)' }}
                aria-label={`نص الصفحة ${page.part}`}
              >
                <p
                  className="text-right text-2xl leading-[2.7] sm:text-3xl sm:leading-[2.8]"
                  style={{ fontFamily: QURAN_FONT }}
                >
                  {page.ayahs.map((ayah) => {
                    const saved = bookmarkedSet.has(ayah.number)
                    const playing = playingAyah === ayah.number
                    const words = page.tokens.slice(ayah.from, ayah.to)

                    return (
                      <span
                        key={ayah.number}
                        id={`v-${ayah.number}`}
                        className="rounded-xl transition-colors motion-reduce:transition-none"
                        style={{
                          backgroundColor: playing
                            ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)'
                            : undefined,
                        }}
                      >
                        {words.map((token, i) => {
                          const idx = page.start + ayah.from + i
                          const committedState = wordStates[idx]
                          const state =
                            committedState ?? (preview?.states[idx] === 'match' ? 'preview' : undefined)
                          const isCurrent = listening && idx === (preview?.pointer ?? pointer)

                          return (
                            <span key={idx}>
                              <span
                                id={`w-${idx}`}
                                className="inline rounded-lg px-1"
                                style={wordStyle(state, isCurrent)}
                              >
                                {token.text}
                                {STATE_LABEL[state] && <span className="sr-only"> ({STATE_LABEL[state]})</span>}
                              </span>{' '}
                            </span>
                          )
                        })}

                        <button
                          type="button"
                          onClick={() => toggleBookmark(ayah.number)}
                          aria-pressed={saved}
                          aria-label={
                            saved
                              ? `إزالة الآية ${ayah.number} من المحفوظات`
                              : `حفظ الآية ${ayah.number} للمراجعة`
                          }
                          className="mx-1 inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border px-1 align-middle text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                          style={{
                            ...focusRing,
                            fontFamily: 'inherit',
                            borderColor: saved ? 'var(--color-primary)' : 'var(--color-border)',
                            backgroundColor: saved ? 'var(--color-primary)' : 'transparent',
                            color: saved ? '#FFFFFF' : 'var(--color-primary)',
                          }}
                        >
                          ﴿{toArabicNum(ayah.number)}﴾
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleAyahAudio(ayah)}
                          aria-label={playing ? `إيقاف الآية ${ayah.number}` : `استماع إلى الآية ${ayah.number}`}
                          className="ml-2 inline-flex size-9 items-center justify-center rounded-full align-middle transition hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
                          style={{ ...focusRing, color: 'var(--color-primary)' }}
                        >
                          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                        </button>{' '}
                      </span>
                    )
                  })}
                </p>

                <p className="mt-4 text-xs opacity-60">اضغط على رقم الآية لحفظها للمراجعة لاحقاً.</p>
              </article>

              {/* Completion + report */}
              {report && (
                <div
                  className="mt-6 rounded-2xl border p-5"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-secondary)' }}
                  aria-live="polite"
                >
                  {report.complete && (
                    <div
                      className="mb-4 rounded-xl p-4"
                      style={{ backgroundColor: 'var(--color-highlight)' }}
                      role="status"
                    >
                      <p className="flex items-center gap-2 font-bold">
                        <CheckCircle2 size={20} style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                        {lastPage && allDone ? 'أحسنت! أكملت السورة كاملة.' : `أحسنت! أكملت الصفحة ${page.part}.`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {!lastPage && (
                          <button
                            type="button"
                            onClick={() => goToPage(pageIndex + 1)}
                            className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={primaryBtn}
                          >
                            الصفحة التالية
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={startListening}
                          className="min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                          style={outlineBtn}
                        >
                          أعد قراءة الصفحة
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mb-3 flex items-center gap-2 font-bold">
                    <SpellCheck size={20} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    {report.complete ? 'نتيجة فحص الصفحة' : 'فحص مبدئي للصفحة'}
                  </div>

                  <p className="text-sm leading-7 opacity-90">
                    تطابقت {report.matched} من {report.total} كلمة ({report.percent}٪)
                    {report.pending > 0 && ` — لم تتم متابعة ${report.pending} كلمة بعد`}
                    {report.review.length > 0 && ` — ${report.review.length} كلمة تحتاج إلى مراجعة`}
                    {report.complete && report.review.length === 0 && ' — انتهت متابعة كلمات الصفحة'}
                  </p>

                  {report.review.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {report.review.map((item, i) => (
                        <li
                          key={`${item.text}-${i}`}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2 text-sm"
                          style={card}
                        >
                          <span className="text-lg" style={{ fontFamily: QURAN_FONT }}>
                            {item.text}
                          </span>
                          <span className="opacity-70">
                            {item.heard ? `سُمعت: ${item.heard}` : 'لم تُسمع بوضوح'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!report.complete && (
                    <button
                      type="button"
                      onClick={finishPage}
                      className="mt-4 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={outlineBtn}
                    >
                      أنهيت الصفحة
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-2xl border p-5" style={{ ...card, borderColor: 'var(--color-border)' }}>
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-1 shrink-0" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
                <p className="text-sm leading-7 opacity-80">
                  المتابعة الصوتية تقريبية؛ قد تتأثر باللهجة والنطق وجودة الميكروفون. اللون البرتقالي لا يعني
                  بالضرورة وجود خطأ في التلاوة، ولا تُستخدم هذه الألوان للحكم على التجويد أو صحة النطق.
                </p>
              </div>

              <button
                type="button"
                onClick={onToggleCompleted}
                className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl px-5 py-3 font-semibold transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  ...primaryBtn,
                  boxShadow: allDone && !isCompleted ? '0 0 0 3px var(--color-accent)' : undefined,
                }}
              >
                <CheckCircle2 size={19} aria-hidden="true" />
                {isCompleted ? 'إلغاء إتمام السورة' : 'أنهيت القراءة'}
              </button>
            </section>

            <p className="mt-6 text-center text-xs leading-6 opacity-70">
              النص والتلاوة الصوتية: Al Quran Cloud API (وQuran.com عند تعذّر المصدر الأول).{' '}
              <a href="https://alquran.cloud/" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                المصدر
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  )
}