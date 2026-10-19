export default function Footer() {
  // جلب التاريخ الهجري الحالي بتنسيق أم القرى / العربي
  const today = new Date();
  const hijriDate = new Intl.DateTimeFormat('ar-TN-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(today);

  return (
    <footer
      className="border-t px-5 py-6 text-center text-sm opacity-80"
      style={{ borderColor: 'var(--color-border)' }}
    >
        <span>نور القرآن — التعلّم للجميع</span>
      <div className="mb-1 text-xs text-gray-600">
        {hijriDate} ـ
      </div>
      
    </footer>
  );
}