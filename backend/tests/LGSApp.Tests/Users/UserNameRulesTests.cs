using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Configuration;

namespace LGSApp.Tests.Users;

public class UserNameRulesTests
{
    [Theory]
    [InlineData("sistem")]
    [InlineData("Sistem")]
    [InlineData("SİSTEM")]
    [InlineData("sis.tem")]
    public void Sistem_is_a_usable_user_name(string input)
    {
        Assert.True(UserNameRules.IsValid(UserNameRules.Canonicalize(input)));
        Assert.False(UserNameRules.IsReserved(input));
    }

    [Theory]
    [InlineData("yapayzeka")]
    [InlineData("yapay.zeka")]
    [InlineData("Yapay_Zeka")]
    [InlineData("ai")]
    [InlineData("A.I")]
    [InlineData("system")]
    [InlineData("SYSTEM")]
    [InlineData("sys-tem")]
    public void System_account_names_stay_reserved(string input)
    {
        Assert.True(UserNameRules.IsReserved(input));
    }

    [Fact]
    public void Canonical_name_for_sistem_keeps_the_trimmed_input()
    {
        Assert.Equal("sistem", UserNameRules.Canonicalize("  sistem "));
    }

    [Fact]
    public void Seed_admin_names_bind_from_environment_style_configuration()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Seed:AdminUserName"] = "sistem",
                ["Seed:AdminFirstName"] = "Semih",
                ["Seed:AdminLastName"] = "Köse"
            })
            .Build();

        var options = new SeedOptions();
        configuration.GetSection(SeedOptions.SectionName).Bind(options);

        Assert.Equal("sistem", options.AdminUserName);
        Assert.Equal("Semih", options.AdminFirstName);
        Assert.Equal("Köse", options.AdminLastName);
    }
}
