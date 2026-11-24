param location string
param serverName string
param databaseName string
param tags object
param administratorLogin string
@secure()
param administratorPassword string
param skuName string
param entraAdminLogin string = ''
param entraAdminObjectId string = ''
param entraAdminTenantId string = tenant().tenantId

var skuMap = {
  Basic: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
    maxSizeBytes: 2147483648
  }
  S0: {
    name: 'S0'
    tier: 'Standard'
    capacity: 10
    maxSizeBytes: 268435456000
  }
  S1: {
    name: 'S1'
    tier: 'Standard'
    capacity: 20
    maxSizeBytes: 268435456000
  }
  S2: {
    name: 'S2'
    tier: 'Standard'
    capacity: 50
    maxSizeBytes: 268435456000
  }
}
var sku = skuMap[skuName]
var useEntraAdmin = !empty(entraAdminLogin) && !empty(entraAdminObjectId)

resource server 'Microsoft.Sql/servers@2023-08-01' = {
  name: serverName
  location: location
  tags: tags
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    version: '12.0'
  }
}

resource entraAdmin 'Microsoft.Sql/servers/administrators@2023-08-01' = if (useEntraAdmin) {
  parent: server
  name: 'ActiveDirectory'
  properties: {
    administratorType: 'ActiveDirectory'
    login: entraAdminLogin
    sid: entraAdminObjectId
    tenantId: entraAdminTenantId
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: server
  name: databaseName
  location: location
  tags: tags
  sku: {
    name: sku.name
    tier: sku.tier
    capacity: sku.capacity
  }
  properties: {
    collation: 'Turkish_CI_AS'
    maxSizeBytes: sku.maxSizeBytes
  }
}

resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01' = {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output serverName string = server.name
output serverFqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
