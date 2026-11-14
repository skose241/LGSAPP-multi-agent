using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.RefreshTokens;

namespace LGSApp.Tests.Auth;

public class RefreshTokenRulesTests
{
    private static readonly DateTime Now = new(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);
    private static readonly RefreshTokenOptions Options = new();

    [Fact]
    public void Student_family_slides_thirty_days_and_is_capped_at_ninety()
    {
        var lifetime = RefreshTokenRules.NewFamily(false, Now, Options);

        Assert.Equal(Now.AddDays(30), lifetime.ExpiresAt);
        Assert.Equal(Now.AddDays(90), lifetime.FamilyExpiresAt);
    }

    [Fact]
    public void Rotation_slides_the_expiry_forward_but_keeps_the_family_deadline()
    {
        var family = Now.AddDays(90);
        var later = Now.AddDays(40);

        var lifetime = RefreshTokenRules.Rotate(false, later, family, Options);

        Assert.Equal(later.AddDays(30), lifetime.ExpiresAt);
        Assert.Equal(family, lifetime.FamilyExpiresAt);
    }

    [Fact]
    public void Rotation_never_extends_past_the_family_deadline()
    {
        var family = Now.AddDays(90);
        var later = Now.AddDays(80);

        var lifetime = RefreshTokenRules.Rotate(false, later, family, Options);

        Assert.Equal(family, lifetime.ExpiresAt);
        Assert.Equal(family, lifetime.FamilyExpiresAt);
    }

    [Fact]
    public void Mudur_family_is_absolute_twelve_hours_from_login()
    {
        var lifetime = RefreshTokenRules.NewFamily(true, Now, Options);

        Assert.Equal(Now.AddHours(12), lifetime.ExpiresAt);
        Assert.Equal(Now.AddHours(12), lifetime.FamilyExpiresAt);
    }

    [Fact]
    public void Mudur_rotation_does_not_slide()
    {
        var family = Now.AddHours(12);

        var lifetime = RefreshTokenRules.Rotate(true, Now.AddHours(5), family, Options);

        Assert.Equal(family, lifetime.ExpiresAt);
        Assert.Equal(family, lifetime.FamilyExpiresAt);
    }

    [Fact]
    public void Lifetimes_follow_the_configured_options()
    {
        var custom = new RefreshTokenOptions { SlidingDays = 7, FamilyMaxDays = 14, MudurAbsoluteHours = 2 };

        Assert.Equal(Now.AddDays(7), RefreshTokenRules.NewFamily(false, Now, custom).ExpiresAt);
        Assert.Equal(Now.AddDays(14), RefreshTokenRules.NewFamily(false, Now, custom).FamilyExpiresAt);
        Assert.Equal(Now.AddHours(2), RefreshTokenRules.NewFamily(true, Now, custom).ExpiresAt);
    }

    private static RefreshTokenState Active() => new(Now.AddDays(10), Now.AddDays(60), null, null, null);

    [Fact]
    public void Active_token_rotates()
    {
        Assert.Equal(RefreshDecision.Rotate, RefreshTokenRules.Evaluate(Active(), Now, Options));
    }

    [Fact]
    public void Expired_token_is_rejected()
    {
        var state = Active() with { ExpiresAt = Now };

        Assert.Equal(RefreshDecision.Expired, RefreshTokenRules.Evaluate(state, Now, Options));
    }

    [Fact]
    public void Token_past_the_family_deadline_is_rejected()
    {
        var state = Active() with { FamilyExpiresAt = Now.AddSeconds(-1) };

        Assert.Equal(RefreshDecision.Expired, RefreshTokenRules.Evaluate(state, Now, Options));
    }

    [Theory]
    [InlineData(0, RefreshDecision.RotateWithinGrace)]
    [InlineData(29, RefreshDecision.RotateWithinGrace)]
    [InlineData(30, RefreshDecision.RotateWithinGrace)]
    [InlineData(31, RefreshDecision.ReuseDetected)]
    [InlineData(3600, RefreshDecision.ReuseDetected)]
    public void Rotated_token_is_tolerated_only_inside_the_grace_window(int secondsSinceRotation, RefreshDecision expected)
    {
        var state = Active() with
        {
            RevokedAt = Now.AddSeconds(-secondsSinceRotation),
            RevokedReason = RefreshRevokeReasons.Rotated,
            ReplacedByTokenId = 42
        };

        Assert.Equal(expected, RefreshTokenRules.Evaluate(state, Now, Options));
    }

    [Fact]
    public void Zero_grace_turns_every_replay_into_reuse()
    {
        var strict = new RefreshTokenOptions { ReuseGraceSeconds = 0 };
        var state = Active() with
        {
            RevokedAt = Now.AddSeconds(-1),
            RevokedReason = RefreshRevokeReasons.Rotated,
            ReplacedByTokenId = 42
        };

        Assert.Equal(RefreshDecision.ReuseDetected, RefreshTokenRules.Evaluate(state, Now, strict));
    }

    [Fact]
    public void Rotated_token_inside_grace_but_expired_is_rejected_without_reuse_alarm()
    {
        var state = new RefreshTokenState(
            Now.AddSeconds(-5),
            Now.AddDays(60),
            Now.AddSeconds(-10),
            RefreshRevokeReasons.Rotated,
            42);

        Assert.Equal(RefreshDecision.Expired, RefreshTokenRules.Evaluate(state, Now, Options));
    }

    [Theory]
    [InlineData(RefreshRevokeReasons.Logout)]
    [InlineData(RefreshRevokeReasons.LogoutAll)]
    [InlineData(RefreshRevokeReasons.SecurityStamp)]
    [InlineData(RefreshRevokeReasons.Reuse)]
    [InlineData(RefreshRevokeReasons.UserUnavailable)]
    public void Tokens_revoked_for_other_reasons_are_never_tolerated(string reason)
    {
        var state = Active() with { RevokedAt = Now.AddSeconds(-1), RevokedReason = reason, ReplacedByTokenId = 42 };

        Assert.Equal(RefreshDecision.Revoked, RefreshTokenRules.Evaluate(state, Now, Options));
    }

    [Fact]
    public void Rotated_token_without_a_successor_is_not_tolerated()
    {
        var state = Active() with { RevokedAt = Now.AddSeconds(-1), RevokedReason = RefreshRevokeReasons.Rotated };

        Assert.Equal(RefreshDecision.Revoked, RefreshTokenRules.Evaluate(state, Now, Options));
    }

    [Fact]
    public void Generated_tokens_are_256_bit_base64url_and_unique()
    {
        var tokens = Enumerable.Range(0, 50).Select(_ => RefreshTokenRules.GenerateToken()).ToList();

        Assert.Equal(50, tokens.Distinct().Count());
        Assert.All(tokens, token =>
        {
            Assert.Equal(43, token.Length);
            Assert.Matches("^[A-Za-z0-9_-]+$", token);
            var padded = token.Replace('-', '+').Replace('_', '/') + "=";
            Assert.Equal(32, Convert.FromBase64String(padded).Length);
        });
    }

    [Fact]
    public void Token_hash_is_lowercase_sha256_hex_and_deterministic()
    {
        var first = RefreshTokenRules.HashToken("abc");

        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", first);
        Assert.Equal(first, RefreshTokenRules.HashToken("abc"));
        Assert.NotEqual(first, RefreshTokenRules.HashToken("abd"));
    }

    [Fact]
    public void Security_stamp_hash_distinguishes_stamps_and_has_fixed_width()
    {
        var a = RefreshTokenRules.HashSecurityStamp("stamp-a");
        var b = RefreshTokenRules.HashSecurityStamp("stamp-b");

        Assert.NotEqual(a, b);
        Assert.Equal(64, a.Length);
        Assert.Equal(64, RefreshTokenRules.HashSecurityStamp(null).Length);
    }

    [Fact]
    public void Cleanup_cutoff_uses_the_retention_days()
    {
        Assert.Equal(Now.AddDays(-7), RefreshTokenRules.CleanupCutoff(Now, Options));
    }

    [Fact]
    public void Sessions_pending_a_password_change_cannot_hold_a_refresh_token()
    {
        Assert.False(RefreshTokenRules.CanHoldRefreshToken(true));
        Assert.True(RefreshTokenRules.CanHoldRefreshToken(false));
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(1, true)]
    [InlineData(3, true)]
    [InlineData(4, false)]
    [InlineData(8, false)]
    public void Grace_siblings_are_capped_at_the_configured_limit(int live, bool allowed)
    {
        Assert.Equal(allowed, RefreshTokenRules.CanIssueGraceSibling(live, Options));
    }

    [Fact]
    public void Zero_sibling_limit_allows_only_the_single_successor()
    {
        var strict = new RefreshTokenOptions { MaxGraceSiblings = 0 };

        Assert.True(RefreshTokenRules.CanIssueGraceSibling(0, strict));
        Assert.False(RefreshTokenRules.CanIssueGraceSibling(1, strict));
    }

    [Theory]
    [InlineData(-1, 360)]
    [InlineData(11, 360)]
    [InlineData(3, 0)]
    [InlineData(3, 10081)]
    public void Invalid_sibling_and_interval_options_are_rejected(int siblings, int interval)
    {
        Assert.NotNull(RefreshTokenOptions.Validate(new RefreshTokenOptions { MaxGraceSiblings = siblings, CleanupIntervalMinutes = interval }));
    }

    [Fact]
    public void Default_options_are_valid()
    {
        Assert.Null(RefreshTokenOptions.Validate(new RefreshTokenOptions()));
    }

    [Theory]
    [InlineData(0, 90, 12, 30, 7)]
    [InlineData(30, 20, 12, 30, 7)]
    [InlineData(30, 400, 12, 30, 7)]
    [InlineData(30, 90, 0, 30, 7)]
    [InlineData(30, 90, 169, 30, 7)]
    [InlineData(30, 90, 12, -1, 7)]
    [InlineData(30, 90, 12, 301, 7)]
    [InlineData(30, 90, 12, 30, 0)]
    public void Invalid_options_are_rejected(int sliding, int family, int mudurHours, int grace, int retention)
    {
        var options = new RefreshTokenOptions
        {
            SlidingDays = sliding,
            FamilyMaxDays = family,
            MudurAbsoluteHours = mudurHours,
            ReuseGraceSeconds = grace,
            CleanupRetentionDays = retention
        };

        Assert.NotNull(RefreshTokenOptions.Validate(options));
    }
}
