import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col justify-center gap-4 px-safe py-12">
      <h1 className="text-3xl">LGS Hazırlık</h1>
      <p className="text-muted-foreground">Arayüz iskeleti hazır. Giriş ekranları sonraki aşamada eklenecek.</p>
      <Link href="/tasarim" className="font-semibold text-primary underline underline-offset-4">
        Tasarım vitrini
      </Link>
    </main>
  );
}
