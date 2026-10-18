import { useEffect, useId, useState } from 'react'

const STORAGE_KEY = 'nour-quran-accessibility'

const defaultSettings = {
  textSize: 'normal',
  highContrast: false,
  reduceMotion: true,
  focusMode: false,
  simpleMode: true,
  soundFeedback: false,
}

const textSizes = [
  { value: 'normal', label: 'عادي', scale: 1, sample: 'text-base' },
  { value: 'large', label: 'كبير', scale: 1.15, sample: 'text-xl' },
  { value: 'xlarge', label: 'كبير جداً', scale: 1.3, sample: 'text-2xl' },
]

const toggles = [
  {
    key: 'highContrast',
    title: 'التباين العالي',
    description: 'زيادة وضوح النصوص والعناصر على الشاشة.',
  },
  {
    key: 'reduceMotion',
    title: 'تقليل الحركة',
    description: 'تقليل الحركات والانتقالات غير الضرورية.',
  },
  {
    key: 'focusMode',
    title: 'التركيز على القراءة',
    description: 'إبراز العناصر التي تتفاعل معها أثناء التعلّم.',
  },
  {
    key: 'simpleMode',
    title: 'واجهة بسيطة',
    description: 'تقليل المؤثرات البصرية لتسهيل التركيز.',
  },
  {
    key: 'soundFeedback',
    title: 'التنبيهات الصوتية',
    description: 'تفضيل التنبيهات الصوتية الاختيارية عند توفرها.',
  },
]

function prefers(query) {
  return typeof window !== 'undefined' && window.matchMedia?.(query).matches
}

// Keep only known keys with valid values, so bad saved data can't break the UI
function sanitize(raw) {
  const result = { ...defaultSettings }
  if (!raw || typeof raw !== 'object') return result

  if (textSizes.some((size) => size.value === raw.textSize)) {
    result.textSize = raw.textSize
  }
  for (const key of Object.keys(defaultSettings)) {
    if (key !== 'textSize' && typeof raw[key] === 'boolean') {
      result[key] = raw[key]
    }
  }
  return result
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return sanitize(JSON.parse(saved))
  } catch {
    // fall through to defaults
  }
  // First visit: respect the system preferences
  return {
    ...defaultSettings,
    reduceMotion: defaultSettings.reduceMotion || prefers('(prefers-reduced-motion: reduce)'),
    highContrast: prefers('(prefers-contrast: more)'),
  }
}

export function applySettings(settings) {
  const root = document.documentElement
  const size = textSizes.find((item) => item.value === settings.textSize)

  root.style.setProperty('--a11y-scale', String(size?.scale ?? 1))
  root.dataset.a11yContrast = settings.highContrast ? 'high' : 'normal'
  root.dataset.a11yMotion = settings.reduceMotion ? 'reduced' : 'normal'
  root.dataset.a11yFocus = settings.focusMode ? 'on' : 'off'
  root.dataset.a11ySimple = settings.simpleMode ? 'on' : 'off'
}

// Call once in main.jsx before rendering, so settings apply on every screen
// (including the reading view) and there is no flash on page load.
export function initAccessibility() {
  applySettings(loadSettings())
}

export default function AccessibilitySettings() {
  const [settings, setSettings] = useState(loadSettings)
  const [status, setStatus] = useState('')

  useEffect(() => {
    applySettings(settings)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Storage unavailable: settings still apply for this session
    }
  }, [settings])

  function updateSetting(key, value) {
    setStatus('')
    setSettings((previous) => ({ ...previous, [key]: value }))
  }

  function resetSettings() {
    setSettings({ ...defaultSettings })
    setStatus('تمت استعادة الإعدادات الافتراضية.')
  }

  return (
    <section
      id="accessibility"
      dir="rtl"
      lang="ar"
      aria-labelledby="accessibility-title"
      className="mx-auto my-12 max-w-7xl scroll-mt-28 px-5"
    >
      <div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
        <div className="bg-emerald-900 p-6 text-white sm:p-8">
          <div className="flex items-start gap-4">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl"
              aria-hidden="true"
            >
              ♿
            </div>

            <div>
              <h2 id="accessibility-title" className="text-2xl font-bold sm:text-3xl">
                إعدادات الوصول
              </h2>
              <p className="mt-2 max-w-xl leading-7 text-emerald-100">
                خصّص طريقة التعلّم بما يناسب احتياجاتك واجعل القراءة أكثر راحة
                وسهولة.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <fieldset>
            <legend className="font-bold text-slate-900">حجم الخط</legend>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              اختر الحجم المناسب لقراءة النصوص.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {textSizes.map((size) => (
                <label key={size.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="text-size"
                    value={size.value}
                    checked={settings.textSize === size.value}
                    onChange={() => updateSetting('textSize', size.value)}
                    className="peer sr-only"
                  />
                  <span className="block rounded-xl border-2 border-slate-200 px-2 py-4 text-center font-semibold text-slate-700 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-50 peer-checked:text-emerald-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-700 hover:border-emerald-300 motion-reduce:transition-none">
                    <span className={`mb-2 block ${size.sample}`} aria-hidden="true">
                      أ
                    </span>
                    <span className="text-sm">{size.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="border-t border-slate-100" />

          <div className="space-y-5">
            {toggles.map((item) => (
              <SettingToggle
                key={item.key}
                title={item.title}
                description={item.description}
                checked={settings[item.key]}
                onChange={(value) => updateSetting(item.key, value)}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-500">معاينة</p>
            <p className="mt-3 text-lg font-bold leading-loose text-slate-900">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              يمكنك تعديل الإعدادات حتى تجد الطريقة الأنسب للتعلّم والقراءة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={resetSettings}
              className="w-full rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto"
            >
              استعادة الإعدادات الافتراضية
            </button>

            <p role="status" aria-live="polite" className="text-sm text-emerald-800">
              {status}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SettingToggle({ title, description, checked, onChange }) {
  const id = useId()

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <h3 id={`${id}-title`} className="font-semibold text-slate-900">
          {title}
        </h3>
        <p id={`${id}-desc`} className="mt-1 text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none ${
          checked ? 'bg-emerald-700' : 'bg-slate-500'
        }`}
      >
        {/* RTL: the knob moves to the left when the switch is on */}
        <span
          aria-hidden="true"
          className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-all motion-reduce:transition-none ${
            checked ? 'left-1' : 'left-7'
          }`}
        />
      </button>
    </div>
  )
}