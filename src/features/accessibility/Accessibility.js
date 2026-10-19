// Single source of truth for themes and font sizes.
// Import THEMES from here in App.jsx too (delete the local copy there).

// IMPORTANT: must match the key your ThemeContext uses to persist the theme.
export const THEME_STORAGE_KEY = 'quran-theme'
export const FONT_SIZE_STORAGE_KEY = 'quran-font-size'

export const DEFAULT_THEME = 'soft'
export const DEFAULT_FONT_SIZE = 'medium'

export const THEMES = {
  calm: {
    name: 'هادئ',
    description: 'ألوان هادئة وتحفيز بصري أقل',
    primary: '#2D5A3D',
    secondary: '#E8F5E9',
    accent: '#81C784',
    background: '#FAFAF7',
    surface: '#FFFFFF',
    border: '#81C784',
    text: '#1B1B1B',
    highlight: '#C8E6C9',
    warning: '#F9A825',
    success: '#2E7D32',
    error: '#C62828',
  },
  highContrast: {
    name: 'تباين عالٍ',
    description: 'تباين قوي لضعاف البصر',
    primary: '#000000',
    secondary: '#FFFFFF',
    accent: '#FFD700',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    border: '#000000',
    text: '#000000',
    highlight: '#FFFF00',
    warning: '#FF6600',
    success: '#006600',
    error: '#CC0000',
  },
  soft: {
    name: 'ناعم',
    description: 'الوضع الافتراضي المريح',
    primary: '#047857',
    secondary: '#ECFDF5',
    accent: '#10B981',
    background: '#F7F8F3',
    surface: '#FFFFFF',
    border: '#A7D8C4',
    text: '#1E293B',
    highlight: '#D1FAE5',
    warning: '#D97706',
    success: '#047857',
    error: '#DC2626',
  },
}

export const FONT_SIZES = {
  small: { label: 'صغير', value: '14px' },
  medium: { label: 'متوسط', value: '16px' },
  large: { label: 'كبير', value: '18px' },
  xlarge: { label: 'كبير جداً', value: '20px' },
}

/* ---- Safe storage (localStorage can throw in private mode or when blocked) ---- */

export function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore: setting simply won't persist */
  }
}

// Tolerates both a raw string ("calm") and a JSON-encoded one ("\"calm\"").
function readStoredString(key) {
  const raw = safeGet(key)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : raw
  } catch {
    return raw
  }
}

/* ---- Appliers ---- */

export function applyTheme(themeName) {
  const known = Boolean(THEMES[themeName])
  const name = known ? themeName : DEFAULT_THEME
  const t = THEMES[name]
  const root = document.documentElement

  const variables = {
    '--color-primary': t.primary,
    '--color-secondary': t.secondary,
    '--color-accent': t.accent,
    '--color-bg': t.background,
    '--color-surface': t.surface,
    '--color-border': t.border,
    '--color-text': t.text,
    '--color-highlight': t.highlight,
    '--color-warning': t.warning,
    '--color-success': t.success,
    '--color-error': t.error,
  }

  Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value))
  root.dataset.theme = name
}

export function applyFontSize(sizeId) {
  const size = FONT_SIZES[sizeId] ?? FONT_SIZES[DEFAULT_FONT_SIZE]
  document.documentElement.style.fontSize = size.value
}

export function getStoredFontSize() {
  const saved = readStoredString(FONT_SIZE_STORAGE_KEY)
  return FONT_SIZES[saved] ? saved : DEFAULT_FONT_SIZE
}

/**
 * Call once in main.jsx BEFORE ReactDOM.createRoot(...).render(...)
 * so the saved theme and font size are applied before first paint (no flash).
 */
export function initAccessibility() {
  applyTheme(readStoredString(THEME_STORAGE_KEY) ?? DEFAULT_THEME)
  applyFontSize(getStoredFontSize())
}