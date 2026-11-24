param vaultName string
param secretsUserPrincipalIds array
param deployerPrincipalId string = ''

var secretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var secretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: vaultName
}

resource userAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in secretsUserPrincipalIds: {
    name: guid(vault.id, principalId, secretsUserRoleId)
    scope: vault
    properties: {
      principalId: principalId
      principalType: 'ServicePrincipal'
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsUserRoleId)
    }
  }
]

resource officerAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(vault.id, deployerPrincipalId, secretsOfficerRoleId)
  scope: vault
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsOfficerRoleId)
  }
}
