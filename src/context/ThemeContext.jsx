
import {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'quran-theme'
const DEFAULT_THEME = 'soft'

const THEMES = {
  calm: {
    name: 'هادئ',
    primary: '#2D5A3D',
    secondary: '#E8F5E9',
    accent: '#81C784',
    background: '#FAFAF7',
    text: '#1B1B1B',
    highlight: '#C8E6C9',
    warning: '#F9A825',
    success: '#388E3C',
    error: '#C62828',
  },

  highContrast: {
    name: 'تباين عالٍ',
    primary: '#000000',
    secondary: '#FFFFFF',
    accent: '#FFD700',
    background: '#FFFFFF',
    text: '#000000',
    highlight: '#FFFF00',
    warning: '#FF6600',
    success: '#006600',
    error: '#CC0000',
  },

  soft: {
    name: 'ناعم',
    primary: '#059669',
    secondary: '#ECFDF5',
    accent: '#10B981',
    background: '#F7F8F3',
    text: '#1E293B',
    highlight: '#D1FAE5',
    warning: '#D97706',
    success: '#059669',
    error: '#DC2626',
  },
}

// Lit le thème sauvegardé en vérifiant sa validité.
function getInitialTheme() {
  try {
    const savedTheme = localStorage.getItem(STORAGE_KEY)

    return savedTheme && THEMES[savedTheme]
      ? savedTheme
      : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

// Applique les couleurs du thème aux variables CSS.
function applyTheme(theme) {
  const root = document.documentElement

  root.style.setProperty('--color-primary', theme.primary)
  root.style.setProperty('--color-secondary', theme.secondary)
  root.style.setProperty('--color-accent', theme.accent)
  root.style.setProperty('--color-bg', theme.background)
  root.style.setProperty('--color-text', theme.text)
  root.style.setProperty('--color-highlight', theme.highlight)
  root.style.setProperty('--color-warning', theme.warning)
  root.style.setProperty('--color-success', theme.success)
  root.style.setProperty('--color-error', theme.error)
}

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(getInitialTheme)

  const theme = THEMES[themeName] || THEMES[DEFAULT_THEME]

  useEffect(() => {
    applyTheme(theme)

    try {
      localStorage.setItem(STORAGE_KEY, themeName)
    } catch (error) {
      console.warn('Impossible de sauvegarder le thème :', error)
    }
  }, [themeName, theme])

  const setTheme = (name) => {
    if (THEMES[name]) {
      setThemeName(name)
    }
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themeName,
        setTheme,
        themes: THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error(
      'useTheme must be used within ThemeProvider'
    )
  }

  return context
}
