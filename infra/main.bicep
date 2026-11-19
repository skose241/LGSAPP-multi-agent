targetScope = 'resourceGroup'

@description('Kaynakların bulunacağı bölge. Öğrenci aboneliklerinde izin verilen bölgeler kısıtlı olabilir; dağıtım bölge hatası verirse izin verilen bir bölge seçin.')
param location string = 'westeurope'

@description('Kaynak adlarının öneki (3-11 karakter, küçük harf ve rakam). Genel olarak benzersiz adlar için kaynak grubuna bağlı kısa bir son ek eklenir.')
@minLength(3)
@maxLength(11)
param namePrefix string = 'lgsapp'

@description('App Service planı SKU adı. Hem API hem web aynı planda çalışır.')
param appServiceSku string = 'B1'

@description('Azure SQL veritabanı SKU seçimi.')
@allowed([
  'Basic'
  'S0'
  'S1'
  'S2'
])
param sqlSku string = 'Basic'

@description('SQL sunucusu yönetici kullanıcı adı.')
param sqlAdminLogin string = 'lgsadmin'

@description('SQL sunucusu yönetici şifresi. Dosyaya yazılmaz; deploy-infra.ps1 üretir ve yalnızca Key Vault bağlantı dizesine yazılır.')
@secure()
param sqlAdminPassword string

@description('Opsiyonel Microsoft Entra SQL yöneticisi görünen adı veya kullanıcı adı.')
param entraAdminLogin string = ''

@description('Opsiyonel Microsoft Entra SQL yöneticisinin nesne kimliği (object id).')
param entraAdminObjectId string = ''

@description('Dağıtımı yapan kullanıcının nesne kimliği. Verilirse Key Vault üzerinde Key Vault Secrets Officer rolü atanır (sır yazma ve bağlantı dizesi okuma için).')
param deployerObjectId string = ''

@description('API için App Service Linux çalışma zamanı. DOTNETCORE|10.0 değerinin bölgede ve planda desteklendiği dağıtımdan önce doğrulanmalıdır (az webapp list-runtimes --os-type linux).')
param apiRuntime string = 'DOTNETCORE|10.0'

@description('Web için App Service Linux çalışma zamanı.')
param webRuntime string = 'NODE|22-lts'

@description('Log Analytics ve Application Insights kurulsun mu.')
param deployMonitoring bool = false

@description('Log Analytics günlük alım üst sınırı (GB). Dize olarak verilir, ondalık olabilir.')
param logDailyCapGb string = '0.5'

@description('Gemini sağlayıcısı etkin mi. false ise Ai__Provider None olarak ayarlanır.')
param aiEnabled bool = true

@description('İçerik Güvenlik Politikası yalnızca rapor modunda mı çalışsın.')
param cspReportOnly bool = true

@description('Key Vault temizleme koruması. Açıldıktan sonra kapatılamaz ve silinen kasa adı bekleme süresince yeniden kullanılamaz; pepper kaybını önlemek için varsayılan açıktır.')
param enableKeyVaultPurgeProtection bool = true

@description('Tüm kaynaklara eklenecek etiketler.')
param tags object = {
  app: 'lgsapp'
}

var cleanPrefix = toLower(replace(namePrefix, '-', ''))
var suffix = take(uniqueString(resourceGroup().id), 6)
var planName = '${cleanPrefix}-plan-${suffix}'
var apiName = '${cleanPrefix}-api-${suffix}'
var webName = '${cleanPrefix}-web-${suffix}'
var sqlServerName = '${cleanPrefix}-sql-${suffix}'
var sqlDatabaseName = 'LGSApp'
var storageName = take('${cleanPrefix}st${suffix}', 24)
var keyVaultName = take('${cleanPrefix}-kv-${suffix}', 24)
var webOrigin = 'https://${webName}.azurewebsites.net'
var blobOrigin = 'https://${storageName}.blob.${environment().suffixes.storage}'

module monitoring 'modules/monitoring.bicep' = if (deployMonitoring) {
  name: 'monitoring'
  params: {
    location: location
    namePrefix: cleanPrefix
    suffix: suffix
    tags: tags
    dailyCapGb: logDailyCapGb
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    name: storageName
    tags: tags
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    location: location
    serverName: sqlServerName
    databaseName: sqlDatabaseName
    tags: tags
    administratorLogin: sqlAdminLogin
    administratorPassword: sqlAdminPassword
    skuName: sqlSku
    entraAdminLogin: entraAdminLogin
    entraAdminObjectId: entraAdminObjectId
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    name: keyVaultName
    tags: tags
    enablePurgeProtection: enableKeyVaultPurgeProtection
  }
}

module keyVaultSecrets 'modules/keyvault-secrets.bicep' = {
  name: 'keyvault-secrets'
  params: {
    vaultName: keyVault.outputs.name
    storageAccountName: storage.outputs.accountName
    sqlServerFqdn: sql.outputs.serverFqdn
    sqlDatabaseName: sql.outputs.databaseName
    sqlAdminLogin: sqlAdminLogin
    sqlAdminPassword: sqlAdminPassword
  }
}

module plan 'modules/appservice-plan.bicep' = {
  name: 'appservice-plan'
  params: {
    location: location
    name: planName
    tags: tags
    skuName: appServiceSku
  }
}

var vaultUri = keyVault.outputs.vaultUri
var logWorkspaceId = monitoring.?outputs.workspaceId ?? ''
var insightsConnectionString = monitoring.?outputs.appInsightsConnectionString ?? ''

var apiSettings = [
  { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
  { name: 'HttpsRedirection__Enabled', value: 'false' }
  { name: 'Scheduler__Enabled', value: 'true' }
  { name: 'Ai__Provider', value: aiEnabled ? 'Gemini' : 'None' }
  { name: 'Cors__AllowedOrigins__0', value: webOrigin }
  { name: 'Storage__Container', value: 'images' }
  { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
  { name: 'ConnectionStrings__DefaultConnection', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/Sql-ConnectionString)' }
  { name: 'Storage__ConnectionString', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/Storage-ConnectionString)' }
  { name: 'Jwt__Key', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/Jwt-Key)' }
  { name: 'RecoveryCodes__Pepper', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/RecoveryCodes-Pepper)' }
  { name: 'Bff__ProxyKey', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/Bff-ProxyKey)' }
  { name: 'Ai__Gemini__QuestionApiKey', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/Gemini-QuestionApiKey)' }
  { name: 'Ai__Gemini__SolutionApiKey', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/Gemini-SolutionApiKey)' }
]

module api 'modules/webapp.bicep' = {
  name: 'api'
  params: {
    location: location
    name: apiName
    tags: tags
    planId: plan.outputs.id
    linuxFxVersion: apiRuntime
    healthCheckPath: '/health/live'
    appSettings: apiSettings
    logAnalyticsWorkspaceId: logWorkspaceId
  }
}

var webBaseSettings = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'HOSTNAME', value: '0.0.0.0' }
  { name: 'TRUST_PROXY', value: 'true' }
  { name: 'TRUSTED_PROXY_HOPS', value: '1' }
  { name: 'SESSION_COOKIE_SECURE', value: 'true' }
  { name: 'APP_ORIGIN', value: webOrigin }
  { name: 'API_BASE_URL', value: 'https://${api.outputs.defaultHostName}' }
  { name: 'CSP_IMG_HOSTS', value: blobOrigin }
  { name: 'CSP_REPORT_ONLY', value: cspReportOnly ? 'true' : 'false' }
  { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
  { name: 'BFF_PROXY_KEY', value: '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/Bff-ProxyKey)' }
]

var webMonitoringSettings = deployMonitoring ? [
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insightsConnectionString }
  { name: 'ApplicationInsightsAgent_EXTENSION_VERSION', value: '~3' }
] : []

module web 'modules/webapp.bicep' = {
  name: 'web'
  params: {
    location: location
    name: webName
    tags: tags
    planId: plan.outputs.id
    linuxFxVersion: webRuntime
    appCommandLine: 'node apps/web/server.js'
    healthCheckPath: '/healthz'
    appSettings: concat(webBaseSettings, webMonitoringSettings)
    logAnalyticsWorkspaceId: logWorkspaceId
  }
}

module keyVaultRoles 'modules/keyvault-roles.bicep' = {
  name: 'keyvault-roles'
  params: {
    vaultName: keyVault.outputs.name
    secretsUserPrincipalIds: [
      api.outputs.principalId
      web.outputs.principalId
    ]
    deployerPrincipalId: deployerObjectId
  }
}

output apiAppName string = api.outputs.name
output webAppName string = web.outputs.name
output apiUrl string = 'https://${api.outputs.defaultHostName}'
output webUrl string = 'https://${web.outputs.defaultHostName}'
output keyVaultName string = keyVault.outputs.name
output sqlServerName string = sql.outputs.serverName
output sqlServerFqdn string = sql.outputs.serverFqdn
output sqlDatabaseName string = sql.outputs.databaseName
output storageAccountName string = storage.outputs.accountName
