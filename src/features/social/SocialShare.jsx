import { useState, useEffect } from 'react'

import { Share2, Download, Copy, Check, User, Trash2 } from 'lucide-react'

const FONT = "'Cairo','Tajawal','Segoe UI',Arial,sans-serif"
const GOLD = '#FFD86B'

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(f, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(hex, target, t) {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`
}

function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647
}

function sparkle(ctx, x, y, r, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#FFF6D6'
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fill()
  ctx.restore()
}

function star5(ctx, x, y, R, filled) {
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? R * 0.47 : R
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  }
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 12
  if (filled) {
    ctx.shadowColor = 'rgba(255,216,107,.9)'
    ctx.shadowBlur = 25
    ctx.strokeStyle = GOLD
    ctx.fillStyle = GOLD
    ctx.stroke()
    ctx.fill()
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'
    ctx.fillStyle = 'rgba(255,255,255,.08)'
    ctx.stroke()
    ctx.fill()
  }
  ctx.restore()
}

function crescent(ctx, x, y, r) {
  const size = r * 3
  const c = document.createElement('canvas')
  c.width = c.height = size
  const k = c.getContext('2d')
  const m = size / 2
  k.fillStyle = '#FFE49A'
  k.beginPath()
  k.arc(m, m, r, 0, Math.PI * 2)
  k.fill()
  k.globalCompositeOperation = 'destination-out'
  k.beginPath()
  k.arc(m + r * 0.45, m - r * 0.2, r * 0.85, 0, Math.PI * 2)
  k.fill()
  ctx.save()
  ctx.shadowColor = 'rgba(255,226,140,.9)'
  ctx.shadowBlur = 50
  ctx.drawImage(c, x - m, y - m)
  ctx.restore()
}

function lantern(ctx, x, top, len, s) {
  const dark = '#C98A1B'
  ctx.save()
  ctx.strokeStyle = 'rgba(255,230,150,.7)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.lineTo(x, top + len)
  ctx.stroke()
  ctx.translate(x, top + len)

  const g = ctx.createRadialGradient(0, 70 * s, 5, 0, 70 * s, 110 * s)
  g.addColorStop(0, 'rgba(255,220,120,.5)')
  g.addColorStop(1, 'rgba(255,220,120,0)')
  ctx.fillStyle = g
  ctx.fillRect(-120 * s, -40 * s, 240 * s, 280 * s)

  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(-16 * s, 0)
  ctx.lineTo(16 * s, 0)
  ctx.lineTo(30 * s, 22 * s)
  ctx.lineTo(-30 * s, 22 * s)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#FFE08A'
  ctx.beginPath()
  ctx.moveTo(-30 * s, 22 * s)
  ctx.quadraticCurveTo(-50 * s, 70 * s, -30 * s, 118 * s)
  ctx.lineTo(30 * s, 118 * s)
  ctx.quadraticCurveTo(50 * s, 70 * s, 30 * s, 22 * s)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = dark
  ctx.lineWidth = 4 * s
  ctx.beginPath()
  ctx.moveTo(0, 22 * s)
  ctx.lineTo(0, 118 * s)
  ctx.moveTo(-18 * s, 24 * s)
  ctx.quadraticCurveTo(-28 * s, 70 * s, -18 * s, 118 * s)
  ctx.moveTo(18 * s, 24 * s)
  ctx.quadraticCurveTo(28 * s, 70 * s, 18 * s, 118 * s)
  ctx.moveTo(0, 130 * s)
  ctx.lineTo(0, 152 * s)
  ctx.stroke()

  ctx.fillStyle = dark
  ctx.fillRect(-32 * s, 118 * s, 64 * s, 12 * s)
  ctx.restore()
}

function arch(ctx, x, y, w, h) {
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y + h)
  ctx.lineTo(x - w / 2, y)
  ctx.arc(x, y, w / 2, Math.PI, 0)
  ctx.lineTo(x + w / 2, y + h)
  ctx.closePath()
  ctx.fill()
}

function mosque(ctx, baseY, color) {
  ctx.save()
  ctx.fillStyle = color

  // body
  ctx.fillRect(300, baseY - 100, 480, 100)

  // domes
  ctx.beginPath()
  ctx.arc(540, baseY - 100, 110, Math.PI, 0)
  ctx.fill()
  ;[350, 730].forEach((x) => {
    ctx.beginPath()
    ctx.arc(x, baseY - 100, 55, Math.PI, 0)
    ctx.fill()
  })

  // minarets
  ;[240, 840].forEach((x) => {
    ctx.fillStyle = color
    ctx.fillRect(x - 28, baseY - 300, 56, 300)
    ctx.fillRect(x - 42, baseY - 312, 84, 14)
    ctx.beginPath()
    ctx.moveTo(x - 32, baseY - 312)
    ctx.lineTo(x, baseY - 400)
    ctx.lineTo(x + 32, baseY - 312)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#FFE08A'
    arch(ctx, x, baseY - 260, 20, 40)
    arch(ctx, x, baseY - 190, 20, 40)
  })

  // finial on the main dome
  ctx.strokeStyle = '#FFE08A'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(540, baseY - 210)
  ctx.lineTo(540, baseY - 245)
  ctx.stroke()
  ctx.fillStyle = '#FFE08A'
  ctx.beginPath()
  ctx.arc(540, baseY - 252, 8, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

export default function SocialShare({ completed, total, streak, theme }) {

  const [copied, setCopied] = useState(false)

  const [name, setName] = useState('')

  const [isEditingName, setIsEditingName] = useState(false)

  const [tempName, setTempName] = useState('')



  const percent = total ? Math.round((completed / total) * 100) : 0



  // Load name from localStorage on mount

  useEffect(() => {

    const savedName = localStorage.getItem('userName')

    if (savedName) {

      setName(savedName)

    } else {

      setIsEditingName(true)

    }

  }, [])



  // Save name to localStorage

  const saveName = () => {

    const trimmedName = tempName.trim()

    if (trimmedName) {

      setName(trimmedName)

      localStorage.setItem('userName', trimmedName)

      setIsEditingName(false)

    }

  }



  // Delete name from localStorage

  const deleteName = () => {

    setName('')

    setTempName('')

    localStorage.removeItem('userName')

    setIsEditingName(true)

  }



  // Edit name

  const editName = () => {

    setTempName(name)

    setIsEditingName(true)

  }



  // Cancel editing

  const cancelEdit = () => {

    setTempName('')

    setIsEditingName(false)

  }



  const shareText = name 

    ? `أنا ${name}! تعلمت ${completed} من ${total} سورة في القرآن الكريم (${percent}%)!

سلسلة التعلم: ${streak} يوم متتالي 🌟

#نور_القرآن #تعلم_القرآن`

    : `تعلمت ${completed} من ${total} سورة في القرآن الكريم (${percent}%)!

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



async function generateImage() {
  try {
    await document.fonts.load(`bold 60px Cairo`)
  } catch {
    /* police de secours */
  }

  const base = /^#/.test(theme?.primary || '') ? theme.primary : '#059669'
  const W = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = W
  const ctx = canvas.getContext('2d')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.direction = 'rtl'

  // Ciel de nuit
  const sky = ctx.createLinearGradient(0, 0, 0, W)
  sky.addColorStop(0, mix(base, '#0a0f3c', 0.8))
  sky.addColorStop(0.6, mix(base, '#0a0f3c', 0.45))
  sky.addColorStop(1, mix(base, '#0a0f3c', 0.15))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, W)

  // Lueur de l'horizon
  const glow = ctx.createRadialGradient(540, 1000, 20, 540, 1000, 700)
  glow.addColorStop(0, 'rgba(255,216,107,.35)')
  glow.addColorStop(1, 'rgba(255,216,107,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, W)

  // Étoiles scintillantes
  const rand = seeded(42)
  for (let i = 0; i < 70; i++) {
    sparkle(ctx, rand() * W, rand() * 720, 4 + rand() * 9, 0.4 + rand() * 0.6)
  }

  // Lune et lanternes
  crescent(ctx, 880, 170, 85)
  lantern(ctx, 110, 0, 170, 1)
  lantern(ctx, 250, 0, 90, 0.8)

  // Mosquée
  mosque(ctx, 1080, mix(base, '#000000', 0.78))

  // Message selon le progrès
  const greeting =
    percent >= 100 ? 'ما شاء الله! ختمت 🎉 تقبل الله منك و سيجازيك على اجتهادك' : percent >= 50 ? 'تبارك الله واسل' : percent > 0 ? ' أحسنت ما شاء الله!' : 'هيا نبدأ!'

  ctx.save()
  ctx.shadowColor = 'rgba(255,216,107,.7)'
  ctx.shadowBlur = 30
  ctx.fillStyle = GOLD
  ctx.font = `bold 96px ${FONT}`
  ctx.fillText(greeting, 540, 215)
  ctx.restore()

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 50px ${FONT}`
  ctx.fillText(name ? `يا ${name}` : 'يا بطل القرآن', 540, 300)

  // 5 étoiles (de droite à gauche)
  const filledStars = percent === 0 ? 0 : Math.ceil(percent / 20)
  for (let i = 0; i < 5; i++) {
    star5(ctx, 540 + (i - 2) * 95, 385, 36, 4 - i < filledStars)
  }

  // Anneau de progression
  const cx = 540
  const cy = 575
  const R = 125
  ctx.lineCap = 'round'
  ctx.lineWidth = 38
  ctx.fillStyle = 'rgba(255,255,255,.1)'
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.2)'
  ctx.stroke()

  if (percent > 0) {
    const ring = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
    ring.addColorStop(0, '#FFE9A0')
    ring.addColorStop(1, '#FFB62E')
    ctx.save()
    ctx.strokeStyle = ring
    ctx.shadowColor = 'rgba(255,200,80,.8)'
    ctx.shadowBlur = 28
    ctx.beginPath()
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * percent) / 100)
    ctx.stroke()
    ctx.restore()
  }

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 92px ${FONT}`
  ctx.fillText(`${percent}%`, cx, cy - 12)
  ctx.font = `600 32px ${FONT}`
  ctx.globalAlpha = 0.85
  ctx.fillText('تعلمت', cx, cy + 58)
  ctx.globalAlpha = 1

  // Nombre de sourates
  ctx.font = `bold 46px ${FONT}`
  ctx.fillText(`${completed} من ${total} سورة`, 540, 765)

  // Série de jours
  if (streak > 0) {
    ctx.fillStyle = 'rgba(255,255,255,.16)'
    ctx.beginPath()
    ctx.roundRect(350, 800, 380, 58, 29)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold 34px ${FONT}`
    ctx.fillText(`🔥 ${streak} يوم متتالي`, 540, 830)
  }

  // Pied de page
  ctx.fillStyle = '#FFE9A0'
  ctx.font = `600 30px ${FONT}`
  ctx.fillText('نور القرآن — التعلم للجميع', 540, 1040)

  const link = document.createElement('a')
  link.download = 'quran-progress.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}



  return (

    <section className="mt-12 rounded-3xl border-2 border-dashed p-8 text-center" style={{ borderColor: theme?.accent }}>

      <h2 className="text-2xl font-bold mb-4">شارك تقدمك!</h2>

      <p className="mb-6 opacity-70">شجع الآخرين على تعلم القرآن الكريم</p>



      {/* Name Input Section */}

      <div className="mb-6 mx-auto max-w-md">

        {isEditingName ? (

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">

            <div className="relative flex-1 w-full">

              <User size={20} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50" />

              <input

                type="text"

                value={tempName}

                onChange={(e) => setTempName(e.target.value)}

                onKeyDown={(e) => e.key === 'Enter' && saveName()}

                placeholder="أدخل اسمك"

                className="w-full rounded-xl border-2 py-3 pr-10 pl-4 text-right focus:outline-none focus:ring-2"

                style={{ 

                  borderColor: theme?.primary,

                  '--tw-ring-color': theme?.primary 

                }}

                

              />

            </div>

            <div className="flex gap-2">

              <button

                onClick={saveName}

                disabled={!tempName.trim()}

                className="rounded-xl px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"

                style={{ backgroundColor: theme?.primary }}

              >

                حفظ

              </button>

              {name && (

                <button

                  onClick={cancelEdit}

                  className="rounded-xl px-5 py-3 font-semibold border-2 transition hover:bg-slate-50"

                  style={{ borderColor: theme?.primary, color: theme?.primary }}

                >

                  إلغاء

                </button>

              )}

            </div>

          </div>

        ) : (

          <div className="flex items-center justify-center gap-3 flex-wrap">

            <div 

              className="flex items-center gap-2 rounded-xl px-4 py-2 bg-slate-100"

            >

              <User size={18} style={{ color: theme?.primary }} />

              <span className="font-semibold">{name}</span>

            </div>

            <button

              onClick={editName}

              className="text-sm underline opacity-60 hover:opacity-100 transition"

            >

              تعديل

            </button>

            <button

              onClick={deleteName}

              className="text-sm underline text-red-500 opacity-70 hover:opacity-100 transition flex items-center gap-1"

              title="حذف الاسم"

            >

              <Trash2 size={14} />

              حذف

            </button>

          </div>

        )}

      </div>



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

        {name && (

          <p className="text-xl font-bold mb-2">{name}</p>

        )}

        <p className="text-lg opacity-90">تعلمت</p>

        <p className="text-5xl font-bold my-2">{percent}%</p>

        <p className="opacity-90">{completed} من {total} سورة</p>

        {streak > 0 && <p className="mt-2">🔥 {streak} يوم متتالي</p>}

      </div>

    </section>

  )

}