# LGS App Projesi

- Bu proje LGS sürecindeki öğrencilerin sınava hazırlık sürecini teşviklemek amaçlı tasarlanmıştır. Bir okul tarafından kullanılacak olup dışarıya izole ve sadece sistem hesabının tanımladığı hesaplar tarafından kullanılması planlanmıştır.

## Proje Mimarisi

- Bu projede müdür(sistem)/öğretmen/öğrenci/ai rolleri tanımlıdır.
  - **Öğrenci:** Sisteme soru yükler veya sistemdeki soruları çözer. Her bir soru altında ağaç şemasınca tartışmaya girebilir ve yanlış olduğunu düşündüğü sorular için şikayet etme hakkı vardır.
  - **Öğretmen:** Sisteme ödev yükleyebilir ve bunlara gün kısıtı koyabilir. İleriye yönelik ödev de planlayabilir. Öğrenci profillerini inceleyebilir, hangi dersten kaçar soru çözmüş, verdiği ödevlere ne derece katılmış ve toplam doğru/yanlış durumu ne diye bakabilir. Öğrencilerin şikayet ettiği soruları inceleyebilir ve soruya atanmış doğru cevabı değiştirebilir.
  - **Müdür:** Sisteme kayıt olacak kullanıcı hesabını oluşturabilir. Görev zamanlayıcısının çalışmadığı günlerde manuel olarak soru üretme/soru yayınlama/ödev kapatma modüllerini çalıştırabilir. Şikayet edilen kullanıcıları banlayabilir.
  - **ai:** Her gün belirtilen derslerden belirtilen kadar soru üretecek ve öğrenci tarafından istenen sorularda çözüm yapacaktır.

- Projede günlük görevler vardır.
  - **Günlük Soru Üretimi:** Öğretmenin seçtiği konuya göre her gün 17.30da istenilen kadar soru üretecektir.
  - **Günlük Soru Tamamlama:** Soru üretiminde hata ile karşılaşılan soruları 18.15te tekrardan oluşturacak ve böylece günlük hedef tamamlanmış olacaktır.
  - **Günlük Soru Yayınlama:** Her gün 19.00da ilgili sorular yayına alınacaktır.

## Projenin İşleyişi

- Kayıtlı bir sistem hesabı öncelikle bu projeye katılacak öğretmen ve öğrenciler için ayrı ayrı hesap oluşturacaktır ve sistem tarafından her birine tek seferlik şifre verilecektir. Kullanıcılar o şifre ile giriş yaptıktan sonra şifrelerini sıfırlamaları istenecek ve kendi şifrelerini oluşturacaklardır. Böylece her kullanıcın kendi şifresini unutma ihtimali düşürülecektir. Şifremi unuttum seçeneği ile her kullanıcının kendi şifresini, sonradan değiştirebilme hakkı olacaktır. Buradaki asıl amaç dışarıdan birinin kendisince hesap oluşturup projeyi kullanabilmesinin önüne geçmektir. Tüm hesaplar yalnızca müdür ve sistem tarafından oluşturulup denetlenebilecektir.
- Öğrenciler soruları fotoğraf formatında yükleyecek olup açıklama satırına soruyu çözerken nerede takıldığını anlatmaları istenecektir. Böylece hem kendi hatasını çözümler üzerinden fark edecek hem de öğretmenler tarafından öğrencilerin durumunun takibi yapılacaktır.
- Öğrenciler çözdükleri, soruya metin veya fotoğraf halinde açıklama yapmak zorundadırlar. Böylece soruyu sadece çözmeyi değil anlatmayı da pekiştirebilirler.
- Haftalık ve aylık liderlik tablosu olacak olup öğrencilerin katılımı takip edilecektir.

Yukarıda tanıtımı yapılan proje mevcutta CFML/Lucee/MSSQL ile netpesinde.com adresi üzerinden yayınlanmaktadır. Hedef bu projeyi aşağıda belirtilen teknolojilere göre tekrar revize etmektir.

## Teknoloji Kararları

- **Backend:** ASP.NET Core(C#)
- **Frontend:** React/Next.js
- **Veritabanı:** Azure SQL Database (mevcuttaki MSSQL'den taşınacak)
- **AI Entegrasyonu:** Semantic Kernel üzerinden GEMINI API
- **Mobil:** React Native
- **Barındırma:** Microsoft Azure (Öğrenci Kredisi)

- **Roller:**
  `mudur=1/ogretmen=2/ogrenci=3/ai=4`

## Şimdiki Sorunlar

- Görev zamanlayıcısı "yetkisiz erişim" hatasıyla tetikleme yapmıyor.
- İphone cihazlarda toplu fotoğraf yüklemesi başarısız oluyor.

## Agent Kullanımı

- **Backend(API, Azure SQL, AI Servis) katmanında:** `backend-agent`
- **Frontend(React/Next.js, arayüz) katmanında:** `frontend-agent`
- **Kod sonrası test için:** `reviewer-agent`
- Mimarisi netleşmemiş sorularda öncelikle built-in Plan agent'i kullanılacak

## Oturum Sürekliliği

- Her yeni oturumun başında `.claude/oturum-notlari.md` okunacak ve kaldığımız yerden devam edilecek.
- Kullanıcı oturumu kapatacağını söylediğinde o oturumda yapılanlar, alınan kararlar, açık sorular ve sıradaki adımlar bu dosyaya yeni bir bölüm olarak eklenecek.

## Kod kuralları

- Kod içine açıklama/yorum satırı yazılmayacak.
- Değişiklikler, kod içinde değil ayrıca madde olarak açıklanacak.
