import { m } from "./render.mjs";

const svgTriangle = `<svg width="300" height="220" viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial" font-size="20">
<polygon points="40,30 40,180 250,180" fill="#eef3fb" stroke="#1f3a5f" stroke-width="3"/>
<rect x="40" y="160" width="20" height="20" fill="none" stroke="#1f3a5f" stroke-width="2"/>
<text x="18" y="38" fill="#1f3a5f" font-weight="700">A</text><text x="18" y="198" fill="#1f3a5f" font-weight="700">B</text><text x="256" y="198" fill="#1f3a5f" font-weight="700">C</text>
<text x="2" y="110" fill="#c0392b">9 cm</text><text x="128" y="206" fill="#c0392b">12 cm</text>
</svg>`;

const svgVessel = `<svg width="360" height="260" viewBox="0 0 360 260" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial" font-size="20">
<rect x="70" y="20" width="170" height="220" fill="#cfe6f7" stroke="#1f3a5f" stroke-width="4"/>
<rect x="70" y="20" width="170" height="14" fill="#ffffff"/>
<line x1="70" y1="20" x2="240" y2="20" stroke="#1f3a5f" stroke-width="4" stroke-dasharray="8 6"/>
<circle cx="240" cy="80" r="6" fill="#c0392b"/><text x="252" y="86" fill="#c0392b" font-weight="700">K</text>
<circle cx="240" cy="140" r="6" fill="#c0392b"/><text x="252" y="146" fill="#c0392b" font-weight="700">L</text>
<circle cx="240" cy="200" r="6" fill="#c0392b"/><text x="252" y="206" fill="#c0392b" font-weight="700">M</text>
<line x1="40" y1="20" x2="40" y2="80" stroke="#1f3a5f" stroke-width="2"/><text x="6" y="56" fill="#1f3a5f">h</text>
<line x1="40" y1="20" x2="40" y2="140" stroke="#1f3a5f" stroke-width="2" transform="translate(20,0)"/><text x="52" y="116" fill="#1f3a5f">2h</text>
<line x1="40" y1="20" x2="40" y2="200" stroke="#1f3a5f" stroke-width="2" transform="translate(-10,0)"/><text x="4" y="190" fill="#1f3a5f">3h</text>
</svg>`;

const svgSquare = `<svg width="260" height="200" viewBox="0 0 260 200" xmlns="http://www.w3.org/2000/svg" font-family="Ink Free, Segoe Print, cursive" font-size="24">
<rect x="50" y="20" width="150" height="150" fill="none" stroke="#1d2f6b" stroke-width="3"/>
<line x1="50" y1="170" x2="200" y2="20" stroke="#b3261e" stroke-width="3" stroke-dasharray="7 5"/>
<text x="105" y="195" fill="#1d2f6b">6 cm</text><text x="120" y="100" fill="#b3261e">?</text>
</svg>`;

const punnett = `<table class="punnett"><tr><th></th><th>K</th><th>k</th></tr><tr><th>K</th><td>KK</td><td>Kk</td></tr><tr><th>k</th><td>Kk</td><td>kk</td></tr></table>`;

const opt = (...items) => items;

export const poolQuestions = [
  {
    key: "mat_us",
    author: "mat",
    lesson: "Matematik",
    topic: "Üslü İfadeler",
    correct: 3,
    kind: "card",
    stem: `<p>Aşağıdaki işlemin sonucu kaçtır?</p><p style="text-align:center">${m("\\dfrac{3^5 \\cdot 3^2}{3^4}", true)}</p>`,
    options: opt("9", "18", "27", "81"),
    right: [
      "Tabanlar aynı olduğu için çarpmada üsleri toplarım: 3 üzeri 5 çarpı 3 üzeri 2 eşittir 3 üzeri 7. Bölmede üsleri çıkarırım, 7 eksi 4 eşittir 3, yani 3 üzeri 3 eşittir 27.",
      "Pay kısmında üsler toplanıyor, 5 artı 2 eşittir 7. Paydadaki 3 üzeri 4 ile sadeleştirince geriye 3 üzeri 3 kalıyor, bu da 27 ediyor.",
    ],
    wrong: [
      "Üsleri çarptığımı fark etmedim; 5 çarpı 2 yapıp 10, sonra 4 çıkarıp 6 buldum ve 3 üzeri 6 diye ilerledim. Yanlış kurala göre çözmüşüm.",
      "Önce 3 üzeri 5 ile 3 üzeri 2'yi toplayarak ilerledim, sonra paydaya böldüm. Üslü sayılarda çarpma ile toplamayı karıştırdım.",
    ],
  },
  {
    key: "mat_kok",
    author: "mat",
    lesson: "Matematik",
    topic: "Kareköklü İfadeler",
    correct: 2,
    kind: "card",
    stem: `<p>${m("\\sqrt{48}+\\sqrt{12}")} işleminin sonucu aşağıdakilerden hangisidir?</p>`,
    options: opt(m("5\\sqrt{3}"), m("6\\sqrt{3}"), m("8\\sqrt{3}"), m("2\\sqrt{15}")),
    right: [
      "48'i 16 çarpı 3 olarak yazıp karekökünü aldım, 4 kök 3 buldum. 12'yi 4 çarpı 3 yazınca 2 kök 3 çıktı. Kök içleri aynı olduğu için katsayıları topladım, 6 kök 3.",
      "Kök dışına çıkarma yöntemini kullandım. Kök 48 eşittir 4 kök 3, kök 12 eşittir 2 kök 3. Toplamları 6 kök 3 olur.",
    ],
    wrong: [
      "Kök içlerini toplayıp 48 artı 12 eşittir 60 yaptım, sonra kök 60'ı sadeleştirdim. Farklı kök içlerini toplayamayacağımı bilmeliydim.",
      "48'i 16 çarpı 3 yazdım ama 12'yi sadeleştirmeyi unuttum, bu yüzden katsayıları yanlış topladım.",
    ],
  },
  {
    key: "mat_ucgen",
    author: "mat",
    lesson: "Matematik",
    topic: "Üçgenler",
    correct: 4,
    kind: "card",
    stem: `<p>Şekildeki ABC dik üçgeninde ${m("m(\\widehat{ABC})=90^\\circ")}, ${m("|AB|=9\\ \\text{cm}")} ve ${m("|BC|=12\\ \\text{cm}")} olduğuna göre ${m("|AC|")} kaç santimetredir?</p>`,
    figure: svgTriangle,
    options: opt("13", "14", "16", "15"),
    right: [
      "Dik üçgende Pisagor bağıntısını kullandım: 9 kare artı 12 kare eşittir 81 artı 144, yani 225. Karekökü 15 olduğu için hipotenüs 15 cm.",
      "9-12-15 üçgeni, 3-4-5 üçgeninin 3 katı. Bu yüzden hipotenüs 15 çıkıyor, Pisagor ile de doğruladım.",
    ],
    wrong: [
      "Dik kenarları toplayıp 21 buldum, sonra bir şekilde 16'ya yuvarladım. Pisagor'da kareleri toplamam gerektiğini atlamışım.",
      "Hipotenüsü ortalama gibi düşündüm ve 9 ile 12'nin ortasına yakın bir değer seçtim. Kareleri toplayıp karekök almam gerekiyordu.",
    ],
  },
  {
    key: "mat_esit",
    author: "mat",
    lesson: "Matematik",
    topic: "Eşitsizlikler",
    correct: 1,
    kind: "card",
    hard: true,
    stem: `<p>${m("-3 < 2x-1 \\leq 7")} eşitsizliğini sağlayan x tam sayılarının toplamı kaçtır?</p>`,
    options: opt("10", "9", "6", "14"),
    right: [
      "Her tarafa 1 ekledim: eksi 2 küçük 2x küçük eşit 8. Sonra 2'ye böldüm: eksi 1 küçük x küçük eşit 4. Tam sayılar 0, 1, 2, 3, 4 ve toplamları 10.",
      "Eşitsizliği sadeleştirince eksi 1 küçük x küçük eşit 4 çıktı. Eksi 1 dahil olmadığı için 0'dan başlıyorum, 0 artı 1 artı 2 artı 3 artı 4 eşittir 10.",
    ],
    wrong: [
      "Eksi 1'i de aralığa dahil ettim, çünkü küçük işaretini küçük eşit gibi okudum. Bu yüzden toplamı 9 buldum.",
      "Sağ tarafı 3 olarak hesapladım çünkü 7 eksi 1 işlemini 2'ye bölmeyi karıştırdım; aralık hatalı çıktı.",
    ],
  },
  {
    key: "mat_carpan",
    author: "mat",
    lesson: "Matematik",
    topic: "Çarpanlar ve Katlar",
    correct: 2,
    kind: "card",
    stem: `<p>48 ve 72 sayılarının ortak bölenlerinin sayısı kaçtır?</p>`,
    options: opt("6", "8", "10", "12"),
    right: [
      "Önce OBEB'i buldum: 48 ve 72'nin ortak bölenlerinin en büyüğü 24. Ortak bölenler 24'ün bölenleridir: 1, 2, 3, 4, 6, 8, 12, 24. Toplam 8 tane.",
      "48 eşittir 2 üzeri 4 çarpı 3, 72 eşittir 2 üzeri 3 çarpı 3 üzeri 2. Ortak asal çarpanlar 2 üzeri 3 çarpı 3, bu da 24 eder. 24'ün bölen sayısı 4 çarpı 2, yani 8.",
    ],
    wrong: [
      "Önce 48'in bölenlerini yazdım, 10 tane çıktı. Ortak bölenleri değil sadece 48'in bölenlerini saymışım.",
      "OBEB'i 12 bulup 12'nin bölenlerini saydım, ama OBEB 24 olmalıydı. Çarpanlara ayırırken üs hatası yaptım.",
    ],
  },
  {
    key: "fen_mevsim",
    author: "fen",
    lesson: "Fen Bilimleri",
    topic: "Mevsimlerin Oluşumu",
    correct: 4,
    kind: "card",
    stem: `<p>21 Haziran tarihinde Kuzey Yarım Küre'de gündüz süresi yılın en uzun değerine ulaşır. Buna göre aynı tarihte Güney Yarım Küre için aşağıdakilerden hangisi doğrudur?</p>`,
    options: opt(
      "Yaz mevsimi başlar, gündüz süresi en uzundur.",
      "İlkbahar mevsimi başlar, gece ile gündüz eşittir.",
      "Sonbahar mevsimi başlar, güneş ışınları dik açıyla gelir.",
      "Kış mevsimi başlar, gece süresi yılın en uzun değerindedir.",
    ),
    single: true,
    right: [
      "Dünya'nın eksen eğikliği yüzünden iki yarım kürede mevsimler zıt yaşanır. Kuzeyde yaz başlıyorsa güneyde kış başlar ve o gün güneyde gece en uzundur.",
      "Kuzey Yarım Küre'de gündüz en uzunsa Güney Yarım Küre'de gündüz en kısadır, yani gece en uzundur ve kış başlar.",
    ],
    wrong: [
      "Her iki yarım kürede de aynı mevsim yaşanır diye düşündüm ve yaz seçeneğini işaretledim. Eksen eğikliğinin zıt mevsim oluşturduğunu unutmuşum.",
      "21 Haziran'ı ekinoks günü sandım ve gece gündüz eşit olur dedim. Oysa ekinokslar Mart ve Eylül'de oluyor.",
    ],
  },
  {
    key: "fen_kalitim",
    author: "fen",
    lesson: "Fen Bilimleri",
    topic: "Kalıtım",
    correct: 2,
    kind: "card",
    stem: `<p>Kahverengi göz geni (K), mavi göz geni (k) üzerinde baskındır. Her ikisi de melez kahverengi gözlü (Kk) olan bir anne ve babanın mavi gözlü çocuk sahibi olma olasılığı yüzde kaçtır?</p>`,
    figure: punnett,
    options: opt("0", "25", "50", "75"),
    right: [
      "Punnett karesi çizdim: KK, Kk, Kk ve kk oluşuyor. Mavi göz için çekinik genin ikisinin de bulunması gerekir, yani sadece kk. Dört kutudan biri olduğu için yüzde 25.",
      "Kk çarpı Kk çaprazlamasında olasılıklar 1 KK, 2 Kk, 1 kk şeklinde. Mavi gözlü yalnızca kk olduğundan olasılık 1/4, yani yüzde 25.",
    ],
    wrong: [
      "Kahverengi baskın olduğu için çocukların hepsinin kahverengi olacağını düşündüm ve sıfır dedim. Ama ebeveynler melez, çekinik gen taşıyorlar.",
      "Anne ve babadan her birinin mavi gen taşıma ihtimali yarı yarıya olduğu için yüzde 50 dedim, iki olasılığı çarpmam gerekirdi.",
    ],
  },
  {
    key: "fen_basinc",
    author: "fen",
    lesson: "Fen Bilimleri",
    topic: "Sıvı Basıncı",
    correct: 3,
    kind: "card",
    stem: `<p>Şekildeki kapta durgun su bulunmaktadır. K, L ve M noktalarındaki sıvı basınçları sırasıyla ${m("P_K")}, ${m("P_L")} ve ${m("P_M")} ile gösteriliyor. Buna göre bu basınçların büyüklük ilişkisi nasıldır?</p>`,
    figure: svgVessel,
    options: opt(m("P_K = P_L = P_M"), m("P_K > P_L > P_M"), m("P_M > P_L > P_K"), m("P_L > P_K > P_M")),
    right: [
      "Sıvı basıncı derinliğe bağlıdır, P eşittir h çarpı d çarpı g. Aynı sıvıda derinlik arttıkça basınç artar. M en derindeki nokta olduğu için basıncı en büyük, K en küçük.",
      "Noktaların derinlikleri h, 2h ve 3h. Sıvı yoğunluğu aynı olduğundan basınç derinlikle doğru orantılı artar: M büyük L büyük K.",
    ],
    wrong: [
      "Basıncın kabın tabanındaki sıvı miktarına bağlı olduğunu düşündüm ve hepsini eşit kabul ettim. Oysa basınç derinliğe bağlı.",
      "Yüzeye yakın noktaların daha çok basınç yaptığını sandım. Derinlik arttıkça üstteki sıvı sütunu da arttığı için basınç artıyor.",
    ],
  },
  {
    key: "fen_asit",
    author: "fen",
    lesson: "Fen Bilimleri",
    topic: "Asitler ve Bazlar",
    correct: 1,
    kind: "card",
    stem: `<p>Aşağıdakilerden hangisi asitlerin ortak özelliklerinden biridir?</p>`,
    options: opt(
      "Mavi turnusol kâğıdını kırmızıya çevirir.",
      "Ele kayganlık hissi verir.",
      "pH değeri 7'den büyüktür.",
      "Kırmızı turnusol kâğıdını maviye çevirir.",
    ),
    single: true,
    right: [
      "Asitler mavi turnusolu kırmızıya çevirir. Kayganlık, pH büyüktür 7 ve kırmızı turnusolu maviye çevirme bazların özellikleridir.",
      "Asit çözeltilerinin pH değeri 7'den küçüktür ve mavi turnusol kâğıdını kırmızıya döndürür. Diğer üç seçenek baz özelliği.",
    ],
    wrong: [
      "Ele kayganlık hissi vermesini asit özelliği sandım; sabunun kaygan olduğunu ve sabunun baz olduğunu atlamışım.",
      "pH değerini yanlış yorumladım, 7'den büyük olanın asit olduğunu düşünmüştüm. Aslında 7'den küçük olanlar asit.",
    ],
  },
  {
    key: "tur_deyim",
    author: "tur",
    lesson: "Türkçe",
    topic: "Deyimler ve Atasözleri",
    correct: 2,
    kind: "card",
    stem: `<p>Aşağıdaki cümlelerin hangisinde "çok sevinmek" anlamında bir deyim kullanılmıştır?</p>`,
    options: opt(
      "Ödevini bitirmeden oyuna çıkınca annesinin kaşları çatıldı.",
      "Ali, sınav sonucunu öğrenince havalara uçtu.",
      "Hasta arkadaşını ziyaret edince içi sızladı.",
      "Toplantıda herkes kulak kesilip onu dinledi.",
    ),
    single: true,
    right: [
      "Havalara uçmak, çok sevinmek anlamına gelen bir deyim. Diğerleri sırasıyla kızmak, üzülmek ve dikkatle dinlemek anlamında.",
      "Cümleleri tek tek inceledim: kaşları çatılmak kızgınlık, içi sızlamak üzüntü, kulak kesilmek dikkatle dinlemek. Sevinç anlamı sadece havalara uçmakta var.",
    ],
    wrong: [
      "Kulak kesilmek ifadesini heyecan olarak yorumladım. Oysa bu deyim dikkatle dinlemek anlamına geliyor.",
      "İçi sızlamak ifadesini duygusal bir an gibi görüp sevinçle karıştırdım, ama bu deyim üzülmeyi anlatıyor.",
    ],
  },
  {
    key: "tur_fiilimsi",
    author: "tur",
    lesson: "Türkçe",
    topic: "Fiilimsiler",
    correct: 3,
    kind: "card",
    stem: `<p>Aşağıdaki cümlelerin hangisinde sıfat-fiil (ortaç) kullanılmıştır?</p>`,
    options: opt(
      "Yağmur dinince piknik alanına gittik.",
      "Kitap okumak benim için büyük bir keyifti.",
      "Yırtılmış defteri çöpe attım.",
      "Eve gelirken ekmek aldım.",
    ),
    single: true,
    right: [
      "Yırtılmış sözcüğü fiilden türeyip defteri niteliyor, yani sıfat-fiil. Dinince ve gelirken zarf-fiil, okumak ise isim-fiil.",
      "Fiilimsiyi türüne göre ayırdım: dinince ve gelirken zarf-fiil, okumak isim-fiil, yırtılmış isimleri niteleyen sıfat-fiil.",
    ],
    wrong: [
      "Gelirken sözcüğünü sıfat-fiil sandım, ama bu sözcük eylemin zamanını bildiren bir zarf-fiil.",
      "Okumak sözcüğü bir ismin önüne gelmediği için isim-fiil, ben onu sıfat-fiil sanmışım.",
    ],
  },
  {
    key: "ogr_kosegen",
    author: "zeynep",
    lesson: "Matematik",
    topic: "Kareköklü İfadeler",
    correct: 2,
    kind: "notebook",
    description: "Karenin köşegenini bulurken takıldım. Önce Pisagor ile mi bulmalıydım yoksa köşegen uzunluğu için hazır bir kural var mı? Kök 72'ye ulaşıp sadeleştiremedim.",
    stem: `<p>Bir kenar uzunluğu 6 cm olan karenin köşegen uzunluğu kaç cm'dir?</p>`,
    figure: svgSquare,
    options: opt("6", `6${m("\\sqrt{2}")}`, "12", `6${m("\\sqrt{3}")}`),
    right: [
      "Köşegen, karenin iki kenarıyla bir dik üçgen oluşturur. Pisagor ile 6 kare artı 6 kare eşittir 72, kök 72 de 6 kök 2 eder. Yani köşegen kenar çarpı kök 2.",
      "Karede köşegen kenarın kök 2 katıdır. Kenar 6 olduğu için 6 kök 2 buldum, Pisagor ile de kontrol ettim.",
    ],
    wrong: [
      "Köşegeni iki kenarın toplamı kadar sandım ve 12 işaretledim. Aslında köşegen, bir dik üçgenin hipotenüsü.",
      "Kök 72'yi sadeleştiremediğim için en yakın seçeneği işaretledim. 72 eşittir 36 çarpı 2 olarak ayırmam gerekirdi.",
    ],
  },
  {
    key: "ogr_basinc",
    author: "ahmet",
    lesson: "Fen Bilimleri",
    topic: "Katı Basıncı",
    correct: 3,
    marked: 2,
    kind: "notebook",
    description: "Basınç formülünü uygularken birimleri karıştırdım. Newton ve santimetrekare ile mi çalışmalıyım yoksa metrekareye mi çevirmeliyim, emin olamadım.",
    stem: `<p>Ağırlığı 600 N olan Mert, taban alanı 200 cm² olan tek ayağının üzerinde duruyor. Mert'in yere uyguladığı basınç kaç N/cm²'dir?</p>`,
    options: opt("1", "2", "3", "6"),
    right: [
      "Katı basıncı P eşittir F bölü A. Kuvvet 600 N, alan 200 santimetrekare. 600 bölü 200 eşittir 3 N/cm². Birimi çevirmeye gerek yok, istenen birim zaten N/cm².",
      "Basınç, kuvvetin yüzey alanına bölümü. 600'ü 200'e bölünce 3 buluyorum; soru N/cm² istediği için dönüşüm yapmadım.",
    ],
    wrong: [
      "Alanı ikiye bölmem gerektiğini düşündüm çünkü kişi tek ayak üstünde duruyor. Böyle yapınca 6 çıktı ama alan zaten tek ayağın alanı.",
      "Kuvveti alanla çarptım diye 120000 çıktı, sonra şıklara bakıp en yakınını seçtim. Formül bölme olmalıydı.",
    ],
  },
  {
    key: "ogr_ozne",
    author: "emre",
    lesson: "Türkçe",
    topic: "Cümlenin Ögeleri",
    correct: 2,
    kind: "notebook",
    description: "Gizli özneyi bulmakta zorlanıyorum. Fiilin kişi ekinden mi anlayacağım yoksa cümlede özne olmayan her yerde gizli özne var diye mi düşüneceğim?",
    stem: `<p>Aşağıdaki cümlelerin hangisinde gizli özne vardır?</p>`,
    options: opt("Çocuklar bahçede oynuyor.", "Dün akşam eve geç geldim.", "Annem yemek yaptı.", "Kuşlar ağaçta ötüyor."),
    single: true,
    right: [
      "Gizli özne cümlede açıkça yazılmaz ama fiilin kişi ekinden anlaşılır. Geldim sözcüğündeki im eki benim anlamına geliyor, yani gizli özne ben.",
      "Diğer cümlelerde çocuklar, annem ve kuşlar sözcükleri özne olarak yazılı. Sadece ikinci cümlede özne yok, fiil ekinden ben çıkıyor.",
    ],
    wrong: [
      "Annem yemek yaptı cümlesindeki özneyi yanlış yorumladım, sanırım yüklemden sonra gelen ek yüzünden gizli özne diye düşündüm.",
      "Bahçede sözcüğünü özne sandım. Yer tamlayıcısı olduğunu fark etmeyince yanlış seçeneği işaretledim.",
    ],
  },
  {
    key: "ogr_asal",
    author: "ayse",
    lesson: "Matematik",
    topic: "Çarpanlar ve Katlar",
    correct: 1,
    kind: "notebook",
    description: "36'nın çarpanlarını yazıp hepsini mi toplayacağım, sadece asal olanları mı? Asal çarpan tanımını karıştırdım.",
    stem: `<p>36 sayısının asal çarpanlarının toplamı kaçtır?</p>`,
    options: opt("5", "7", "11", "13"),
    right: [
      "36 eşittir 2 üzeri 2 çarpı 3 üzeri 2. Asal çarpanlar sadece 2 ve 3. Bunların toplamı 5. Üsleri toplama katmadım, çünkü soru farklı asal çarpanları soruyor.",
      "Çarpanlarına ayırınca 2 ve 3 asal çarpan olarak kalıyor. Asal çarpanların toplamı 2 artı 3 eşittir 5.",
    ],
    wrong: [
      "Asal çarpanları 2, 2, 3, 3 olarak yazıp hepsini topladım ve 10 buldum. Yakın olan 11'i işaretledim; tekrar eden çarpanları bir kez saymam gerekiyormuş.",
      "36'nın bütün çarpanlarını saydım ama asal olmayanları da topladım. Asal sayı tanımına bakmalıydım.",
    ],
  },
  {
    key: "ogr_besin",
    author: "zeynep",
    lesson: "Fen Bilimleri",
    topic: "Besin Zinciri ve Enerji Akışı",
    correct: 3,
    kind: "notebook",
    description: "Tüketici düzeylerini saymaya üreticiden mi başlıyoruz yoksa ilk tüketiciden mi? Kurbağanın kaçıncı düzey olduğunu karıştırdım.",
    stem: `<p>Ot, çekirge, kurbağa, yılan ve kartaldan oluşan besin zincirinde kurbağa kaçıncı düzey tüketicidir?</p>`,
    options: opt("Üretici", "1. düzey tüketici", "2. düzey tüketici", "3. düzey tüketici"),
    single: true,
    right: [
      "Ot üretici. Otla beslenen çekirge 1. düzey tüketici, çekirgeyi yiyen kurbağa 2. düzey tüketici. Sayma işlemine tüketicilerden başlıyoruz.",
      "Üretici saymıyor, tüketici düzeyleri çekirgeden başlar. Çekirge 1, kurbağa 2, yılan 3, kartal 4. düzey tüketici.",
    ],
    wrong: [
      "Üreticiyi de 1. düzey saydığım için kurbağayı 3. düzey buldum. Tüketici düzeyi sayımına üretici dahil değil.",
      "Çekirgeyi otçul olduğu için üretici sandım ve kurbağayı 1. düzey yaptım. Otçullar da tüketicidir.",
    ],
  },
];

export const solutionPhoto = {
  mat_esit: {
    title: "Eşitsizlik çözümü",
    lines: [
      `${m("-3 < 2x-1 \\leq 7")}`,
      `Her tarafa 1 ekle: ${m("-2 < 2x \\leq 8")}`,
      `Her tarafı 2'ye böl: ${m("-1 < x \\leq 4")}`,
      `Tam sayılar: ${m("0,1,2,3,4")}`,
      `Toplam: ${m("0+1+2+3+4=10")} <span class="tick">&#10003;</span>`,
    ],
  },
  ogr_kosegen: {
    title: "Kare köşegeni",
    lines: [`${m("d^2 = 6^2 + 6^2 = 72")}`, `${m("d = \\sqrt{72} = 6\\sqrt{2}")}`, `Kural: köşegen = kenar ${m("\\cdot \\sqrt{2}")}`],
  },
  student: {
    title: "Benim çözümüm",
    lines: [`Önce verilenleri yazdım.`, `Sonra formülü uyguladım.`, `Şıklarla karşılaştırdım.`],
  },
};

export const teacherSolutions = {
  mat_esit: "Önce eşitsizliğin her tarafına 1 ekleyelim: $-2 < 2x \\leq 8$. Her tarafı 2'ye bölersek $-1 < x \\leq 4$ olur. Soldaki uç dahil olmadığı için tam sayılar $0, 1, 2, 3, 4$ değerleridir. Toplamları $0+1+2+3+4=10$ bulunur. Doğru cevap A şıkkıdır.",
  ogr_asal: "Asal çarpan, bir sayıyı bölen asal sayılardır. $36 = 2^2 \\cdot 3^2$ olduğundan 36'nın asal çarpanları yalnızca 2 ve 3'tür. Üsler, çarpanın kaç kez tekrarlandığını gösterir; toplama katılmaz. Bu yüzden $2+3=5$ olur.",
};

export const solutionComments = {
  mat_kok: [
    ["zeynep", "Kök 48'i 16 çarpı 3 diye ayırınca her şey kolaylaştı. Tam kare çarpanı aramak gerçekten işe yarıyor."],
    ["ahmet", "Ben 12'yi sadeleştirmeyi atlayıp yanlış yaptım. Senin ayırma yöntemine bakınca anladım, teşekkürler."],
    ["mat", "Doğru yaklaşım. Kök içindeki sayıyı her zaman tam kare bir çarpan ve geri kalanı olarak yazmaya çalışın. Kök içleri eşitlenince katsayıları toplayabilirsiniz."],
    ["zeynep", "Teşekkürler hocam, bunu bir sonraki kareköklü soruda deneyeceğim."],
  ],
  fen_mevsim: [
    ["defne", "Bu soruda eksen eğikliğini hatırlayınca hemen çözdüm. Zıt yarım kürelerde mevsimler de zıt oluyor."],
    ["emre", "Ben kuzey ve güneyde aynı mevsim diye düşünüp yanlış yapmıştım."],
    ["fen", "Güzel not. Mevsimleri belirleyen şey Dünya'nın Güneş'e uzaklığı değil, eksen eğikliği ve Güneş ışınlarının geliş açısıdır. Sınavda bu ayrım sık sorulur."],
  ],
  ogr_kosegen: [
    ["ahmet", "Köşegenin kenar çarpı kök 2 olduğunu ezberlemiştim ama nedenini şimdi anladım, Pisagor'dan geliyor."],
    ["zeynep", "Evet, 6 kare artı 6 kare 72 ediyor. Kök 72'yi 36 çarpı 2 diye ayırınca 6 kök 2 çıkıyor."],
    ["mat", "Zeynep'in anlatımı doğru. Aynı yöntemle bir dikdörtgenin köşegenini de bulabilirsiniz."],
  ],
};

export const likedBy = {
  mat_kok: ["zeynep", "ahmet", "defne", "emre", "ayse"],
  mat_ucgen: ["zeynep", "mehmet", "burak"],
  fen_basinc: ["ahmet", "defne", "ecrin", "zeynep"],
  fen_mevsim: ["defne", "emre", "zeynep"],
  ogr_kosegen: ["ahmet", "emre", "defne", "mehmet", "ayse", "burak"],
  tur_deyim: ["ayse", "ecrin"],
  ogr_besin: ["emre", "defne"],
};

export const extraImages = {
  uploadA: {
    stem: `<p>Ahmet'in cebindeki paranın yarısı 24 TL'dir. Ahmet'in cebindeki paranın üçte biri kaç TL'dir?</p>`,
    options: opt("12", "16", "18", "24"),
  },
  uploadB: {
    stem: `<p>${m("x+\\dfrac{1}{x}=4")} olduğuna göre ${m("x^2+\\dfrac{1}{x^2}")} ifadesinin değeri kaçtır?</p>`,
    options: opt("12", "14", "16", "18"),
  },
};

export const worksheet = {
  title: "8. Sınıf Matematik - Konu Tarama",
  items: [
    { stem: `${m("\\sqrt{50}+\\sqrt{18}")} işleminin sonucu kaçtır?`, options: opt(m("7\\sqrt{2}"), m("8\\sqrt{2}"), m("5\\sqrt{2}"), m("\\sqrt{68}")) },
    { stem: `${m("2^3 \\cdot 2^4")} çarpımı aşağıdakilerden hangisine eşittir?`, options: opt(m("2^7"), m("2^{12}"), m("4^7"), m("2^{1}")) },
    { stem: `${m("(a+4)^2")} ifadesinin açılımı hangisidir?`, options: opt(m("a^2+16"), m("a^2+4a+16"), m("a^2+8a+16"), m("a^2+8a+8")) },
    { stem: `${m("3x-5=16")} denkleminin çözüm kümesi hangisidir?`, options: opt(m("\\{5\\}"), m("\\{7\\}"), m("\\{9\\}"), m("\\{11\\}")) },
    { stem: `Bir zarın atılışında asal sayı gelme olasılığı kaçtır?`, options: opt(m("\\dfrac{1}{3}"), m("\\dfrac{1}{2}"), m("\\dfrac{2}{3}"), m("\\dfrac{1}{6}")) },
    { stem: `${m("x-4 < 3")} eşitsizliğinin çözüm kümesi aşağıdakilerden hangisidir?`, options: opt(m("x<7"), m("x>7"), m("x<-1"), m("x>-1")) },
    { stem: `60 ve 90 sayılarının OBEB değeri kaçtır?`, options: opt("10", "15", "30", "60") },
    { stem: `Bir dik üçgenin dik kenarları 6 cm ve 8 cm ise hipotenüs kaç cm'dir?`, options: opt("9", "10", "12", "14") },
    { stem: `${m("(-2)^3 + 3^2")} işleminin sonucu kaçtır?`, options: opt("1", "-1", "17", "-17") },
    { stem: `Kenar uzunluğu 5 cm olan karenin çevresi kaç cm'dir?`, options: opt("10", "15", "20", "25") },
    { stem: `${m("\\dfrac{x}{3}=\\dfrac{8}{12}")} orantısında x kaçtır?`, options: opt("1", "2", "3", "4") },
    { stem: `Ortalaması 12 olan 5 sayının toplamı kaçtır?`, options: opt("48", "60", "72", "17") },
  ],
};

export const assignments = {
  open: {
    teacher: "mat",
    lesson: "Matematik",
    title: "Cebirsel İfadeler: Haftalık Tekrar",
    description: "Özdeşlikleri kullanarak işlem yapma becerinizi pekiştirin. Her soruyu çözerken adımlarınızı açıklamayı unutmayın. Cuma günü sınıfta tartışacağız.",
    startOffset: 0,
    length: 5,
    questions: [
      { topic: "Cebirsel İfadeler ve Özdeşlikler", text: `${"$(x+3)^2-(x-3)^2$"} ifadesinin eşiti aşağıdakilerden hangisidir?`, options: ["6x", "12x", "18", "$2x^2+18$"], correct: 2 },
      { topic: "Cebirsel İfadeler ve Özdeşlikler", text: "$x^2-9$ ifadesinin çarpanlarına ayrılmış biçimi hangisidir?", options: ["$(x-3)^2$", "$(x+3)^2$", "$(x-3)(x+3)$", "$(x-9)(x+1)$"], correct: 3 },
      { topic: "Cebirsel İfadeler ve Özdeşlikler", text: "$(2a-b)^2$ ifadesinin açılımı aşağıdakilerden hangisidir?", options: ["$4a^2-4ab+b^2$", "$4a^2+b^2$", "$2a^2-4ab+b^2$", "$4a^2-2ab+b^2$"], correct: 1 },
      { topic: "Cebirsel İfadeler ve Özdeşlikler", text: "$x+\\dfrac{1}{x}=4$ olduğuna göre $x^2+\\dfrac{1}{x^2}$ ifadesinin değeri kaçtır?", options: ["12", "14", "16", "18"], correct: 2 },
    ],
  },
  scheduled: {
    teacher: "fen",
    lesson: "Fen Bilimleri",
    title: "Basınç Konu Tekrarı",
    description: "Katı, sıvı ve gaz basıncını karşılaştıran sorulardan oluşan kısa bir çalışma. Formülleri not defterinize yazarak başlayın.",
    startOffset: 2,
    length: 5,
    questions: [
      { topic: "Katı Basıncı", text: "Ağırlığı 120 N olan bir cismin yere temas eden taban alanı 40 cm²'dir. Cismin yere uyguladığı basınç kaç N/cm²'dir?", options: ["2", "3", "4", "5"], correct: 2 },
      { topic: "Sıvı Basıncı", text: "Durgun bir sıvıda derinlik arttıkça sıvı basıncı nasıl değişir?", options: ["Azalır.", "Artar.", "Değişmez.", "Önce artar sonra azalır."], correct: 2 },
      { topic: "Gaz Basıncı", text: "Hacmi değişmeyen kapalı bir kaptaki gazın sıcaklığı artırılırsa gaz basıncı için ne söylenebilir?", options: ["Azalır, çünkü tanecikler yavaşlar.", "Değişmez, çünkü hacim sabittir.", "Artar, çünkü tanecikler kap çeperine daha sık ve daha şiddetli çarpar.", "Önce azalır, sonra sabit kalır."], correct: 3 },
    ],
  },
  closed: {
    teacher: "tur",
    lesson: "Türkçe",
    title: "Paragrafta Anlam: Ana Düşünce",
    description: "Kısa paragrafları dikkatle okuyup ana düşünceyi bulma çalışması. Bu ödev süresi dolduğu için sonuçları inceleyebilirsiniz.",
    startOffset: 0,
    length: 2,
    questions: [
      {
        topic: "Paragrafta Anlam",
        text: "Kitap okumak yalnızca zaman geçirmenin bir yolu değildir. Her yeni sayfa, bize farklı bir yaşamı, farklı bir düşünceyi tanıtır. Okuyan insan, kendi dünyasının sınırlarını genişletir.\n\nBu parçanın ana düşüncesi aşağıdakilerden hangisidir?",
        options: ["Kitaplar boş zamanları değerlendirmek için yazılmıştır.", "Okumak, insanın bakış açısını genişletir.", "Herkesin farklı bir kitap türünü sevmesi doğaldır.", "İyi bir okur olmak için çok zaman ayırmak gerekir."],
        correct: 2,
      },
      {
        topic: "Paragrafta Anlam",
        text: "Su, yeryüzündeki yaşamın temelidir; ama her damlası kıymetli olduğu halde çoğu zaman bunun farkına varmayız. Musluğu açık bırakmak, küçük bir alışkanlık gibi görünse de gün sonunda tonlarca suyun boşa akmasına neden olur.\n\nBu parçada asıl anlatılmak istenen nedir?",
        options: ["Su kaynaklarının hızla azaldığı", "Küçük alışkanlıkların suyun israfına yol açtığı ve bilinçli davranılması gerektiği", "Musluk teknolojisinin geliştiği", "Yaşamın suya bağımlı olmadığı"],
        correct: 2,
      },
      {
        topic: "Paragrafta Anlam",
        text: "Spor yapan öğrencilerin derslerde daha dikkatli olduğu görülmüştür. Düzenli hareket, kan dolaşımını hızlandırır ve beynin daha verimli çalışmasını sağlar.\n\nBu parçadan aşağıdakilerden hangisi çıkarılabilir?",
        options: ["Spor yapmayan öğrenciler başarısızdır.", "Düzenli spor, öğrencinin ders başarısına olumlu katkı sağlayabilir.", "Beyin yalnızca spor sırasında çalışır.", "Dikkat eksikliğinin tek nedeni hareketsizliktir."],
        correct: 2,
      },
    ],
  },
};

export const commentBodies = {
  mat_us: [
    ["ahmet", "Üslü sayılarda çarpma yaparken üslerin toplandığını, bölme yaparken çıkarıldığını sürekli karıştırıyorum. Sizin için kolay bir ezber yolu var mı?"],
    ["mat", "Ezber yerine açılımı düşünün: 3 üzeri 2 eşittir 3 çarpı 3. Çarpınca çarpan sayısı artar, yani üsler toplanır. Bölünce sadeleşen çarpanlar gider, yani üsler çıkarılır."],
    ["ahmet", "Anladım hocam, açılımı yazınca mantıklı oldu. Teşekkür ederim."],
  ],
};
