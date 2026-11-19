export function bffStartupWarnings(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== "production") return [];
  const warnings: string[] = [];

  if (env.BFF_PROXY_KEY?.trim().startsWith("@Microsoft.KeyVault(")) {
    warnings.push(
      "BFF_PROXY_KEY çözülmemiş bir Key Vault referansı olarak görünüyor. Uygulamanın yönetilen kimliğine Key Vault erişimi verin ve referans sözdizimini kontrol edin; aksi halde backend proxy anahtarını doğrulayamaz.",
    );
  } else if (!env.BFF_PROXY_KEY) {
    warnings.push(
      "BFF_PROXY_KEY tanımlı değil. Backend istemci IP'sini BFF üzerinden alamaz, IP bazlı hız sınırları tüm kullanıcılar için tek adres üzerinden çalışır.",
    );
  }

  if (env.TRUST_PROXY !== "true") {
    warnings.push(
      "TRUST_PROXY açık değil. X-Forwarded-For yok sayılıyor ve X-LGS-Client-IP gönderilmiyor, backend yalnızca BFF'nin adresini görür. Uygulama güvenilir bir ters vekilin (örn. Azure App Service) arkasındaysa TRUST_PROXY=true ve gerekirse TRUSTED_PROXY_HOPS ayarlayın.",
    );
  }

  return warnings;
}
