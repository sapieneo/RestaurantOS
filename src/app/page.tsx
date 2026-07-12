import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
        RestaurantOS
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Menünün fotoğrafını çek,
        <br />
        <span className="text-brand-600">5 dakikada QR menün yayında.</span>
      </h1>
      <p className="max-w-md text-lg text-stone-600">
        Yapay zeka menünü çıkarır, alerjen ve kalori bilgisini önerir; sen
        onaylarsın. Yönetmeliğe uyumlu, çok dilli, ışık hızında.
      </p>
      <Link
        href="/studyo"
        className="rounded-xl bg-brand-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:bg-brand-700"
      >
        Menünü Ücretsiz Oluştur
      </Link>
      <p className="text-sm text-stone-400">Kayıt gerekmez — önce dene, beğenirsen kaydol.</p>
    </main>
  );
}
