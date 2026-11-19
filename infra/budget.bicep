targetScope = 'subscription'

@description('Aylık bütçe tutarı (abonelik para birimi cinsinden; Öğrenci kredisi için USD).')
param amount int = 100

@description('Bütçe adı.')
param budgetName string = 'lgsapp-monthly'

@description('Uyarı e-postası alacak adresler. Boş bırakılabilir; bu durumda yalnızca contactRoles rolündeki abonelik sahiplerine bildirim gider. Gerçek adresi dağıtım sırasında parametre olarak verin, dosyaya yazmayın.')
param contactEmails array = []

@description('Uyarı e-postası alacak abonelik rolleri.')
param contactRoles array = [
  'Owner'
]

@description('Gerçekleşen harcama uyarı eşikleri (para birimi tutarı olarak).')
param alertAmounts array = [
  50
  80
]

@description('Bütçe başlangıç tarihi (ayın ilk günü, yyyy-MM-dd). Varsayılan: dağıtım ayının ilk günü.')
param startDate string = utcNow('yyyy-MM-01')

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: budgetName
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: startDate
    }
    notifications: toObject(alertAmounts, a => 'actual-${a}', a => {
      enabled: true
      operator: 'GreaterThanOrEqualTo'
      threshold: a * 100 / amount
      thresholdType: 'Actual'
      contactEmails: contactEmails
      contactRoles: contactRoles
    })
  }
}
