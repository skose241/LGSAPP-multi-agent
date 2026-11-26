param location string
param siteName string
param planId string
param domains array
param certificateNames array
param createCertificates bool
param tags object

resource site 'Microsoft.Web/sites@2023-12-01' existing = {
  name: siteName
}

@batchSize(1)
resource bindings 'Microsoft.Web/sites/hostNameBindings@2023-12-01' = [for domain in domains: {
  parent: site
  name: domain
  properties: {
    siteName: siteName
    hostNameType: 'Verified'
    sslState: 'Disabled'
  }
}]

@batchSize(1)
resource certificates 'Microsoft.Web/certificates@2023-12-01' = [for (domain, i) in domains: if (createCertificates) {
  name: certificateNames[i]
  location: location
  tags: tags
  properties: {
    canonicalName: domain
    serverFarmId: planId
  }
  dependsOn: [
    bindings
  ]
}]

output thumbprints array = [for (domain, i) in domains: createCertificates ? certificates[i]!.properties.thumbprint : '']
