using System.Net;
using LGSApp.Api.Extensions;
using LGSApp.Api.Options;
using Microsoft.AspNetCore.Http;

namespace LGSApp.Tests.Api;

public class BffClientIpTests
{
    private const string Key = "0123456789abcdef0123456789abcdef-proxy";
    private static readonly IPAddress Direct = IPAddress.Parse("10.1.2.3");

    private static async Task<DefaultHttpContext> RunAsync(string? configuredKey, Action<IHeaderDictionary> headers)
    {
        var options = new BffOptions { ProxyKey = configuredKey ?? string.Empty };
        var middleware = new BffClientIpMiddleware(_ => Task.CompletedTask, new BffClientIpResolver(options));
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = Direct;
        headers(context.Request.Headers);
        await middleware.InvokeAsync(context);
        return context;
    }

    [Fact]
    public async Task Correct_key_replaces_the_remote_address()
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = Key;
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });

        Assert.Equal(IPAddress.Parse("203.0.113.9"), context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Wrong_key_is_ignored()
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = Key + "x";
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Key_of_a_different_length_is_ignored()
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = "short";
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Missing_key_header_is_ignored()
    {
        var context = await RunAsync(Key, h => h[BffOptions.ClientIpHeader] = "203.0.113.9");

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Unconfigured_key_ignores_both_headers()
    {
        var context = await RunAsync(null, h =>
        {
            h[BffOptions.ProxyKeyHeader] = Key;
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Empty_presented_key_never_matches()
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = string.Empty;
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Duplicate_key_headers_are_ignored()
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = new Microsoft.Extensions.Primitives.StringValues([Key, Key]);
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Duplicate_ip_headers_are_ignored()
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = Key;
            h[BffOptions.ClientIpHeader] = new Microsoft.Extensions.Primitives.StringValues(["203.0.113.9", "198.51.100.1"]);
        });

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-an-ip")]
    [InlineData("203.0.113.9:4711")]
    [InlineData("203.0.113")]
    [InlineData("1")]
    [InlineData("0.0.0.0")]
    [InlineData("255.255.255.255")]
    [InlineData("::")]
    [InlineData("203.0.113.9, 198.51.100.1")]
    [InlineData("999.1.1.1")]
    public async Task Invalid_ip_keeps_the_original_address(string ip)
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = Key;
            h[BffOptions.ClientIpHeader] = ip;
        });

        Assert.Equal(Direct, context.Connection.RemoteIpAddress);
    }

    [Theory]
    [InlineData("2001:db8::1", "2001:db8::1")]
    [InlineData("2001:DB8:0:0:0:0:0:1", "2001:db8::1")]
    [InlineData("::1", "::1")]
    [InlineData("::ffff:203.0.113.9", "203.0.113.9")]
    [InlineData(" 203.0.113.9 ", "203.0.113.9")]
    public async Task Valid_ipv6_and_mapped_addresses_are_accepted(string ip, string expected)
    {
        var context = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = Key;
            h[BffOptions.ClientIpHeader] = ip;
        });

        Assert.Equal(IPAddress.Parse(expected), context.Connection.RemoteIpAddress);
    }

    [Fact]
    public async Task Both_headers_are_removed_when_the_feature_is_enabled()
    {
        var wrong = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = "wrong-" + Key;
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });
        var correct = await RunAsync(Key, h =>
        {
            h[BffOptions.ProxyKeyHeader] = Key;
            h[BffOptions.ClientIpHeader] = "203.0.113.9";
        });

        foreach (var context in new[] { wrong, correct })
        {
            Assert.False(context.Request.Headers.ContainsKey(BffOptions.ProxyKeyHeader));
            Assert.False(context.Request.Headers.ContainsKey(BffOptions.ClientIpHeader));
        }
    }

    [Fact]
    public async Task Middleware_always_calls_the_next_delegate()
    {
        var called = false;
        var middleware = new BffClientIpMiddleware(_ =>
        {
            called = true;
            return Task.CompletedTask;
        }, new BffClientIpResolver(new BffOptions { ProxyKey = Key }));

        await middleware.InvokeAsync(new DefaultHttpContext());

        Assert.True(called);
    }

    [Fact]
    public void Resolver_is_disabled_without_a_key()
    {
        Assert.False(new BffClientIpResolver(new BffOptions()).Enabled);
        Assert.True(new BffClientIpResolver(new BffOptions { ProxyKey = Key }).Enabled);
    }

    [Fact]
    public void Empty_key_is_valid_and_means_disabled()
    {
        Assert.Null(BffOptions.Validate(new BffOptions()));
    }

    [Fact]
    public void Key_of_thirty_two_characters_is_valid()
    {
        Assert.Null(BffOptions.Validate(new BffOptions { ProxyKey = new string('k', 32) }));
    }

    [Fact]
    public void Short_key_is_invalid()
    {
        Assert.NotNull(BffOptions.Validate(new BffOptions { ProxyKey = new string('k', 31) }));
    }

    [Theory]
    [InlineData("0123456789abcdef 0123456789abcdef")]
    [InlineData("0123456789abcdef0123456789abcdef\t")]
    [InlineData("0123456789abcdef0123456789abcdef\n")]
    public void Key_with_whitespace_is_invalid(string key)
    {
        Assert.NotNull(BffOptions.Validate(new BffOptions { ProxyKey = key }));
    }

    [Fact]
    public void Validation_message_never_contains_the_key()
    {
        var message = BffOptions.Validate(new BffOptions { ProxyKey = "secret value with spaces and more than thirty two characters" });

        Assert.NotNull(message);
        Assert.DoesNotContain("secret", message);
    }
}
