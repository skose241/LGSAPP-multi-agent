param siteName string
param domains array
param certificateNames array
param useExistingCertificates bool
param createdThumbprints array

resource site 'Microsoft.Web/sites@2023-12-01' existing = {
  name: siteName
}

resource existingCertificates 'Microsoft.Web/certificates@2023-12-01' existing = [for (domain, i) in domains: if (useExistingCertificates) {
  name: certificateNames[i]
}]

@batchSize(1)
resource bindings 'Microsoft.Web/sites/hostNameBindings@2023-12-01' = [for (domain, i) in domains: {
  parent: site
  name: domain
  properties: {
    siteName: siteName
    hostNameType: 'Verified'
    sslState: 'SniEnabled'
    thumbprint: useExistingCertificates ? existingCertificates[i]!.properties.thumbprint : createdThumbprints[i]
  }
}]
