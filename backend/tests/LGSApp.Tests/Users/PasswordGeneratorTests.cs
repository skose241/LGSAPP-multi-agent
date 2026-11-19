using LGSApp.Infrastructure.Services;

namespace LGSApp.Tests.Users;

public class PasswordGeneratorTests
{
    [Fact]
    public void First_character_is_always_a_letter_or_digit_and_policy_is_met()
    {
        for (var i = 0; i < 2000; i++)
        {
            var password = PasswordGenerator.Generate();
            Assert.True(char.IsAsciiLetterOrDigit(password[0]), password);
            Assert.DoesNotContain(password[0], "=+-@!#$%*?");
            Assert.Equal(14, password.Length);
            Assert.Contains(password, char.IsAsciiLetterUpper);
            Assert.Contains(password, char.IsAsciiLetterLower);
            Assert.Contains(password, char.IsAsciiDigit);
            Assert.Contains(password, c => "!@#$%*?".Contains(c));
        }
    }

    [Theory]
    [InlineData(4)]
    [InlineData(8)]
    public void Short_lengths_are_raised_to_eight_and_keep_the_rules(int requested)
    {
        for (var i = 0; i < 500; i++)
        {
            var password = PasswordGenerator.Generate(requested);
            Assert.Equal(8, password.Length);
            Assert.True(char.IsAsciiLetterOrDigit(password[0]));
            Assert.Contains(password, char.IsAsciiLetterUpper);
            Assert.Contains(password, char.IsAsciiLetterLower);
            Assert.Contains(password, char.IsAsciiDigit);
            Assert.Contains(password, c => "!@#$%*?".Contains(c));
        }
    }
}
