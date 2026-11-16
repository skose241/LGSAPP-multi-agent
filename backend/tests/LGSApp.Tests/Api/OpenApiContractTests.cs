using System.Text.Json;
using System.Text.Json.Nodes;

namespace LGSApp.Tests.Api;

public class OpenApiContractTests
{
    private static readonly Lazy<JsonObject> Document = new(Load);

    private static JsonObject Load()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "contracts", "openapi.json")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        var text = File.ReadAllText(Path.Combine(directory.FullName, "contracts", "openapi.json"));
        return JsonNode.Parse(text)!.AsObject();
    }

    private static JsonObject Paths => Document.Value["paths"]!.AsObject();

    private static JsonObject Schemas => Document.Value["components"]!["schemas"]!.AsObject();

    private static IEnumerable<(string Method, string Path, JsonObject Operation)> Operations() =>
        Paths.SelectMany(p => p.Value!.AsObject().Select(o => (o.Key, p.Key, o.Value!.AsObject())));

    private static JsonObject Schema(string name) => Schemas[name]!.AsObject();

    private static string[] TypesOf(JsonNode? schema)
    {
        var type = schema?["type"];
        return type switch
        {
            JsonArray array => array.Select(t => t!.GetValue<string>()).ToArray(),
            null => [],
            _ => [type.GetValue<string>()]
        };
    }

    [Fact]
    public void Document_has_the_expected_endpoints()
    {
        Assert.Equal("3.1.1", Document.Value["openapi"]!.GetValue<string>());
        Assert.True(Paths.Count >= 70);
        foreach (var path in new[] { "/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/auth/logout-all", "/api/auth/change-password", "/api/questions/{id}", "/api/files" })
        {
            Assert.True(Paths.ContainsKey(path), path);
        }
    }

    [Fact]
    public void Every_operation_declares_a_success_response_with_a_schema_or_no_content()
    {
        var empty = new List<string>();
        foreach (var (method, path, operation) in Operations())
        {
            var responses = operation["responses"]!.AsObject();
            var successes = responses.Where(r => r.Key.StartsWith('2')).ToList();
            var valid = successes.Count > 0 && successes.All(s =>
                s.Key == "204" || s.Value!["content"]?["application/json"]?["schema"] is not null);
            if (!valid)
            {
                empty.Add($"{method.ToUpperInvariant()} {path}");
            }
        }

        Assert.Empty(empty);
    }

    [Fact]
    public void Error_responses_are_problem_details()
    {
        var wrong = new List<string>();
        foreach (var (method, path, operation) in Operations())
        {
            foreach (var response in operation["responses"]!.AsObject().Where(r => !r.Key.StartsWith('2')))
            {
                var schema = response.Value!["content"]?["application/problem+json"]?["schema"]?["$ref"]?.GetValue<string>();
                var expected = response.Key == "400" ? "HttpValidationProblemDetails" : "ProblemDetails";
                if (schema is null || !schema.EndsWith("/" + expected, StringComparison.Ordinal))
                {
                    wrong.Add($"{method.ToUpperInvariant()} {path} {response.Key}");
                }
            }
        }

        Assert.Empty(wrong);
    }

    [Fact]
    public void Operations_do_not_expose_text_or_plus_json_alternates()
    {
        var text = Document.Value.ToJsonString();

        Assert.DoesNotContain("\"text/plain\"", text);
        Assert.DoesNotContain("\"text/json\"", text);
        Assert.DoesNotContain("\"application/*+json\"", text);
    }

    [Fact]
    public void Enums_are_camel_case_strings()
    {
        var enums = Schemas.Where(s => s.Value!["enum"] is JsonArray).ToList();

        Assert.NotEmpty(enums);
        foreach (var schema in enums)
        {
            Assert.Equal(["string"], TypesOf(schema.Value));
            foreach (var value in schema.Value!["enum"]!.AsArray())
            {
                var text = value!.GetValue<string>();
                Assert.True(char.IsLower(text[0]), $"{schema.Key}: {text}");
                Assert.DoesNotContain('_', text);
            }
        }

        Assert.Contains("closed", Schema("AssignmentEffectiveState")["enum"]!.AsArray().Select(v => v!.GetValue<string>()));
        Assert.Contains("wrongAnswerKey", Schema("ReportReason")["enum"]!.AsArray().Select(v => v!.GetValue<string>()));
    }

    [Fact]
    public void Row_versions_are_base64_strings()
    {
        var found = 0;
        foreach (var schema in Schemas)
        {
            if (schema.Value!["properties"]?["rowVersion"] is { } property)
            {
                found++;
                Assert.Contains("string", TypesOf(property));
                Assert.Equal("byte", property["format"]!.GetValue<string>());
            }
        }

        Assert.True(found > 3);
    }

    [Fact]
    public void Date_only_values_use_the_date_format()
    {
        var properties = Schema("AssignmentManageDetailView")["properties"]!.AsObject();

        Assert.Equal("date", properties["startDate"]!["format"]!.GetValue<string>());
        Assert.Equal("date", properties["endDate"]!["format"]!.GetValue<string>());
        Assert.Equal("date-time", properties["createdAt"]!["format"]!.GetValue<string>());
    }

    [Fact]
    public void Numbers_are_not_declared_as_strings()
    {
        foreach (var schema in Schemas)
        {
            foreach (var property in schema.Value!["properties"]?.AsObject() ?? [])
            {
                var types = TypesOf(property.Value);
                if (types.Contains("integer") || types.Contains("number"))
                {
                    Assert.DoesNotContain("string", types);
                }
            }
        }
    }

    [Fact]
    public void Integer_parameters_carry_no_string_pattern()
    {
        Assert.DoesNotContain("0|[1-9]", Document.Value.ToJsonString());
    }

    [Fact]
    public void Nullable_properties_are_marked_and_required_ones_are_not()
    {
        var properties = Schema("AssignmentManageDetailView")["properties"]!.AsObject();

        Assert.Contains("null", TypesOf(properties["description"]));
        Assert.Contains("null", TypesOf(properties["publishedAt"]));
        Assert.DoesNotContain("null", TypesOf(properties["title"]));
        Assert.DoesNotContain("null", TypesOf(properties["id"]));
    }

    [Fact]
    public void Login_response_carries_the_refresh_token_fields()
    {
        var login = Schema("LoginResponse");
        var required = login["required"]!.AsArray().Select(v => v!.GetValue<string>()).ToList();

        Assert.Contains("token", required);
        Assert.Contains("refreshToken", required);
        Assert.Contains("refreshExpiresAtUtc", required);
        var properties = login["properties"]!;
        Assert.Contains("null", TypesOf(properties["refreshToken"]));
        Assert.Contains("string", TypesOf(properties["refreshToken"]));
        Assert.Contains("null", TypesOf(properties["refreshExpiresAtUtc"]));
        Assert.Equal("date-time", properties["refreshExpiresAtUtc"]!["format"]!.GetValue<string>());
        Assert.DoesNotContain("recoveryCodes", required);
        Assert.Equal("date-time", login["properties"]!["refreshExpiresAtUtc"]!["format"]!.GetValue<string>());
    }

    [Fact]
    public void Problem_schemas_carry_trace_id()
    {
        foreach (var name in new[] { "ProblemDetails", "HttpValidationProblemDetails" })
        {
            var trace = Schema(name)["properties"]!["traceId"];
            Assert.Contains("string", TypesOf(trace));
            Assert.Contains("null", TypesOf(trace));
        }
    }

    [Fact]
    public void Admin_user_creation_documents_conflict_and_location()
    {
        var responses = Paths["/api/admin/users"]!["post"]!["responses"]!.AsObject();

        Assert.True(responses.ContainsKey("409"));
        Assert.NotNull(responses["201"]!["headers"]!["Location"]);
    }

    [Fact]
    public void Every_created_response_defines_a_location_header()
    {
        var missing = Operations()
            .Where(o => o.Operation["responses"]!.AsObject().ContainsKey("201"))
            .Where(o => o.Operation["responses"]!["201"]!["headers"]?["Location"] is null)
            .Select(o => $"{o.Method} {o.Path}")
            .ToList();

        Assert.Empty(missing);
    }

    [Fact]
    public void Conflict_is_not_documented_where_it_cannot_occur()
    {
        foreach (var (path, method) in new[] { ("/api/questions/{id}/like", "put"), ("/api/notifications/read-all", "post"), ("/api/auth/login", "post"), ("/api/admin/settings", "put") })
        {
            Assert.False(Paths[path]![method]!["responses"]!.AsObject().ContainsKey("409"), $"{method} {path}");
        }

        Assert.True(Paths["/api/files/{id}"]!["get"]!["responses"]!.AsObject().ContainsKey("409"));
        Assert.True(Paths["/api/assignments/{id}"]!["patch"]!["responses"]!.AsObject().ContainsKey("409"));
    }

    [Fact]
    public void Student_endpoints_are_documented()
    {
        var pool = Paths["/api/questions"]!["get"]!["responses"]!.AsObject();
        var stats = Paths["/api/me/stats"]!["get"]!["responses"]!.AsObject();
        var settings = Paths["/api/settings/public"]!["get"]!["responses"]!.AsObject();
        var edit = Paths["/api/solutions/{id}"]!["patch"]!["responses"]!.AsObject();

        Assert.True(pool.ContainsKey("200") && pool.ContainsKey("400"));
        Assert.True(stats.ContainsKey("200") && stats.ContainsKey("403"));
        Assert.True(settings.ContainsKey("200"));
        Assert.True(edit.ContainsKey("200") && edit.ContainsKey("404") && edit.ContainsKey("409"));
    }

    [Fact]
    public void Pool_query_parameters_are_typed()
    {
        var parameters = Paths["/api/questions"]!["get"]!["parameters"]!.AsArray().ToDictionary(p => p!["name"]!.GetValue<string>(), p => p!.AsObject());

        foreach (var name in new[] { "lessonId", "topicId", "source", "answered", "since", "includeHidden", "scheduled", "page", "pageSize" })
        {
            Assert.True(parameters.ContainsKey(name), name);
        }

        Assert.Equal("#/components/schemas/QuestionSource", parameters["source"]["schema"]!["$ref"]!.GetValue<string>());
        Assert.Equal(["ai", "student", "teacher"], Schema("QuestionSource")["enum"]!.AsArray().Select(v => v!.GetValue<string>()).Order().ToArray());
    }

    [Fact]
    public void Pool_item_hides_answer_dependent_fields_as_nullable()
    {
        var item = Schema("QuestionPoolItemView")["properties"]!.AsObject();

        Assert.Contains("null", TypesOf(item["correctOption"]));
        Assert.Contains("null", TypesOf(item["commentCount"]));
        Assert.Contains(item["myAnswer"]!["oneOf"]!.AsArray(), v => v!["type"]?.GetValue<string>() == "null");
        Assert.Contains("null", TypesOf(item["isHidden"]));
        Assert.DoesNotContain("null", TypesOf(item["likeCount"]));
    }

    [Fact]
    public void Public_settings_expose_only_the_agreed_keys()
    {
        var keys = Schema("PublicSettingsView")["properties"]!.AsObject().Select(p => p.Key).Order().ToArray();
        string[] expected =
        [
            "aciklamaMinKarakter", "aiCozumAktifMi", "cozumMaxKarakter", "gunlukDosyaLimiti", "gunlukSoruYuklemeLimiti",
            "sikayetMinKarakter", "yorumDuzenlemeDk", "yorumGorunurDerinlik", "yorumMaxDerinlik", "yorumMaxKarakter"
        ];

        Assert.Equal(expected.Order().ToArray(), keys);
    }

    [Fact]
    public void Student_solutions_are_edited_not_deleted()
    {
        var properties = Schema("SolutionView")["properties"]!.AsObject();
        var solution = Paths["/api/solutions/{id}"]!;

        Assert.False(properties.ContainsKey("canDelete"));
        Assert.Equal("boolean", TypesOf(properties["canEdit"]).Single());
        Assert.Contains("null", TypesOf(properties["rowVersion"]));
        Assert.Null(solution["delete"]);
        Assert.True(solution["patch"]!["responses"]!.AsObject().ContainsKey("409"));
        Assert.True(solution["patch"]!["responses"]!.AsObject().ContainsKey("404"));
    }

    [Fact]
    public void Solution_edit_lock_and_report_target_update_time_are_documented()
    {
        var solution = Schema("SolutionView")["properties"]!.AsObject();
        var target = Schema("ReportSolutionTarget")["properties"]!.AsObject();

        Assert.Contains("string", TypesOf(solution["editLockedReason"]));
        Assert.Contains("null", TypesOf(solution["editLockedReason"]));
        Assert.Contains("null", TypesOf(target["updatedAt"]));
        Assert.Equal("date-time", target["updatedAt"]!["format"]!.GetValue<string>());
    }

    [Fact]
    public void Image_views_expose_optional_thumbnail_fields()
    {
        var image = Schema("ImageView");
        var properties = image["properties"]!.AsObject();
        var required = image["required"]!.AsArray().Select(v => v!.GetValue<string>()).ToList();

        Assert.Contains("null", TypesOf(properties["thumbnailUrl"]));
        Assert.Contains("null", TypesOf(properties["thumbnailWidth"]));
        Assert.Contains("null", TypesOf(properties["thumbnailHeight"]));
        Assert.Contains("url", required);

        var file = Schema("FileView")["properties"]!.AsObject();
        Assert.Contains("null", TypesOf(file["thumbnailUrl"]));
    }

    [Fact]
    public void Problem_schemas_exist()
    {
        Assert.True(Schemas.ContainsKey("ProblemDetails"));
        Assert.True(Schemas.ContainsKey("HttpValidationProblemDetails"));
        Assert.NotNull(Schema("HttpValidationProblemDetails")["properties"]!["errors"]);
    }

    [Fact]
    public void Created_and_no_content_behaviors_are_documented()
    {
        var create = Paths["/api/questions"]!["post"]!["responses"]!.AsObject();
        var logout = Paths["/api/auth/logout"]!["post"]!["responses"]!.AsObject();
        var ban = Paths["/api/admin/users/{id}/ban"]!["post"]!["responses"]!.AsObject();
        var upload = Paths["/api/files"]!["post"]!["responses"]!.AsObject();

        Assert.True(create.ContainsKey("201"));
        Assert.True(create.ContainsKey("200") && create.ContainsKey("422"));
        Assert.True(logout.ContainsKey("204"));
        Assert.True(ban.ContainsKey("204"));
        Assert.True(upload.ContainsKey("201") && upload.ContainsKey("200") && upload.ContainsKey("413"));
    }

    [Fact]
    public void File_upload_declares_multipart_body_and_413_problem_details()
    {
        var post = Paths["/api/files"]!["post"]!.AsObject();
        var schema = post["requestBody"]!["content"]!["multipart/form-data"]!["schema"]!.AsObject();
        var properties = schema["properties"]!.AsObject();

        Assert.Equal("binary", properties["file"]!["format"]!.GetValue<string>());
        Assert.NotNull(properties["purpose"]);
        Assert.Equal("uuid", properties["clientUploadId"]!["format"]!.GetValue<string>());
        Assert.NotNull(post["responses"]!["413"]!["content"]!["application/problem+json"]);
    }

    [Fact]
    public void Upload_today_and_client_request_id_are_in_the_contract()
    {
        var uploadToday = Schema("UploadTodayView")["properties"]!.AsObject();
        foreach (var name in new[] { "date", "uploaded", "dailyLimit", "remaining", "pointsPerQuestion", "scoredLimit", "scoredToday", "scoredRemaining" })
        {
            Assert.True(uploadToday.ContainsKey(name), name);
        }

        Assert.True(Schema("StudentStatsView")["properties"]!.AsObject().ContainsKey("uploadToday"));
        Assert.True(Schema("CreateQuestionRequest")["properties"]!.AsObject().ContainsKey("clientRequestId"));
        var detail = Schema("QuestionDetailView")["properties"]!.AsObject();
        Assert.True(detail.ContainsKey("isHidden") && detail.ContainsKey("hiddenAt"));
    }

    [Fact]
    public void Refresh_and_logout_are_anonymous_with_the_documented_responses()
    {
        var refresh = Paths["/api/auth/refresh"]!["post"]!["responses"]!.AsObject();

        Assert.True(refresh.ContainsKey("200"));
        Assert.True(refresh.ContainsKey("401"));
        Assert.True(refresh.ContainsKey("429"));
        Assert.False(Paths["/api/auth/logout"]!["post"]!["responses"]!.AsObject().ContainsKey("401"));
        Assert.True(Paths["/api/auth/logout-all"]!["post"]!["responses"]!.AsObject().ContainsKey("401"));
    }

    [Fact]
    public void Document_is_valid_json_with_no_dangling_schema_references()
    {
        var text = Document.Value.ToJsonString();
        var references = System.Text.RegularExpressions.Regex.Matches(text, "#/components/schemas/([A-Za-z0-9_.]+)")
            .Select(m => m.Groups[1].Value)
            .Distinct()
            .ToList();

        Assert.NotEmpty(references);
        Assert.All(references, name => Assert.True(Schemas.ContainsKey(name), name));
        using var parsed = JsonDocument.Parse(text);
        Assert.Equal(JsonValueKind.Object, parsed.RootElement.ValueKind);
    }
}
