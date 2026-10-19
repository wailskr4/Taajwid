import { useState } from 'react'
import { Share2, Download, Copy, Check } from 'lucide-react'

export default function SocialShare({ completed, total, streak, theme }) {
  const [copied, setCopied] = useState(false)
  const percent = total ? Math.round((completed / total) * 100) : 0

  const shareText = `تعلمت ${completed} من ${total} سورة في القرآن الكريم (${percent}%)! 
سلسلة التعلم: ${streak} يوم متتالي 🌟
#نور_القرآن #تعلم_القرآن`

  const shareData = {
    title: 'تقدمي في تعلم القرآن',
    text: shareText,
    url: window.location.href
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        // User cancelled or error
      }
    } else {
      handleCopy()
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = shareText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function generateImage() {
    // Create a canvas-based share card
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = 1080
    canvas.height = 1080

    // Background
    ctx.fillStyle = theme?.primary || '#059669'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Decorative elements
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.arc(540, 400, 300, 0, Math.PI * 2)
    ctx.fill()

    // Text
    ctx.fillStyle = 'white'
    ctx.textAlign = 'center'
    ctx.direction = 'rtl'

    // Title
    ctx.font = 'bold 60px Arial'
    ctx.fillText('تقدمي في تعلم القرآن', 540, 300)

    // Stats
    ctx.font = 'bold 120px Arial'
    ctx.fillText(`${percent}%`, 540, 500)

    ctx.font = '40px Arial'
    ctx.fillText(`${completed} من ${total} سورة`, 540, 600)

    if (streak > 0) {
      ctx.fillText(`🔥 ${streak} يوم متتالي`, 540, 700)
    }

    // Footer
    ctx.font = '30px Arial'
    ctx.fillText('نور القرآن — التعلم للجميع', 540, 900)

    // Download
    const link = document.createElement('a')
    link.download = 'quran-progress.png'
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <section className="mt-12 rounded-3xl border-2 border-dashed p-8 text-center" style={{ borderColor: theme?.accent }}>
      <h2 className="text-2xl font-bold mb-4">شارك تقدمك!</h2>
      <p className="mb-6 opacity-70">شجع الآخرين على تعلم القرآن الكريم</p>

      <div className="flex flex-wrap justify-center gap-4">
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: theme?.primary }}
        >
          <Share2 size={20} />
          مشاركة
        </button>

        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-xl border-2 px-6 py-3 font-semibold transition hover:bg-slate-50"
          style={{ borderColor: theme?.primary, color: theme?.primary }}
        >
          {copied ? <Check size={20} /> : <Copy size={20} />}
          {copied ? 'تم النسخ!' : 'نسخ النص'}
        </button>

        <button
          onClick={generateImage}
          className="inline-flex items-center gap-2 rounded-xl border-2 px-6 py-3 font-semibold transition hover:bg-slate-50"
          style={{ borderColor: theme?.primary, color: theme?.primary }}
        >
          <Download size={20} />
          تحميل بطاقة
        </button>
      </div>

      {/* Preview */}
      <div className="mt-6 mx-auto max-w-sm rounded-2xl p-6 text-white" style={{ backgroundColor: theme?.primary }}>
        <p className="text-lg opacity-90">تعلمت</p>
        <p className="text-5xl font-bold my-2">{percent}%</p>
        <p className="opacity-90">{completed} من {total} سورة</p>
        {streak > 0 && <p className="mt-2">🔥 {streak} يوم متتالي</p>}
      </div>
    </section>
  )
}