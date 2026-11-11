# Domain Tasarımı (Oturum 4 — 2026-11-11)

Kaynak: Plan agent raporu + kullanıcı kararları. Canlı şema referansı: github.com/skose241/LGSApp `database/LGSApp.sql`, `database/Ayar.sql`, `views/**`.

## Kesinleşen kararlar
- Yorum derinliği: kök + 3 seviye (`yorumMaxDerinlik=3`). Aşan yanıt parent'ın kardeşi olur, `ReplyToUserId` ile "@kullanıcı" bağlamı.
- Yorum düzenleme: yazar, 15 dk içinde (`yorumDuzenlemeDk=15`). Geçmiş tutulmaz; şikayette `TargetSnapshot`.
- Havuz ve ödev cevapları tek `Answers` tablosu (`AssignmentId` nullable). Bir soru en fazla bir ödevde.
- Cevap anahtarı düzeltmesinde puan eksiye düşebilir (kırpma yok, ledger birebir).
- Varsayılan kabul edilenler (kullanıcı itiraz etmedi, gerekirse değişir): tam ban (yorum susturma yok), öğrenciler kullanıcı adı görür (ad soyad yalnız öğretmen/müdür), ödevler tüm öğrencilere, bu oturumda çözüm görseli yüklenmez (sadece `ImageFileId` alanı hazır), yorum oylaması yok, `uretimSikligi` taşınmaz.

## Genel kurallar
- Entity/property/tablo adları İngilizce; rol sabitleri, policy adları, kullanıcı mesajları Türkçe. Ayar anahtarları canlıyla aynı.
- Enum'lar `Domain/Entities` altında ayrı dosya, DB'de `byte` (`HasConversion<byte>()`).
- Zaman damgası `DateTime` UTC `datetime2` default `SYSUTCDATETIME()`. Takvim alanları `DateOnly`/`date` = Europe/Istanbul günü; `TurkeyTime` + `TimeProvider`.
- Konfigürasyonlar `Persistence/Configurations/*Configuration.cs` + `ApplyConfigurationsFromAssembly`.
- Yeni FK'lerin hepsi NoAction/Restrict. Kullanıcı ve soru fiziksel silinmez. Global query filter yok.
- RowVersion: Question, Solution, Comment, Report, Assignment, DailyTopicPlan, GenerationRun.
- Kod içinde yorum satırı yok.

## Şema kayması (canlı kod vs LGSApp.sql)
| Canlıda | Şemada | Yeni karşılık |
|---|---|---|
| `Yorumlar.cozumID` | yok | `Comments.SolutionId` + composite FK `(SolutionId, QuestionId)` |
| `Sorular.cevapSupheli` | yok | `Questions.IsAnswerDisputed`, `AnswerDisputedAt`, `AiSuggestedOption` |
| `DersProgrami` | yok | `GenerationSchedules` |
| ayar `soruCarpani` | yok | Settings seed, 1 |
| `application.aiLimit=5` | sabit | ayar `aiGunlukCozumLimit` |
| ödev `planlandi` | CHECK'te yok | `AssignmentStatus.Scheduled` |
| yorum cozumID soruya ait mi doğrulanmıyor | — | composite FK |

## Entity'ler
- **ApplicationUser (+)**: `BranchLessonId int?` FK Lessons NoAction; `Points int NN def 0` (ledger önbelleği).
- **Lesson**: Id, Name nvarchar(50) UX, Session tinyint (Sozel=1,Sayisal=2) CK, OrderNo, IsActive.
- **Topic**: Id, LessonId FK, Name nvarchar(150), OrderNo, IsActive. UX(LessonId,Name). AK(Id,LessonId).
- **GenerationSchedule**: PK(DayOfWeek,LessonId). DayOfWeek tinyint CK 1..7 ISO; QuestionCount tinyint CK 0..20.
- **Question** (RowVersion): Id, AuthorUserId FK, LessonId FK, TopicId? composite FK (TopicId,LessonId)→Topics(Id,LessonId), Source tinyint (Teacher=2,Student=3,Ai=4) CK, Text nvarchar(max)?, ImageFileId int? FK StoredFiles (UX filtreli not null), OptionA..D nvarchar(500)?, CorrectOption tinyint CK 1..4, Description nvarchar(2000)?, ScheduledPublishDate date?, PublishedAt datetime2?, IsHidden/HiddenAt/HiddenByUserId, IsAnswerDisputed/AnswerDisputedAt/AiSuggestedOption tinyint?, SolutionNotNeeded bit, CorrectOptionChangedAt/CorrectOptionChangedByUserId, GenerationDate date?, GenerationSlot tinyint?, CreatedAt, RowVersion.
  - CK `Text IS NOT NULL OR ImageFileId IS NOT NULL`.
  - CK AI ise GenerationDate+Slot dolu, değilse ikisi boş.
  - UX `(LessonId,GenerationDate,GenerationSlot) WHERE Source=4`.
  - IX `(LessonId,PublishedAt) WHERE IsHidden=0`, `(ScheduledPublishDate) WHERE PublishedAt IS NULL`, `(AuthorUserId,CreatedAt)`, `(IsAnswerDisputed) WHERE IsAnswerDisputed=1`.
  - AK (Id) zaten PK.
- **Answer**: Id, QuestionId FK, UserId FK, AssignmentId?, SelectedOption tinyint CK 1..4, IsCorrect, AnsweredAt. UX(QuestionId,UserId). Composite FK (AssignmentId,QuestionId)→AssignmentQuestions. IX (UserId,AnsweredAt), (AssignmentId,UserId), (QuestionId) INCLUDE(IsCorrect).
- **Solution** (RowVersion): Id, QuestionId, AuthorUserId, Type (Teacher=2,Student=3,Ai=4), AnswerId?, Text nvarchar(max)? (insan için uygulama sınırı `cozumMaxKarakter`=4000), ImageFileId?, IsDeleted, IsHidden, CreatedAt, UpdatedAt?.
  - CK metin veya görsel. CK `(Type=3) = (AnswerId IS NOT NULL)`.
  - UX (QuestionId,Type) WHERE Type IN (2,4) AND IsDeleted=0; UX (QuestionId,AuthorUserId) WHERE Type=3; UX (AnswerId) WHERE AnswerId IS NOT NULL.
  - AK (Id,QuestionId).
  - Öğrenci: metin var ve görsel yoksa `len >= aciklamaMinKarakter`.
- **Comment**: bkz. Yorum ağacı.
- **QuestionLike**: PK(QuestionId,UserId), CreatedAt.
- **Report** (RowVersion): Id, TargetType (Question=1,Comment=2,Solution=3), QuestionId NN, CommentId?, SolutionId?, ReportedUserId, ReporterUserId, Reason (WrongAnswerKey=1,Unreadable,Incomplete,Inappropriate,Spam,Other), Description nvarchar(500) NN (min `sikayetMinKarakter`=10), TargetSnapshot nvarchar(1000)?, Status (Pending=0,Resolved=1,Rejected=2), ActionTaken (None=0,ContentHidden,AnswerKeyChanged,UserBanned), ResolvedByUserId?, ResolvedAt?, ResolutionNote nvarchar(500)?, CreatedAt, RowVersion.
  - CK hedef tutarlılığı (1: ikisi null; 2: CommentId dolu SolutionId null; 3: tersi).
  - UX (ReporterUserId,QuestionId) WHERE TargetType=1; (ReporterUserId,CommentId) WHERE TargetType=2; (ReporterUserId,SolutionId) WHERE TargetType=3.
  - IX (Status,TargetType,CreatedAt), (ReportedUserId,Status).
- **Assignment** (RowVersion): Id, TeacherUserId, LessonId, Title nvarchar(150) NN, Description nvarchar(1000)?, StartDate, EndDate date, Status (Draft=0,Scheduled=1,Published=2,Closed=3), PublishedAt?, ClosedAt?, IsDeleted, CreatedAt, UpdatedAt?. CK EndDate>=StartDate. IX (Status,StartDate), (Status,EndDate), (TeacherUserId,Status). EndDate dahil.
- **AssignmentQuestion**: PK(AssignmentId,QuestionId), UX QuestionId, UX (AssignmentId,OrderNo).
- **DailyTopicPlan** (RowVersion): Id, PlanDate date, LessonId, TopicId composite FK, PlannedByUserId, TargetCount tinyint?, UsedAt?, CreatedAt. UX(PlanDate,LessonId).
- **GenerationRun** (RowVersion): Id, RunDate, Kind (Generate=1,Complete=2,Publish=3,CloseAssignments=4), Trigger (Timer=1,Manual=2), TriggeredByUserId?, Status (Running=0,Succeeded=1,PartiallySucceeded=2,Failed=3), StartedAt, FinishedAt?, LeaseUntil, SucceededCount, FailedCount, Summary nvarchar(1000)?. UX (Kind) WHERE Status=0.
- **GenerationLog**: Id, RunId FK, RunDate, LessonId, TopicId?, Slot tinyint, AttemptNo, Status (Success=1,Failed=2,Skipped=3), ErrorMessage nvarchar(2000)?, QuestionId?, CreatedAt. IX (RunDate,LessonId,Status).
- **AiLog**: Id bigint, UserId?, QuestionId?, Operation (QuestionGeneration=1,Solution,SolutionInvalid,AnswerMismatch), Model nvarchar(50)?, Input/Output nvarchar(max)?, InputTokens?, OutputTokens?, DurationMs?, Success, CreatedAt. IX (UserId,Operation,CreatedAt).
- **Setting**: Key nvarchar(50) PK, Value nvarchar(255), Description nvarchar(200)?, UpdatedAt?, UpdatedByUserId?. HasData: gunlukSoruSayisi=1, puanDogruCevap=5, puanSoruYukleme=3, puanCozumYazma=5, cozumEsikCevapSayisi=5, cozumEsikYanlisOrani=60, aciklamaMinKarakter=30, soruUretimAktifMi=1, soruCarpani=1, aiGunlukCozumLimit=5, yorumMaxKarakter=800, yorumMaxDerinlik=3, yorumDuzenlemeDk=15, yorumSoruBasinaMax=1000, cozumMaxKarakter=4000, sikayetMinKarakter=10. `ISettingsService`, 5 dk IMemoryCache.
- **Notification**: Id bigint, UserId, Type (StudentSolution=1,TeacherSolution,AnswerDisputed,CommentReply,CommentOnQuestion,CommentOnSolution,QuestionsPublished,AssignmentOpened,AssignmentClosed,GenerationReport,ReportResolved,CommentRemoved), Message nvarchar(500), QuestionId?, AssignmentId?, CommentId?, RunId?, IsRead, ReadAt?, CreatedAt. IX (UserId,IsRead,CreatedAt DESC). UX (UserId,Type,RunId) WHERE RunId IS NOT NULL.
- **PointTransaction**: Id bigint, UserId, Amount int, Reason (CorrectAnswer=1,SolutionWritten=2,QuestionUploaded=3,AnswerKeyCorrection=4,ManualAdjustment=5), QuestionId?, AnswerId?, AssignmentId?, LocalDate date, CreatedAt, CreatedByUserId?. UX (AnswerId,Reason) WHERE Reason IN (1,2) AND AnswerId IS NOT NULL; UX (QuestionId,Reason) WHERE Reason=3 AND QuestionId IS NOT NULL. IX (LocalDate) INCLUDE(UserId,Amount). `Users.Points` aynı transaction'da güncellenir, kırpma yok.
- **StoredFile**: Id, Container nvarchar(63), BlobName nvarchar(400) UX, ContentType nvarchar(100), SizeBytes bigint, Width?, Height?, Purpose (QuestionImage=1,SolutionImage,AssignmentImage,Avatar), Status (Pending=0,Ready=1,Deleted=2), UploadedByUserId, CreatedAt, ConfirmedAt?. IX (Status,CreatedAt).

## Yorum ağacı
Model: Adjacency list (ParentId) + RootId + Depth. Bir kapsamın (soru + opsiyonel çözüm) sayfadaki kökleri ve tüm torunları tek sorguyla çekilir, bellekte O(n) ağaç kurulur (`CommentTreeBuilder`, saf sınıf).

**Comments tablosu**: Id, QuestionId NN FK, SolutionId? composite FK (SolutionId,QuestionId)→Solutions(Id,QuestionId), ParentId? composite FK (ParentId,QuestionId)→Comments(Id,QuestionId) NoAction, RootId? FK Comments.Id NoAction (kökte NULL), Depth tinyint, AuthorUserId, ReplyToUserId?, Body nvarchar(800) NN, Status (Active=0,DeletedByAuthor=1,RemovedByModerator=2), ModerationReason nvarchar(300)?, CreatedAt, EditedAt?, EditCount tinyint, DeletedAt?, DeletedByUserId?, RowVersion. AK (Id,QuestionId).
- CK `(ParentId IS NULL AND RootId IS NULL AND Depth=0) OR (ParentId IS NOT NULL AND RootId IS NOT NULL AND Depth BETWEEN 1 AND 10)`.
- IX `(QuestionId,SolutionId,CreatedAt,Id) WHERE ParentId IS NULL`, `(RootId,CreatedAt) WHERE RootId IS NOT NULL`, `(ParentId)`, `(AuthorUserId,CreatedAt)`.

**Kurallar**
1. Derinlik: hedef parent `Depth == MaxDepth` ise yanıt parent'ın parent'ına bağlanır (Depth=MaxDepth), `ReplyToUserId` = hedef yorumun yazarı.
2. Bütünlük: parent aynı soruda olmalı (değilse 404). Yanıtta `SolutionId` istemciden alınmaz, parent'tan kopyalanır. Parent aktif değilse 409 "Yanıtlanan yorum kaldırılmış.". Kökte verilen `solutionId` aynı soruya ait, silinmemiş/gizlenmemiş olmalı.
3. Silme soft. Aktif olmayan düğüm görünür torunu varsa yer tutucu (`status=deleted|removed`, `body=null`, `author=null`), yoksa budanır (aşağıdan yukarı). Moderatör `includeRemoved=true` ile orijinali görür.
4. Düzenleme: yalnız yazar, `CreatedAt + yorumDuzenlemeDk` içinde, Active iken; `EditedAt`, `EditCount++`; `rowVersion` ile 409. Moderatör düzenleyemez, kaldırır.
5. Metin: trim, 1..`yorumMaxKarakter`, sadece boşluk yok, 3'ten fazla ardışık boş satır sadeleşir, düz metin saklanır.
6. Görünürlük (`QuestionAccessService.CanSeeDiscussion`, tek fonksiyon): öğretmen/müdür VEYA soru sahibi VEYA kullanıcının bu soruya Answer kaydı var VEYA soru kapalı bir ödevde. Ön koşul: soru yayında (PublishedAt) ya da ödevi Published/Closed, ve IsHidden=0 (moderatör muaf). Erişim yoksa 403 "Yorumları görmek için önce soruyu cevaplamalısınız.", soru yok/görülemiyorsa 404. `CorrectOption`, `Description`, çözümler aynı kurala bağlı.
7. Ban: security stamp ile JWT 401; ek kontrol yok.
8. Bildirim (aynı transaction): yanıtta parent yazarına (derinlik aşımında ReplyToUserId'ye) CommentReply; kökte soru sahibine CommentOnQuestion, çözüm kapsamında çözüm sahibine CommentOnSolution. Kendine ve AI kullanıcısına gitmez. Aynı alıcı+tür+soru için okunmamış bildirim varsa yeni satır yerine CreatedAt güncellenir. Moderatör kaldırınca yazara CommentRemoved.
9. Rate limit: `comment-write` kullanıcı ID bölümlü token bucket 6/dk. Serviste aynı kullanıcı+soru+metin 60 sn içinde 409; soru başına `yorumSoruBasinaMax`. `UseRateLimiter` `UseAuthentication`/`UseAuthorization` sonrasına taşınır.
10. Eşzamanlılık: düzenleme/silme RowVersion 409.

**API**
| Metot | Yol | Policy |
|---|---|---|
| GET | `/api/questions/{questionId}/comments?solutionId=&sort=oldest\|newest&page=1&pageSize=20&includeRemoved=false` | Kullanici |
| POST | `/api/questions/{questionId}/comments` `{body,parentId?,solutionId?}` → 201 | Kullanici + comment-write |
| PATCH | `/api/comments/{id}` `{body,rowVersion}` → 200 | Kullanici (yazar) |
| DELETE | `/api/comments/{id}` → 204 | Kullanici (yazar) |
| POST | `/api/comments/{id}/remove` `{reason}` → 204 | OgretmenOrMudur |
| POST | `/api/comments/{id}/restore` → 204 | MudurOnly |
| POST | `/api/comments/{id}/reports` `{reason,description}` → 201, kendi yorumu 400, tekrar 409 | Kullanici + report-create |

`sort` yalnız kökleri etkiler; yanıtlar her zaman eskiden yeniye. Sayfalama kök bazlı.

```
CommentThreadDto { questionId, solutionId?, maxDepth, canComment, totalRootCount, totalCount, page, pageSize, items: CommentDto[] }
CommentDto { id, parentId?, depth, solutionId?, status: "active"|"deleted"|"removed", body?, author?: {id,userName,role},
             replyToUserName?, createdAt, editedAt?, isMine, canEdit, canDelete, canModerate, canReport,
             editableUntil?, rowVersion? (yalnız isMine), replyCount, replies: CommentDto[] }
```

## Servis yerleşimi
- Domain: entity, enum, `Constants/SettingKeys.cs`, `Constants/CommentRules.cs`.
- Infrastructure/Services/<Modül>: iş kuralları + transaction; okuma modelleri (record) burada; `ServiceResult<T>` (NotFound, Forbidden, Conflict, Validation).
- Api: request DTO'ları (DataAnnotations, Türkçe mesaj), `ServiceResultExtensions.ToActionResult` → Türkçe ProblemDetails, `ClaimsPrincipalExtensions`.
- Servisler: QuestionAccessService, LessonService, QuestionService, AnswerService, SolutionService, CommentService + CommentTreeBuilder, PointService, NotificationService, ReportService (bu oturumda sadece oluşturma), SettingsService. Sonra: AssignmentService, LeaderboardService, SchedulerService, AiService, FileStorageService.
- Policy: yeni `Kullanici` (mudur/ogretmen/ogrenci + MustChangePassword şartı, AI hariç). Mevcut OgrenciOnly, OgretmenOrMudur, MudurOnly korunur.

## Bu oturumun kapsamı
(a) Tüm entity + konfigürasyon + tek migration `DomainModel` (DB'ye uygulanmaz; `migrations script` ile incelenir).
(b) Uçlar:
- `GET /api/lessons` (konularla), `GET /api/lessons/{id}/topics`.
- `GET /api/questions/{id}`: `correctOption`, `description`, istatistik, `myAnswer` yalnız CanSeeDiscussion ise; `permissions{canAnswer,canSeeDiscussion,canReport,canModerate}` her zaman.
- `POST /api/questions/{id}/answers` (OgrenciOnly + answer-submit): `{selectedOption, solutionText?, solutionImageFileId?}`; tek transaction: Answer + öğrenci Solution + ledger (SolutionWritten, doğruysa CorrectAnswer) + Users.Points + AI dışı soruda sahibine bildirim. Soru satırı `UPDLOCK, ROWLOCK` ile okunur. Yanıt `{isCorrect, correctOption, pointsEarned, solutionId}`. UX ihlali 409. Kendi sorusu / ödev sorusu / yayında olmayan / gizli soru reddedilir. Görsel yalnız Ready ve kullanıcıya ait StoredFile ise.
- `GET /api/questions/{id}/solutions` (CanSeeDiscussion; sıra öğretmen, AI, öğrenciler tarih; `commentCount`).
- `POST /api/questions/{id}/solutions/teacher`, `PATCH /api/solutions/{id}` (OgretmenOrMudur, rowVersion); yanlış cevaplayanlara bildirim.
- Yorum uçlarının tamamı.
- DbSeeder: yalnız Development'ta ders/konu seed'i (Ayar.sql içeriği). Settings HasData ile.

## Zamanlayıcı (sonraki oturum, şema uyumu)
`SchedulerService.RunAsync(kind, runDate, trigger, userId)`; GenerationRun Running satırı + filtreli UX kilit + LeaseUntil devralma. Generate/Complete eksik slotları üretir (UX ile idempotent). Publish ve CloseAssignments doğası gereği idempotent. Bildirim (UserId,Type,RunId) UX.

## Riskler
1. Cevap sızıntısı: soru detayı, çözüm listesi ve yorumlar aynı CanSeeDiscussion fonksiyonunu kullanmalı.
2. RCSI yarışı: cevap transaction'ında soru UPDLOCK ile okunur.
3. Composite FK ve EF: `HasPrincipalKey` ek unique indeks üretir; snapshot kontrol edilmeli.
4. Tarih kayması: İstanbul dönüşümü tek yerde (TurkeyTime).
5. Veri taşıma: ders/konu HasData ile değil, Development seed + taşımada IDENTITY_INSERT.
6. Ledger/önbellek ayrışması: ileride "yeniden hesapla" ucu.

---

## Revizyon 1 (Oturum 4, kullanıcı kararları) — önceki maddelerle çelişirse bu bölüm geçerlidir

### AI sistem hesabı
- AI (rol 4) bir **sistem hesabıdır**, kimse onunla oturum açamaz. Şifresi yoktur (`PasswordHash = null`), `LockoutEnabled = false`, `MustChangePassword = false`, `IsBanned` her zaman false.
- Hesap uygulama başlangıcında (tüm ortamlarda, `Seed:Enabled`'dan bağımsız) idempotent olarak garanti edilir: tek AI kullanıcısı, sabit kullanıcı adı (`yapay.zeka`). Birden fazla AI kullanıcısı oluşturulamaz.
- Login: AI rolündeki hesap için sahte hash doğrulaması yapılır ve olmayan kullanıcıyla birebir aynı 401 döner; başarısız deneme sayacı artmaz, kilitlenme olmaz.
- `forgot-password`: aynı jenerik yanıt, talep oluşturulmaz.
- Admin: AI rolüyle kullanıcı oluşturma, `regenerate-password`, `ban`/`unban`, şifre sıfırlama talebi tamamlama AI hesabı için reddedilir (400 "Yapay zekâ hesabı sistem tarafından yönetilir."). Listede `isSystemAccount=true` ile görünür.
- JWT: `OnTokenValidated` AI rolü taşıyan her token'ı reddeder. AI'ya özel policy (varsa) kaldırılır.
- Zamanlayıcı/AI servisi bu hesabı JWT ile değil, sunucu içinde `AuthorUserId` olarak kullanır (sonraki oturumda API anahtarı / Managed Identity).

### Yorum derinliği: "Devamını göster"
- Kardeşe bağlama kaldırıldı. Yanıtlar gerçek derinliğinde saklanır. Mutlak sınır `CommentRules.AbsoluteMaxDepth = 10` (CK ile aynı); yalnızca bu sınıra ulaşıldığında eski davranış (parent'ın kardeşi + `ReplyToUserId`) devreye girer.
- Yeni ayar `yorumGorunurDerinlik = 3`: liste bir kökün altında en fazla 3 seviye döner. 3. seviyedeki bir düğümün görünür torunu varsa `replies=[]`, `hasMoreReplies=true`, `hiddenReplyCount=N` döner; istemci "Devamını göster (N yanıt)" gösterir.
- `yorumMaxDerinlik` ayarı mutlak sınır anlamına gelir, varsayılan 10, en fazla 10.
- Yeni uç: `GET /api/comments/{id}/thread?includeRemoved=false` → `CommentSubthreadView { questionId, solutionId?, focus: CommentDto, ancestors: CommentAncestorDto[] (kökten parent'a: id, status, author userName, kısaltılmış body), visibleDepth }`. `focus` göreli olarak yine `yorumGorunurDerinlik` seviye açılır, daha derini yine `hasMoreReplies` ile işaretlenir. Erişim kuralı listeyle aynıdır.
- Budama ve yer tutucu kararı tüm alt ağaç üzerinden verilir, kesme (truncate) budamadan sonra yapılır; böylece silinmiş 3. seviye düğümün yalnız derin torunları varsa yer tutucu + "Devamını göster" görünür.
- `replyCount`: alt ağaçtaki toplam görünür düğüm (kesilenler dahil). `hiddenReplyCount`: kesilen görünür düğüm sayısı.
- DB: `(RootId, QuestionId)` → `Comments(Id, QuestionId)` composite FK eklenir.

### Metin normalizasyonu ve Türkçe karakter
- Saklanan gövde: Unicode NFC; kontrol karakterleri temizlenir; bidi kontrol karakterleri (U+202A–U+202E, U+2066–U+2069, U+200E, U+200F, U+061C) ve U+200B, U+2060, U+FEFF temizlenir (U+200C/U+200D emoji dizileri için korunur); satır sonu boşlukları kırpılır, yalnız boşluk içeren satır boş satır sayılır; 3'ten fazla ardışık boş satır 3'e iner.
- Tekrar algılama: `BodyFingerprint` (nvarchar(64), SHA-256 hex) = NFKC + tüm Cf kategorisi karakterler silinmiş + tüm boşluk dizileri tek boşluk + `tr-TR` küçük harf + `ı→i` katlaması. Collation'dan bağımsız. İndeks `(AuthorUserId, QuestionId, BodyFingerprint, CreatedAt)`.
- Kodda kültüre duyarlı string işlemleri (`ToLower()`, `ToUpper()`, `StartsWith(string)` vb.) açık kültürle yazılır.

### UTC
- Tüm `DateTime`/`DateTime?` alanlar DbContext konvansiyonuyla UTC'ye dönüştürülür: yazarken Local → UTC, Unspecified → UTC kabul; okurken `DateTimeKind.Utc`. JSON çıktısı her zaman `Z` ile biter.

### Diğer düzeltmeler
- Sayfalama: offset `long` ile hesaplanır; toplamı aşan sayfa boş liste döner (500 olmaz).
- Yanıt verilirken parent'ın `SolutionId`'si doluysa çözümün kullanılabilir (silinmemiş, moderatör değilse gizli değil) olduğu doğrulanır; değilse 404 "Çözüm bulunamadı.".
- Yorum oluşturma tek transaction içinde, soru satırı `UPDLOCK, ROWLOCK` ile kilitlenerek: tekrar kontrolü ve soru başı sınır yarışsız.
- Yorum id'li uçlar (`PATCH`, `DELETE`, `reports`, `thread`, `remove`, `restore`): aktör moderatör değilse ve soruya `CanSeeDiscussion` erişimi yoksa 404 "Yorum bulunamadı." (varlık sızıntısı yok). Erişimi varsa yazar olmayana 403.
- Moderatör (öğretmen/müdür) şikayet oluşturamaz: 403.
- Bildirim birleştirme: mevcut okunmamış bildirimin `Message`, `CommentId`, `CreatedAt` alanları güncellenir.
- `includeRemoved=true` görünümünde `totalCount` listede dönen düğüm sayısıyla tutarlı: moderatör + includeRemoved ise tüm durumlar sayılır.

### Ödev sorusu görünürlüğü
- Bir soru (silinmemiş) bir ödeve bağlıysa havuzdan görünmez: görünürlük yalnız ödev durumuna bağlıdır (Published/Closed), `PublishedAt` dikkate alınmaz. Taslak/Planlandı ödevdeki soru öğrenciye 404. Moderatör muaf.
- Sonraki oturum (AssignmentService) notu: havuzda cevaplanmış bir soru ödeve eklenemez.

---

## Revizyon 2 (Oturum 4, Revizyon 1 test bulguları) — çelişirse bu bölüm geçerlidir

- **AI token:** `OnTokenValidated`, token'ın `sub` kullanıcısının rollerini her istekte DB'den okur (security stamp kontrolüyle aynı sorguda). Kullanıcı DB'de AI rolündeyse veya token'daki rol claim'i DB'deki rolle eşleşmiyorsa 401. Claim karşılaştırmaları `OrdinalIgnoreCase`. Rol değişikliği security stamp'i yeniler.
- **AI hesabı bütünlüğü:** `yapay.zeka` AI dışı role sahipse, AI rolünde birden fazla kullanıcı varsa veya AI hesabı AI dışı ek rol taşıyorsa uygulama başlangıçta Türkçe hata ile durur. Sistem hesabına benzeyen kullanıcı adları rezervedir: `.`, `_`, `-` silinip küçük harfe çevrildiğinde `yapayzeka`, `ai`, `sistem`, `system` olan adlar ile oluşturma 400.
- **Migration:** `Revision1` 2411ce4'te commit edildi ama hiçbir kalıcı DB'ye uygulanmadı; ayrı migration yerine yeniden üretilir (yeni kimlik `20261111202916_Revision1`). Eski `yorumMaxDerinlik` değeri (≤10) `yorumGorunurDerinlik`'e kopyalanır, `yorumMaxDerinlik` 10 yapılır. `BodyFingerprint` için isimsiz DEFAULT kısıtı kalmaz (adlandırılmış ve modelle uyumlu ya da backfill sonrası kaldırılır).
- **Boş yorum:** Normalize; Cf kategorisindeki tüm karakterleri (ZWJ/ZWNJ hariç, yalnız iki görünür karakter arasında kaldıklarında korunur), U+3164, U+115F, U+1160, U+FFA0, U+2800, U+180E, tag karakterlerini (U+E0000–U+E007F) temizler. Normalizasyon sonrası en az bir harf/rakam/noktalama/sembol (L, N, P, S kategorisi) yoksa 400 "Yorum boş olamaz.".
- **Fingerprint:** `i̇` ve `İ` dizileri `i`'ye katlanır (İ ile eşdeğer).
- **Globalization öz-testi:** Başlangıçta `"ç".Normalize(FormC) == "ç"` ve `tr-TR` kültürü çözümlenebiliyor mu; değilse Türkçe hata ile durur. `InvariantGlobalization` kapalı tutulur.
- **Çözüm kapsamı:** Yorum id'li tüm uçlar (`PATCH`, `DELETE`, `reports`, `thread`, `remove`, `restore`) ve şikayet: yorum bir çözüme bağlıysa çözüm kullanılabilir olmalı (silinmemiş; moderatör değilse gizli değil), değilse 404 "Yorum bulunamadı.".
- **remove/restore:** erişimsiz veya yetkisiz aktör için politika katmanında 403 kalır (rol yetkisi); yetkili rolde var olmayan id 404.
- **Backfill:** başlangıç seed adımları birbirinden bağımsız try/catch ile çalışır; backfill eşzamanlılık çakışmasında satırı atlar; çakışma yarışında kaybeden örnek `fail` değil `warn`/`information` loglar (EF komut hata logu gürültüsü bastırılır veya önce varlık kontrolü yapılır).
- **Kaynak kod:** `CommentRules.cs` içindeki görünmez karakterler `\uXXXX` kaçışlarıyla yazılır. Değişen dosyalar CRLF.
- **Yanıt boyutu:** `yorumGorunurDerinlik` ne olursa olsun bir liste yanıtındaki toplam düğüm sayısı üst sınırlıdır (örn. 500); aşılırsa en derin seviyeler kesilip `hasMoreReplies` ile işaretlenir.
- **404/405 charset:** problem+json yanıtları `charset=utf-8` içerir.
- **Login zamanlaması (var olan kullanıcı + yanlış şifre):** mümkünse `AccessFailedAsync` yazımının maliyeti olmayan kullanıcı yoluna da eşitlenir (sahte yazım veya sabit gecikme); uygulanamazsa gerekçesiyle rapor edilir.
