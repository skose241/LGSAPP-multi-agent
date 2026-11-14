"use client";

import { BookOpenCheck, CloudOff, Inbox, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AiSolutionPanel, type AiPanelState } from "@/components/ai-solution-panel";
import { AppShell, studentNav } from "@/components/app-shell";
import {
  accentScale,
  neutralScale,
  primaryScale,
  statusSoftSwatches,
  statusSwatches,
  SwatchGrid,
  SwatchRow,
} from "@/components/design/swatches";
import { EmptyState } from "@/components/empty-state";
import { LeaderboardRow } from "@/components/leaderboard-row";
import { NotificationBadge } from "@/components/notification-badge";
import { QuestionCard } from "@/components/question-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TextAreaField, TextField } from "@/components/ui/field";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-baslik`} className="flex scroll-mt-4 flex-col gap-4">
      <div>
        <h2 id={`${id}-baslik`} className="text-2xl">
          {title}
        </h2>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const aiStates: { state: AiPanelState; caption: string }[] = [
  { state: "none", caption: "none" },
  { state: "loading", caption: "isteniyor" },
  { state: "available", caption: "available" },
  { state: "underReview", caption: "underReview" },
  { state: "removed", caption: "removed" },
  { state: "unavailable", caption: "unavailable" },
  { state: "unreadable", caption: "unreadable" },
];

const typeScale = [
  { cls: "text-4xl", name: "4xl · 48/56", font: "font-display" },
  { cls: "text-3xl", name: "3xl · 36/44", font: "font-display" },
  { cls: "text-2xl", name: "2xl · 28/36", font: "font-display" },
  { cls: "text-xl", name: "xl · 23/30", font: "font-display" },
  { cls: "text-lg", name: "lg · 19/28", font: "font-sans" },
  { cls: "text-base", name: "base · 16/26", font: "font-sans" },
  { cls: "text-sm", name: "sm · 15/24", font: "font-sans" },
  { cls: "text-xs", name: "xs · 13/20", font: "font-sans" },
];

export function Showcase() {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [aiDemo, setAiDemo] = useState<AiPanelState>("none");

  function runLoading() {
    setLoadingDemo(true);
    window.setTimeout(() => setLoadingDemo(false), 1800);
  }

  function requestAi() {
    setAiDemo("loading");
    window.setTimeout(() => setAiDemo("available"), 1800);
  }

  return (
    <main className="mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-safe py-8 pt-safe">
      <header className="flex flex-col gap-3">
        <Badge tone="accent" className="self-start">
          Geliştirme vitrini
        </Badge>
        <h1 className="text-3xl md:text-4xl">LGS Hazırlık Tasarım Sistemi</h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          Sakin, odaklı ve sıcak bir görünüm. Bu sayfa yalnızca geliştirme sırasında kullanılır ve yayında kapalıdır.
        </p>
      </header>

      <Section id="renkler" title="Renk paleti" description="Birincil mavi-mor, sıcak turuncu vurgu ve hafif sıcak nötr ölçek.">
        <SwatchRow label="Birincil · Gece mavisi" swatches={primaryScale} />
        <SwatchRow label="Vurgu · Mercan turuncusu" swatches={accentScale} />
        <SwatchRow label="Nötr · Kâğıt ve mürekkep" swatches={neutralScale} />
        <SwatchGrid label="Durum renkleri" swatches={statusSwatches} />
        <SwatchGrid label="Durum zeminleri" swatches={statusSoftSwatches} />
      </Section>

      <Section id="tipografi" title="Tipografi" description="Başlıklarda Bricolage Grotesque, gövdede Figtree. İkisi de Türkçe karakterleri destekler.">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="font-display text-2xl">ĞÜŞİÖÇ ğüşıöç · İstanbul ışığı, şeker, çağrı</p>
            <p className="text-base">
              Gövde metni: Bir üçgenin iç açıları toplamı 180 derecedir. Dikdörtgenin çevresini bulurken kısa ve uzun
              kenarın toplamını ikiyle çarparız. Işık, ses ve elektrik konularını tekrar etmeyi unutma.
            </p>
            <ul className="flex flex-col gap-2 border-t border-border pt-4">
              {typeScale.map((item) => (
                <li key={item.name} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className={`${item.cls} ${item.font} font-bold`}>Günün sorusu</span>
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Section>

      <Section id="butonlar" title="Butonlar" description="Tüm butonlar en az 44 piksel yüksekliğinde.">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Button>Birincil</Button>
              <Button variant="secondary">İkincil</Button>
              <Button variant="accent">Vurgu</Button>
              <Button variant="ghost">Metin</Button>
              <Button variant="danger">
                <Trash2 aria-hidden="true" />
                Tehlike
              </Button>
              <Button disabled>Devre dışı</Button>
              <Button loading={loadingDemo} onClick={runLoading}>
                {loadingDemo ? "Gönderiliyor" : "Yükleniyor durumunu dene"}
              </Button>
              <Button variant="secondary" size="icon" aria-label="Ekle">
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <Button size="lg" className="w-full md:w-auto md:self-start">
              Büyük birincil buton
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section id="formlar" title="Form alanları" description="Girdi yazısı 16 piksel, böylece iPhone yakınlaştırma yapmaz.">
        <Card>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TextField label="Kullanıcı adı" placeholder="ornek.ogrenci" hint="Müdürün verdiği kullanıcı adı." autoComplete="username" />
            <TextField
              label="Yeni şifre"
              type="password"
              defaultValue="abc"
              required
              error="Şifre en az 8 karakter olmalı."
              autoComplete="new-password"
            />
            <TextAreaField
              className="md:col-span-2 xl:col-span-3"
              label="Nerede takıldın?"
              placeholder="Soruyu çözerken hangi adımda zorlandığını yaz."
              hint="Açıklaman öğretmenlerin seni takip etmesine yardım eder."
            />
            <TextField label="Devre dışı alan" defaultValue="Değiştirilemez" disabled />
          </CardContent>
        </Card>
      </Section>

      <Section id="kartlar" title="Kartlar, rozetler ve bildirim" description="Ders, konu ve durum etiketleri ile bildirim sayacı.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Aktif ödev</CardTitle>
              <CardDescription>Son teslim: 20 Kasım 2026, 23:59</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p>Matematik · Üslü ifadeler konusundan 10 soru çöz.</p>
              <div
                role="progressbar"
                aria-label="Ödev ilerlemesi"
                aria-valuemin={0}
                aria-valuemax={10}
                aria-valuenow={6}
                className="h-2.5 overflow-hidden rounded-pill bg-primary-100"
              >
                <div className="h-full w-3/5 rounded-pill bg-primary" />
              </div>
              <p className="text-sm text-muted-foreground">6 / 10 tamamlandı</p>
            </CardContent>
            <CardFooter>
              <Button className="flex-1">Devam Et</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Rozetler</CardTitle>
              <CardDescription>Durumu renk ve metinle birlikte anlatır.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone="primary">Matematik</Badge>
                <Badge tone="accent">Fen Bilimleri</Badge>
                <Badge tone="neutral">Türkçe</Badge>
                <Badge tone="success">Doğru</Badge>
                <Badge tone="danger">Yanlış</Badge>
                <Badge tone="warning">Şüpheli anahtar</Badge>
                <Badge tone="info">Yeni</Badge>
              </div>
              <div className="flex items-center gap-6">
                <span className="relative inline-flex size-11 items-center justify-center rounded-pill bg-surface-muted font-semibold">
                  Bil
                  <NotificationBadge count={3} className="absolute -right-1 -top-1" />
                </span>
                <span className="relative inline-flex size-11 items-center justify-center rounded-pill bg-surface-muted font-semibold">
                  Yor
                  <NotificationBadge count={128} className="absolute -right-2 -top-1" />
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="soru" title="Soru kartı" description="Cevaplamadan önce, doğru ve yanlış sonuç durumları.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <QuestionCard
            lesson="Matematik"
            topic="Üslü İfadeler"
            author="Elif Y."
            postedAt="14 Kasım 2026"
            description="3. adımda işaretleri karıştırdım. Paydayı eşitledikten sonra ne yapacağımı bulamadım."
            correct="B"
          />
          <QuestionCard
            lesson="Fen Bilimleri"
            topic="Basınç"
            author="Mert K."
            postedAt="13 Kasım 2026"
            description="Sıvı basıncı formülünde derinliği mi yoksa yüksekliği mi kullanacağımı karıştırdım."
            initialAnswer="C"
            correct="C"
            startRevealed
          />
          <QuestionCard
            lesson="Türkçe"
            topic="Paragraf"
            author="Zeynep Ş."
            postedAt="12 Kasım 2026"
            description="Ana düşünceyi bulmakta zorlandım, iki şık arasında kaldım."
            initialAnswer="A"
            correct="D"
            startRevealed
          />
        </div>
      </Section>

      <Section id="ai" title="Yapay zekâ çözüm paneli" description="Sunucudan gelen aiSolutionState değerlerine göre. Bilinmeyen değer none gibi davranır.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {aiStates.map(({ state, caption }) => (
            <div key={state} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{caption}</p>
              <AiSolutionPanel
                state={state}
                quotaLeft={state === "none" ? 2 : undefined}
                solution={
                  <ol className="list-decimal space-y-1 pl-5 text-base">
                    <li>Önce her iki tarafı da ortak paydada yaz.</li>
                    <li>Payları birbirinden çıkar ve sadeleştir.</li>
                    <li>Sonuç 2/3 olur, doğru cevap B şıkkıdır.</li>
                  </ol>
                }
              />
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">etkileşimli deneme</p>
            <AiSolutionPanel
              state={aiDemo}
              quotaLeft={2}
              onRequest={requestAi}
              solution={<p className="text-base">Çözüm hazır. Adımları kendi çözümünle karşılaştır.</p>}
            />
            {aiDemo === "available" ? (
              <Button variant="ghost" className="self-start" onClick={() => setAiDemo("none")}>
                Sıfırla
              </Button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section id="liderlik" title="Liderlik tablosu" description="Haftalık sıralama satırları. Mevcut kullanıcı vurgulanır.">
        <ol className="grid gap-2 lg:grid-cols-2" aria-label="Haftalık liderlik">
          <LeaderboardRow rank={1} name="Elif Yılmaz" detail="7 günlük seri" points={248} />
          <LeaderboardRow rank={2} name="Çağan Öztürk" detail="5 günlük seri" points={231} />
          <LeaderboardRow rank={3} name="İrem Şahin" detail="4 günlük seri" points={219} />
          <LeaderboardRow rank={4} name="Ahmet Kaya" detail="2 günlük seri" points={187} isMe />
          <LeaderboardRow rank={5} name="Ğaliye Uçar" detail="1 günlük seri" points={150} />
        </ol>
      </Section>

      <Section id="bos" title="Boş durum ve bildirimler" description="Veri yokken yol gösterir; toast sonucu kısaca bildirir.">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={Inbox}
            title="Henüz ödevin yok"
            description="Öğretmenin bir ödev verdiğinde burada görünecek. Bu arada havuzdan soru çözebilirsin."
            action={
              <Button variant="secondary">
                <BookOpenCheck aria-hidden="true" />
                Soru Çöz
              </Button>
            }
          />
          <EmptyState
            icon={CloudOff}
            title="Bağlantı kurulamadı"
            description="İnternet bağlantını kontrol edip tekrar dene. Yazdıkların kaybolmadı."
            action={<Button>Tekrar Dene</Button>}
          />
        </div>
        <Card>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => toast.success("Cevabın kaydedildi.")}>
              Başarı toast
            </Button>
            <Button variant="secondary" onClick={() => toast.error("Kayıt başarısız. Lütfen tekrar dene.")}>
              Hata toast
            </Button>
            <Button variant="secondary" onClick={() => toast("Yeni bir ödev atandı.", { description: "Matematik · Çarpanlar" })}>
              Bilgi toast
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section id="kabuk" title="Uygulama kabuğu" description="Mobilde alt sekme çubuğu, 1024 piksel ve üzerinde yan menü. Tarayıcı genişliğine göre değişir.">
        <div className="overflow-hidden rounded-lg border border-border shadow-md">
          <AppShell
            items={studentNav}
            activeId="pano"
            userName="Ahmet Kaya"
            roleLabel="Öğrenci"
            notificationCount={3}
            contained
          >
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl">Merhaba Ahmet</h2>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
                <div className="flex flex-col gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Bugünkü hedefin</CardTitle>
                      <CardDescription>5 sorudan 3 tanesini çözdün.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        role="progressbar"
                        aria-label="Günlük hedef"
                        aria-valuemin={0}
                        aria-valuemax={5}
                        aria-valuenow={3}
                        className="h-2.5 overflow-hidden rounded-pill bg-primary-100"
                      >
                        <div className="h-full w-3/5 rounded-pill bg-primary" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Aktif ödevler</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 xl:grid-cols-2">
                      <div className="rounded-md border border-border p-3">
                        <Badge tone="primary">Matematik</Badge>
                        <p className="pt-2 font-semibold">Üslü ifadeler</p>
                        <p className="text-sm text-muted-foreground">6 / 10 tamamlandı</p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <Badge tone="accent">Fen Bilimleri</Badge>
                        <p className="pt-2 font-semibold">Basınç</p>
                        <p className="text-sm text-muted-foreground">Son gün: 20 Kasım</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="flex flex-col gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Bu haftanın sıralaması</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="flex flex-col gap-2" aria-label="Kabuk içi liderlik">
                        <LeaderboardRow rank={1} name="Elif Yılmaz" detail="7 günlük seri" points={248} />
                        <LeaderboardRow rank={4} name="Ahmet Kaya" detail="2 günlük seri" points={187} isMe />
                      </ol>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Bildirimler</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <p>Yeni ödev atandı: Matematik · Çarpanlar</p>
                      <p>Şikâyet ettiğin soru öğretmen tarafından incelendi.</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </AppShell>
        </div>
      </Section>
    </main>
  );
}
