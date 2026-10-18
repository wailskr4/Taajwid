import { useEffect, useMemo, useRef, useState } from 'react'
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
  Volume2,
} from 'lucide-react'

const API_URL = 'https://api.alquran.cloud/v1'
const BISMILLAH = ['بسم', 'الله', 'الرحمن', 'الرحيم']
const LOOKAHEAD = 5 // Increased for better matching
const SIMILARITY = 0.68 // Slightly lower for more tolerant matching
const MIN_WORD_LENGTH = 2

// Enhanced Arabic normalization for Quranic text
const normalizeArabic = (text = '') => {
  if (!text) return ''
  
  return text
    .normalize('NFC')
    // Remove harakat (diacritics) but preserve shadda for emphasis detection
    .replace(/[\u064B-\u0650\u0652-\u065F\u0670\u06D6-\u06ED]/g, '')
    // Keep shadda (u0651) as it affects pronunciation
    .replace(/\u0640/g, '') // Remove tatweel
    // Normalize hamza forms
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // Normalize other common variations
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه') // Common in speech recognition
    .replace(/[ء]/g, '') // Remove standalone hamza
    // Remove non-Arabic characters except spaces
    .replace(/[^\u0621-\u064A\s]/g, '')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
}

// Calculate Levenshtein distance for similarity
function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length + 1; j++) matrix[0][j] = j
  
  for (let i = 1; i <= a.length + 1; i++) {
    for (let j = 1; j <= b.length + 1; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return matrix[a.length][b.length]
}

// Enhanced similarity with phonetic awareness for Arabic
function similarity(a, b) {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  
  // Exact match after normalization
  if (a === b) return 1
  
  // Check if one contains the other (for partial matches)
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.9
  }
  
  // Levenshtein-based similarity
  const distance = levenshteinDistance(a, b)
  return 1 - distance / Math.max(a.length, b.length)
}

// Check if words are phonetically similar (common Arabic speech patterns)
function arePhoneticallySimilar(word1, word2) {
  // Common Quranic word variations
  const phoneticMap = {
    'الله': ['اله', 'اللّه', 'اللّٰه'],
    'محمد': ['محمد', 'محمّد'],
    'الرحمن': ['الرحمان', 'الرحمن'],
    'الرحيم': ['الرحيم', 'الرحييم'],
    'رب': ['رب', 'رَب'],
    'العالمين': ['العالمين', 'العلمين', 'العالمين'],
  }
  
  for (const [canonical, variants] of Object.entries(phoneticMap)) {
    if (variants.includes(word1) && variants.includes(word2)) return true
  }
  
  return false
}

// Enhanced alignment with better error handling
function align(spoken, expected, start, states, markReview) {
  const next = { ...states }
  let pointer = start
  const matched = []
  const skipped = []
  
  for (const word of spoken) {
    if (word.length < MIN_WORD_LENGTH) continue
    
    let found = -1
    let bestScore = 0
    
    // Look ahead with scoring
    for (let k = 0; k <= LOOKAHEAD && pointer + k < expected.length; k++) {
      const candidate = expected[pointer + k]
      let score = similarity(word, candidate)
      
      // Boost score for phonetically similar words
      if (arePhoneticallySimilar(word, candidate)) {
        score = Math.max(score, 0.85)
      }
      
      // Boost score for prefix matches (common in Arabic)
      if (candidate.startsWith(word) || word.startsWith(candidate)) {
        score = Math.max(score, 0.8)
      }
      
      if (score >= SIMILARITY && score > bestScore) {
        found = k
        bestScore = score
      }
    }
    
    if (found === -1) {
      skipped.push(word)
      continue
    }
    
    // Mark skipped words as needing review
    if (markReview) {
      for (let k = 0; k < found; k++) {
        if (next[pointer + k] !== 'match') {
          next[pointer + k] = 'review'
        }
      }
    }
    
    next[pointer + found] = 'match'
    matched.push({ word, index: pointer + found, score: bestScore })
    pointer += found + 1
  }
  
  return { pointer, states: next, matched, skipped }
}

// Build text with enhanced tokenization
function buildText(surahId, ayahs) {
  const list = ayahs.map((ayah) => {
    const tokens = []
    const rawWords = ayah.text.split(/\s+/).filter(Boolean)
    
    rawWords.forEach((raw) => {
      const norm = normalizeArabic(raw)
      if (norm.length >= MIN_WORD_LENGTH) {
        tokens.push({ 
          text: raw, 
          norm,
          // Store original for display
          display: raw,
          // Phonetic key for matching
          phonetic: norm.replace(/[اوي]/g, 'V') // Vowel skeleton
        })
      } else if (tokens.length) {
        tokens[tokens.length - 1].text += ` ${raw}`
        tokens[tokens.length - 1].display += ` ${raw}`
      }
    })
    
    return { 
      number: ayah.numberInSurah, 
      audio: ayah.audio, 
      tokens, 
      offset: 0,
      // Add word count for this ayah
      wordCount: tokens.length
    }
  })

  // Handle bismillah
  let bismillah = ''
  const first = list[0]
  if (surahId !== 1 && first && BISMILLAH.every((w, i) => first.tokens[i]?.norm === w)) {
    bismillah = first.tokens.slice(0, 4).map((t) => t.text).join(' ')
    first.tokens = first.tokens.slice(4)
    first.wordCount = first.tokens.length
  }

  let offset = 0
  list.forEach((ayah) => {
    ayah.offset = offset
    offset += ayah.tokens.length
  })

  const totalWords = offset
  
  return {
    ayahs: list,
    bismillah,
    expected: list.flatMap((a) => a.tokens.map((t) => t.norm)),
    totalWords,
    // Determine if we should show full page (surahs > 50 words)
    showFullPage: totalWords > 50,
    // Calculate ayah ranges for display
    ayahRanges: list.map((a, i) => ({
      start: a.offset,
      end: a.offset + a.tokens.length,
      index: i
    }))
  }
}

export default function Reading({
  surahId,
  surahName = '',
  isCompleted = false,
  onToggleCompleted,
  onBack,
}) {
  const [surah, setSurah] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [wordStates, setWordStates] = useState({})
  const [wordScores, setWordScores] = useState({}) // Track confidence scores
  const [playingAyah, setPlayingAyah] = useState(null)
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0)
  const [simpleMode, setSimpleMode] = useState(
    () => document.documentElement.dataset.a11ySimple === 'on',
  )
  const [speechStats, setSpeechStats] = useState({
    totalSpoken: 0,
    matched: 0,
    skipped: 0,
    avgScore: 0
  })

  const recognitionRef = useRef(null)
  const wantListeningRef = useRef(false)
  const progressRef = useRef({ pointer: 0, states: {}, scores: {} })
  const audioRef = useRef(null)
  const statsRef = useRef({ totalSpoken: 0, matched: 0, skipped: 0, scoreSum: 0 })

  const built = useMemo(
    () => (surah ? buildText(surahId, surah.ayahs) : null),
    [surah, surahId],
  )
  const builtRef = useRef(null)
  builtRef.current = built

  // Check if we should use full-page mode
  const isFullPageMode = built?.showFullPage || false

  useEffect(() => {
    const sync = () =>
      setSimpleMode(document.documentElement.dataset.a11ySimple === 'on')
    window.addEventListener('a11y-settings-changed', sync)
    return () => window.removeEventListener('a11y-settings-changed', sync)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSurah() {
      setLoading(true)
      setError('')
      setSurah(null)
      setWordStates({})
      setWordScores({})
      setTranscript('')
      setCurrentAyahIndex(0)
      setSpeechStats({ totalSpoken: 0, matched: 0, skipped: 0, avgScore: 0 })
      progressRef.current = { pointer: 0, states: {}, scores: {} }
      statsRef.current = { totalSpoken: 0, matched: 0, skipped: 0, scoreSum: 0 }

      try {
        const response = await fetch(`${API_URL}/surah/${surahId}/ar.alafasy`)
        if (!response.ok) throw new Error('load failed')

        const result = await response.json()
        if (result.code !== 200 || !result.data?.ayahs) {
          throw new Error('bad data')
        }
        if (!cancelled) setSurah(result.data)
      } catch {
        if (!cancelled) {
          setError('تعذر تحميل السورة. تحقق من اتصال الإنترنت ثم حاول مجدداً.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSurah()
    return () => {
      cancelled = true
    }
  }, [surahId])

  useEffect(() => {
    return () => {
      wantListeningRef.current = false
      recognitionRef.current?.stop()
      audioRef.current?.pause()
    }
  }, [])

  function stopListening() {
    wantListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }

  function handleResult(event) {
    const expected = builtRef.current?.expected
    if (!expected) return

    let { pointer, states, scores } = progressRef.current
    let shown = states
    let shownScores = scores
    let heard = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      heard = result[0].transcript
      const words = normalizeArabic(heard).split(/\s+/).filter(Boolean)
      
      const out = align(words, expected, pointer, states, result.isFinal)
      shown = out.states
      shownScores = { ...scores }
      
      // Update scores for matched words
      out.matched.forEach(({ index, score }) => {
        shownScores[index] = Math.max(shownScores[index] || 0, score)
      })
      
      // Update stats
      statsRef.current.totalSpoken += words.length
      statsRef.current.matched += out.matched.length
      statsRef.current.skipped += out.skipped.length
      out.matched.forEach(({ score }) => {
        statsRef.current.scoreSum += score
      })

      if (result.isFinal) {
        pointer = out.pointer
        states = out.states
        scores = shownScores
        progressRef.current = { pointer, states, scores }
        
        // Update stats display
        const avg = statsRef.current.matched > 0 
          ? statsRef.current.scoreSum / statsRef.current.matched 
          : 0
        setSpeechStats({
          totalSpoken: statsRef.current.totalSpoken,
          matched: statsRef.current.matched,
          skipped: statsRef.current.skipped,
          avgScore: avg
        })
      }
    }

    setTranscript(heard.trim())
    setWordStates(shown)
    setWordScores(shownScores)
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('المتصفح لا يدعم التعرف على الصوت. جرّب متصفحاً يدعم هذه الخاصية.')
      return
    }

    recognitionRef.current?.stop()
    wantListeningRef.current = true

    const recognition = new SpeechRecognition()
    // Enhanced settings for Arabic
    recognition.lang = 'ar-SA'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3 // Get multiple alternatives for better matching

    recognition.onstart = () => {
      setListening(true)
      setError('')
    }
    
    recognition.onresult = (event) => {
      // Try all alternatives for better matching
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        // Use the best alternative (highest confidence)
        let bestTranscript = result[0].transcript
        let bestConfidence = result[0].confidence || 0
        
        for (let j = 1; j < result.length; j++) {
          if ((result[j].confidence || 0) > bestConfidence) {
            bestTranscript = result[j].transcript
            bestConfidence = result[j].confidence || 0
          }
        }
        
        // Create a modified event with the best alternative
        const modifiedEvent = {
          ...event,
          resultIndex: i,
          results: [{
            ...result,
            0: { transcript: bestTranscript, confidence: bestConfidence },
            isFinal: result.isFinal,
            length: 1
          }]
        }
        
        handleResult(modifiedEvent)
      }
    }
    
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      wantListeningRef.current = false
      setError('لم نتمكن من التعرف على الصوت. تحقق من إذن الميكروفون وحاول مجدداً.')
      setListening(false)
    }
    
    recognition.onend = () => {
      if (wantListeningRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start()
          return
        } catch {
          // fall through
        }
      }
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function startOfCurrentView(index = currentAyahIndex) {
    // In full page mode, always start from beginning
    if (isFullPageMode) return 0
    return simpleMode ? built?.ayahs[index]?.offset ?? 0 : 0
  }

  function goToAyah(index) {
    setCurrentAyahIndex(index)
    progressRef.current = {
      ...progressRef.current,
      pointer: built?.ayahs[index]?.offset ?? 0,
    }
  }

  function playAyah(ayah) {
    if (!ayah.audio) {
      setError('الصوت غير متاح لهذه الآية حالياً.')
      return
    }

    if (playingAyah === ayah.number) {
      audioRef.current?.pause()
      setPlayingAyah(null)
      return
    }

    if (!audioRef.current) audioRef.current = new Audio()

    audioRef.current.pause()
    audioRef.current.src = ayah.audio
    audioRef.current.onended = () => setPlayingAyah(null)
    audioRef.current.onerror = () => {
      setPlayingAyah(null)
      setError('تعذر تشغيل الصوت. حاول مجدداً.')
    }

    audioRef.current
      .play()
      .then(() => setPlayingAyah(ayah.number))
      .catch(() => setError('تعذر تشغيل الصوت حالياً.'))
  }

  // Play entire surah sequentially
  async function playFullSurah() {
    if (!built?.ayahs) return
    
    for (const ayah of built.ayahs) {
      if (!wantListeningRef.current) break // Allow cancellation
      
      await new Promise((resolve) => {
        const audio = new Audio(ayah.audio)
        audioRef.current = audio
        setPlayingAyah(ayah.number)
        
        // Highlight current ayah
        setCurrentAyahIndex(built.ayahs.indexOf(ayah))
        
        audio.onended = () => {
          setPlayingAyah(null)
          resolve()
        }
        audio.onerror = () => {
          setPlayingAyah(null)
          setError('تعذر تشغيل بعض الآيات.')
          resolve()
        }
        audio.play().catch(() => {
          setError('تعذر تشغيل الصوت.')
          resolve()
        })
      })
    }
  }

  function resetPractice() {
    stopListening()
    audioRef.current?.pause()
    setPlayingAyah(null)
    setTranscript('')
    setWordStates({})
    setWordScores({})
    setError('')
    setSpeechStats({ totalSpoken: 0, matched: 0, skipped: 0, avgScore: 0 })
    statsRef.current = { totalSpoken: 0, matched: 0, skipped: 0, scoreSum: 0 }
    progressRef.current = { pointer: startOfCurrentView(), states: {}, scores: {} }
  }

  const totalWords = built?.expected.length ?? 0
  const matchedCount = Object.values(wordStates).filter((s) => s === 'match').length
  const reviewCount = Object.values(wordStates).filter((s) => s === 'review').length
  const progress = totalWords ? Math.round((matchedCount / totalWords) * 100) : 0
  
  // Calculate precision metrics
  const precision = speechStats.totalSpoken > 0 
    ? Math.round((speechStats.matched / speechStats.totalSpoken) * 100) 
    : 0

  // Determine visible ayahs based on mode
  const visibleAyahs = built
    ? isFullPageMode
      ? built.ayahs // Show all ayahs in full page mode
      : simpleMode
        ? [built.ayahs[currentAyahIndex]].filter(Boolean)
        : built.ayahs
    : []

  return (
    <main
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-[#f7f8f3] px-4 py-8 text-slate-800 sm:px-8"
    >
      <div className={`mx-auto ${isFullPageMode ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 rounded-xl px-4 py-3 font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
        >
          <ArrowRight size={20} />
          العودة إلى السور
        </button>

        <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-3 flex items-center gap-3 text-emerald-700">
            <BookOpen size={25} />
            <span className="font-medium">رحلة التعلم</span>
            {isFullPageMode && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
                عرض كامل ({totalWords} كلمة)
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold text-emerald-950 sm:text-4xl">
            {surah?.name || surahName}
          </h1>

          {surah && (
            <p className="mt-2 text-slate-500">
              {surah.numberOfAyahs} آيات • {totalWords} كلمة
            </p>
          )}

          <p className="mt-4 leading-8 text-slate-600">
            اقرأ بهدوء، واستمع إلى التلاوة، واستخدم الميكروفون لتجربة المتابعة الصوتية.
          </p>
        </header>

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-white p-10">
            <LoaderCircle className="animate-spin text-emerald-700" />
            <span>جارٍ تحميل السورة...</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
          >
            {error}
          </div>
        )}

        {!loading && !surah && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-white"
          >
            إعادة المحاولة
          </button>
        )}

        {built && (
          <>
            <section
              aria-label="أدوات القراءة"
              className="mb-6 rounded-2xl bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  className={`inline-flex min-h-14 items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    listening
                      ? 'bg-rose-600 focus-visible:outline-rose-700'
                      : 'bg-emerald-700 focus-visible:outline-emerald-700'
                  }`}
                >
                  {listening ? <MicOff size={19} /> : <Mic size={19} />}
                  {listening ? 'إيقاف الميكروفون' : 'ابدأ القراءة الصوتية'}
                </button>

                <button
                  type="button"
                  onClick={resetPractice}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
                >
                  <RotateCcw size={18} />
                  إعادة المحاولة
                </button>

                {isFullPageMode && (
                  <button
                    type="button"
                    onClick={playFullSurah}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-white hover:bg-amber-700"
                  >
                    <Volume2 size={18} />
                    تشغيل السورة كاملة
                  </button>
                )}
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-500">
                {listening
                  ? 'الميكروفون يعمل. تابع القراءة بوضوح.'
                  : 'يمكنك الاستماع إلى كل آية أو تجربة المتابعة الصوتية.'}
              </p>

              {listening && (
                <div className="mt-2 space-y-2">
                  <p className="min-h-6 text-sm text-slate-400">
                    {transcript ? `أسمع: ${transcript}` : 'في انتظار صوتك…'}
                  </p>
                  
                  {/* Precision metrics */}
                  {speechStats.totalSpoken > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 p-3 bg-slate-50 rounded-lg text-xs">
                      <div>
                        <span className="block text-slate-500">الكلمات المنطوقة</span>
                        <span className="font-bold text-lg">{speechStats.totalSpoken}</span>
                      </div>
                      <div>
                        <span className="block text-slate-500">المتطابقة</span>
                        <span className="font-bold text-lg text-emerald-600">{speechStats.matched}</span>
                      </div>
                      <div>
                        <span className="block text-slate-500">الدقة</span>
                        <span className="font-bold text-lg text-blue-600">{precision}%</span>
                      </div>
                      <div>
                        <span className="block text-slate-500">متوسط الثقة</span>
                        <span className="font-bold text-lg text-amber-600">
                          {Math.round(speechStats.avgScore * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5">
                <div className="mb-2 flex justify-between text-sm">
                  <span>المتابعة التقريبية</span>
                  <span>{progress}%</span>
                </div>

                <div
                  className="h-3 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="نسبة الكلمات المتطابقة تقريباً"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all motion-reduce:transition-none"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                
                {reviewCount > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    {reviewCount} كلمة تحتاج مراجعة
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-2 text-emerald-700">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  تطابق محتمل
                </span>
                <span className="flex items-center gap-2 text-amber-700">
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  يحتاج إلى مراجعة
                </span>
                <span className="flex items-center gap-2 text-slate-500">
                  <span className="h-3 w-3 rounded-full bg-slate-300" />
                  لم تتم متابعته
                </span>
              </div>
            </section>

            <section className={`rounded-3xl bg-white p-5 shadow-sm sm:p-8 ${isFullPageMode ? 'min-h-screen' : ''}`}>
              {/* Only show ayah navigation in simple mode AND not full page */}
              {simpleMode && !isFullPageMode && (
                <div className="mb-6 rounded-2xl bg-emerald-50 p-5">
                  <p className="mb-4 text-center text-lg font-bold text-emerald-950">
                    الآية {currentAyahIndex + 1} من {built.ayahs.length}
                  </p>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={currentAyahIndex === 0}
                      onClick={() => goToAyah(currentAyahIndex - 1)}
                      className="min-h-14 rounded-xl bg-white px-5 text-lg font-bold text-emerald-900 shadow-sm disabled:opacity-40"
                    >
                      الآية السابقة
                    </button>

                    <button
                      type="button"
                      disabled={currentAyahIndex >= built.ayahs.length - 1}
                      onClick={() => goToAyah(currentAyahIndex + 1)}
                      className="min-h-14 rounded-xl bg-emerald-700 px-5 text-lg font-bold text-white disabled:opacity-40"
                    >
                      الآية التالية
                    </button>
                  </div>
                </div>
              )}

              <h2 className="mb-6 text-xl font-bold text-emerald-950">
                آيات السورة
                {isFullPageMode && (
                  <span className="mr-2 text-sm font-normal text-slate-500">
                    (عرض كامل)
                  </span>
                )}
              </h2>

              {built.bismillah && (!simpleMode || currentAyahIndex === 0 || isFullPageMode) && (
                <p className="mb-6 text-center text-2xl leading-[2.2] text-emerald-900 sm:text-3xl">
                  {built.bismillah}
                </p>
              )}

              <div className={isFullPageMode ? 'space-y-4' : 'space-y-6'}>
                {visibleAyahs.map((ayah, ayahIdx) => (
                  <article
                    key={ayah.number}
                    className={`rounded-2xl border p-4 sm:p-6 ${
                      isFullPageMode 
                        ? 'border-slate-200 bg-slate-50/50' 
                        : 'border-slate-100'
                    } ${playingAyah === ayah.number ? 'ring-2 ring-emerald-500' : ''}`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                          الآية {ayah.number}
                        </span>
                        <span className="text-xs text-slate-400">
                          {ayah.wordCount} كلمة
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => playAyah(ayah)}
                        aria-label={
                          playingAyah === ayah.number ? 'إيقاف التلاوة' : 'استماع إلى الآية'
                        }
                        className="rounded-xl p-3 text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                      >
                        {playingAyah === ayah.number ? <Pause size={21} /> : <Play size={21} />}
                      </button>
                    </div>

                    <p className={`text-right leading-[2.4] ${isFullPageMode ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>
                      {ayah.tokens.map((token, i) => {
                        const globalIndex = ayah.offset + i
                        const state = wordStates[globalIndex]
                        const score = wordScores[globalIndex]
                        
                        // Determine styling based on state and score
                        let bgColor = 'text-slate-800'
                        if (state === 'match') {
                          if (score >= 0.9) {
                            bgColor = 'bg-emerald-200 text-emerald-900 font-medium'
                          } else if (score >= 0.75) {
                            bgColor = 'bg-emerald-100 text-emerald-800'
                          } else {
                            bgColor = 'bg-emerald-50 text-emerald-700'
                          }
                        } else if (state === 'review') {
                          bgColor = 'bg-amber-100 text-amber-900 underline decoration-dotted decoration-amber-600 underline-offset-8'
                        }
                        
                        return (
                          <span
                            key={`${ayah.number}-${i}`}
                            className={`mx-1 inline rounded-lg px-1 ${bgColor}`}
                            title={score ? `ثقة: ${Math.round(score * 100)}%` : undefined}
                          >
                            {token.text}{' '}
                          </span>
                        )
                      })}
                    </p>
                    
                    {/* Show ayah progress in full page mode */}
                    {isFullPageMode && (
                      <div className="mt-3 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all"
                          style={{ 
                            width: `${(ayah.tokens.filter((_, i) => wordStates[ayah.offset + i] === 'match').length / ayah.tokens.length) * 100}%` 
                          }}
                        />
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-1 shrink-0 text-amber-600" />
                <div className="text-sm leading-7 text-slate-600">
                  <p>
                    المتابعة الصوتية تقريبية؛ قد تتأثر باللهجة والنطق وجودة الميكروفون.
                    اللون البرتقالي لا يعني بالضرورة وجود خطأ في التلاوة.
                  </p>
                  <p className="mt-2">
                    <strong>نصائح للحصول على أفضل النتائج:</strong>
                  </p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>استخدم ميكروفوناً واضحاً وبعيداً عن الضوضاء</li>
                    <li>اقرأ بوتيرة ثابتة وواضحة</li>
                    <li>تجنب القراءة بسرعة كبيرة جداً</li>
                    <li>النظام يدعم الاختلافات الشائعة في نطق الحروف</li>
                  </ul>
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleCompleted}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <CheckCircle2 size={19} />
                {isCompleted ? 'إلغاء إتمام السورة' : 'أنهيت القراءة'}
              </button>
            </section>

            <p className="mt-6 text-center text-xs leading-6 text-slate-500">
              النص والتلاوة الصوتية: Al Quran Cloud API.{' '}
              <a
                href="https://alquran.cloud/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                المصدر
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  )
}