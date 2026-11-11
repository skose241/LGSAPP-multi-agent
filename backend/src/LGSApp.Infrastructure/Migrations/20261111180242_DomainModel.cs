using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DomainModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BranchLessonId",
                table: "AspNetUsers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Points",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "GenerationRuns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RunDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<byte>(type: "tinyint", nullable: false),
                    Trigger = table.Column<byte>(type: "tinyint", nullable: false),
                    TriggeredByUserId = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    FinishedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LeaseUntil = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SucceededCount = table.Column<int>(type: "int", nullable: false),
                    FailedCount = table.Column<int>(type: "int", nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GenerationRuns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GenerationRuns_AspNetUsers_TriggeredByUserId",
                        column: x => x.TriggeredByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Lessons",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Session = table.Column<byte>(type: "tinyint", nullable: false),
                    OrderNo = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Lessons", x => x.Id);
                    table.CheckConstraint("CK_Lessons_Session", "[Session] IN (1, 2)");
                });

            migrationBuilder.CreateTable(
                name: "Settings",
                columns: table => new
                {
                    Key = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Value = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedByUserId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Key);
                    table.ForeignKey(
                        name: "FK_Settings_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StoredFiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Container = table.Column<string>(type: "nvarchar(63)", maxLength: 63, nullable: false),
                    BlobName = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Width = table.Column<int>(type: "int", nullable: true),
                    Height = table.Column<int>(type: "int", nullable: true),
                    Purpose = table.Column<byte>(type: "tinyint", nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    UploadedByUserId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    ConfirmedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoredFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StoredFiles_AspNetUsers_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Assignments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TeacherUserId = table.Column<int>(type: "int", nullable: false),
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assignments", x => x.Id);
                    table.CheckConstraint("CK_Assignments_Dates", "[EndDate] >= [StartDate]");
                    table.CheckConstraint("CK_Assignments_Status", "[Status] BETWEEN 0 AND 3");
                    table.ForeignKey(
                        name: "FK_Assignments_AspNetUsers_TeacherUserId",
                        column: x => x.TeacherUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Assignments_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GenerationSchedules",
                columns: table => new
                {
                    DayOfWeek = table.Column<byte>(type: "tinyint", nullable: false),
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    QuestionCount = table.Column<byte>(type: "tinyint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GenerationSchedules", x => new { x.DayOfWeek, x.LessonId });
                    table.CheckConstraint("CK_GenerationSchedules_DayOfWeek", "[DayOfWeek] BETWEEN 1 AND 7");
                    table.CheckConstraint("CK_GenerationSchedules_QuestionCount", "[QuestionCount] BETWEEN 0 AND 20");
                    table.ForeignKey(
                        name: "FK_GenerationSchedules_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Topics",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    OrderNo = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Topics", x => x.Id);
                    table.UniqueConstraint("AK_Topics_Id_LessonId", x => new { x.Id, x.LessonId });
                    table.ForeignKey(
                        name: "FK_Topics_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DailyTopicPlans",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PlanDate = table.Column<DateOnly>(type: "date", nullable: false),
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    TopicId = table.Column<int>(type: "int", nullable: false),
                    PlannedByUserId = table.Column<int>(type: "int", nullable: false),
                    TargetCount = table.Column<byte>(type: "tinyint", nullable: true),
                    UsedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyTopicPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DailyTopicPlans_AspNetUsers_PlannedByUserId",
                        column: x => x.PlannedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DailyTopicPlans_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DailyTopicPlans_Topics_TopicId_LessonId",
                        columns: x => new { x.TopicId, x.LessonId },
                        principalTable: "Topics",
                        principalColumns: new[] { "Id", "LessonId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Questions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AuthorUserId = table.Column<int>(type: "int", nullable: false),
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    TopicId = table.Column<int>(type: "int", nullable: true),
                    Source = table.Column<byte>(type: "tinyint", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ImageFileId = table.Column<int>(type: "int", nullable: true),
                    OptionA = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    OptionB = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    OptionC = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    OptionD = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CorrectOption = table.Column<byte>(type: "tinyint", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ScheduledPublishDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PublishedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsHidden = table.Column<bool>(type: "bit", nullable: false),
                    HiddenAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    HiddenByUserId = table.Column<int>(type: "int", nullable: true),
                    IsAnswerDisputed = table.Column<bool>(type: "bit", nullable: false),
                    AnswerDisputedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AiSuggestedOption = table.Column<byte>(type: "tinyint", nullable: true),
                    SolutionNotNeeded = table.Column<bool>(type: "bit", nullable: false),
                    CorrectOptionChangedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CorrectOptionChangedByUserId = table.Column<int>(type: "int", nullable: true),
                    GenerationDate = table.Column<DateOnly>(type: "date", nullable: true),
                    GenerationSlot = table.Column<byte>(type: "tinyint", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Questions", x => x.Id);
                    table.CheckConstraint("CK_Questions_AiGeneration", "([Source] = 4 AND [GenerationDate] IS NOT NULL AND [GenerationSlot] IS NOT NULL) OR ([Source] <> 4 AND [GenerationDate] IS NULL AND [GenerationSlot] IS NULL)");
                    table.CheckConstraint("CK_Questions_AiSuggestedOption", "[AiSuggestedOption] IS NULL OR [AiSuggestedOption] BETWEEN 1 AND 4");
                    table.CheckConstraint("CK_Questions_CorrectOption", "[CorrectOption] BETWEEN 1 AND 4");
                    table.CheckConstraint("CK_Questions_Source", "[Source] IN (2, 3, 4)");
                    table.CheckConstraint("CK_Questions_TextOrImage", "[Text] IS NOT NULL OR [ImageFileId] IS NOT NULL");
                    table.ForeignKey(
                        name: "FK_Questions_AspNetUsers_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Questions_AspNetUsers_CorrectOptionChangedByUserId",
                        column: x => x.CorrectOptionChangedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Questions_AspNetUsers_HiddenByUserId",
                        column: x => x.HiddenByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Questions_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Questions_StoredFiles_ImageFileId",
                        column: x => x.ImageFileId,
                        principalTable: "StoredFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Questions_Topics_TopicId_LessonId",
                        columns: x => new { x.TopicId, x.LessonId },
                        principalTable: "Topics",
                        principalColumns: new[] { "Id", "LessonId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AiLogs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: true),
                    QuestionId = table.Column<int>(type: "int", nullable: true),
                    Operation = table.Column<byte>(type: "tinyint", nullable: false),
                    Model = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Input = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Output = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    InputTokens = table.Column<int>(type: "int", nullable: true),
                    OutputTokens = table.Column<int>(type: "int", nullable: true),
                    DurationMs = table.Column<int>(type: "int", nullable: true),
                    Success = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiLogs_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AiLogs_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssignmentQuestions",
                columns: table => new
                {
                    AssignmentId = table.Column<int>(type: "int", nullable: false),
                    QuestionId = table.Column<int>(type: "int", nullable: false),
                    OrderNo = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssignmentQuestions", x => new { x.AssignmentId, x.QuestionId });
                    table.ForeignKey(
                        name: "FK_AssignmentQuestions_Assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "Assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssignmentQuestions_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GenerationLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RunId = table.Column<int>(type: "int", nullable: false),
                    RunDate = table.Column<DateOnly>(type: "date", nullable: false),
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    TopicId = table.Column<int>(type: "int", nullable: true),
                    Slot = table.Column<byte>(type: "tinyint", nullable: false),
                    AttemptNo = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    ErrorMessage = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    QuestionId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GenerationLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GenerationLogs_GenerationRuns_RunId",
                        column: x => x.RunId,
                        principalTable: "GenerationRuns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GenerationLogs_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GenerationLogs_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GenerationLogs_Topics_TopicId",
                        column: x => x.TopicId,
                        principalTable: "Topics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "QuestionLikes",
                columns: table => new
                {
                    QuestionId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuestionLikes", x => new { x.QuestionId, x.UserId });
                    table.ForeignKey(
                        name: "FK_QuestionLikes_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QuestionLikes_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Answers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    QuestionId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    AssignmentId = table.Column<int>(type: "int", nullable: true),
                    SelectedOption = table.Column<byte>(type: "tinyint", nullable: false),
                    IsCorrect = table.Column<bool>(type: "bit", nullable: false),
                    AnsweredAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Answers", x => x.Id);
                    table.CheckConstraint("CK_Answers_SelectedOption", "[SelectedOption] BETWEEN 1 AND 4");
                    table.ForeignKey(
                        name: "FK_Answers_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Answers_AssignmentQuestions_AssignmentId_QuestionId",
                        columns: x => new { x.AssignmentId, x.QuestionId },
                        principalTable: "AssignmentQuestions",
                        principalColumns: new[] { "AssignmentId", "QuestionId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Answers_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PointTransactions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<byte>(type: "tinyint", nullable: false),
                    QuestionId = table.Column<int>(type: "int", nullable: true),
                    AnswerId = table.Column<int>(type: "int", nullable: true),
                    AssignmentId = table.Column<int>(type: "int", nullable: true),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    CreatedByUserId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PointTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PointTransactions_Answers_AnswerId",
                        column: x => x.AnswerId,
                        principalTable: "Answers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PointTransactions_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PointTransactions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PointTransactions_Assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "Assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PointTransactions_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Solutions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    QuestionId = table.Column<int>(type: "int", nullable: false),
                    AuthorUserId = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<byte>(type: "tinyint", nullable: false),
                    AnswerId = table.Column<int>(type: "int", nullable: true),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ImageFileId = table.Column<int>(type: "int", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false),
                    IsHidden = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Solutions", x => x.Id);
                    table.UniqueConstraint("AK_Solutions_Id_QuestionId", x => new { x.Id, x.QuestionId });
                    table.CheckConstraint("CK_Solutions_StudentAnswer", "([Type] = 3 AND [AnswerId] IS NOT NULL) OR ([Type] <> 3 AND [AnswerId] IS NULL)");
                    table.CheckConstraint("CK_Solutions_TextOrImage", "[Text] IS NOT NULL OR [ImageFileId] IS NOT NULL");
                    table.CheckConstraint("CK_Solutions_Type", "[Type] IN (2, 3, 4)");
                    table.ForeignKey(
                        name: "FK_Solutions_Answers_AnswerId",
                        column: x => x.AnswerId,
                        principalTable: "Answers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Solutions_AspNetUsers_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Solutions_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Solutions_StoredFiles_ImageFileId",
                        column: x => x.ImageFileId,
                        principalTable: "StoredFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Comments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    QuestionId = table.Column<int>(type: "int", nullable: false),
                    SolutionId = table.Column<int>(type: "int", nullable: true),
                    ParentId = table.Column<int>(type: "int", nullable: true),
                    RootId = table.Column<int>(type: "int", nullable: true),
                    Depth = table.Column<byte>(type: "tinyint", nullable: false),
                    AuthorUserId = table.Column<int>(type: "int", nullable: false),
                    ReplyToUserId = table.Column<int>(type: "int", nullable: true),
                    Body = table.Column<string>(type: "nvarchar(800)", maxLength: 800, nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    ModerationReason = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    EditedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    EditCount = table.Column<byte>(type: "tinyint", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DeletedByUserId = table.Column<int>(type: "int", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Comments", x => x.Id);
                    table.UniqueConstraint("AK_Comments_Id_QuestionId", x => new { x.Id, x.QuestionId });
                    table.CheckConstraint("CK_Comments_Status", "[Status] IN (0, 1, 2)");
                    table.CheckConstraint("CK_Comments_Tree", "([ParentId] IS NULL AND [RootId] IS NULL AND [Depth] = 0) OR ([ParentId] IS NOT NULL AND [RootId] IS NOT NULL AND [Depth] BETWEEN 1 AND 10)");
                    table.ForeignKey(
                        name: "FK_Comments_AspNetUsers_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Comments_AspNetUsers_DeletedByUserId",
                        column: x => x.DeletedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Comments_AspNetUsers_ReplyToUserId",
                        column: x => x.ReplyToUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Comments_Comments_ParentId_QuestionId",
                        columns: x => new { x.ParentId, x.QuestionId },
                        principalTable: "Comments",
                        principalColumns: new[] { "Id", "QuestionId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Comments_Comments_RootId",
                        column: x => x.RootId,
                        principalTable: "Comments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Comments_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Comments_Solutions_SolutionId_QuestionId",
                        columns: x => new { x.SolutionId, x.QuestionId },
                        principalTable: "Solutions",
                        principalColumns: new[] { "Id", "QuestionId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Notifications",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<byte>(type: "tinyint", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    QuestionId = table.Column<int>(type: "int", nullable: true),
                    AssignmentId = table.Column<int>(type: "int", nullable: true),
                    CommentId = table.Column<int>(type: "int", nullable: true),
                    RunId = table.Column<int>(type: "int", nullable: true),
                    IsRead = table.Column<bool>(type: "bit", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Notifications_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Notifications_Assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "Assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Notifications_Comments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "Comments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Notifications_GenerationRuns_RunId",
                        column: x => x.RunId,
                        principalTable: "GenerationRuns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Notifications_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Reports",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TargetType = table.Column<byte>(type: "tinyint", nullable: false),
                    QuestionId = table.Column<int>(type: "int", nullable: false),
                    CommentId = table.Column<int>(type: "int", nullable: true),
                    SolutionId = table.Column<int>(type: "int", nullable: true),
                    ReportedUserId = table.Column<int>(type: "int", nullable: false),
                    ReporterUserId = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<byte>(type: "tinyint", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    TargetSnapshot = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    ActionTaken = table.Column<byte>(type: "tinyint", nullable: false),
                    ResolvedByUserId = table.Column<int>(type: "int", nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ResolutionNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reports", x => x.Id);
                    table.CheckConstraint("CK_Reports_Status", "[Status] IN (0, 1, 2)");
                    table.CheckConstraint("CK_Reports_Target", "([TargetType] = 1 AND [CommentId] IS NULL AND [SolutionId] IS NULL) OR ([TargetType] = 2 AND [CommentId] IS NOT NULL AND [SolutionId] IS NULL) OR ([TargetType] = 3 AND [SolutionId] IS NOT NULL AND [CommentId] IS NULL)");
                    table.ForeignKey(
                        name: "FK_Reports_AspNetUsers_ReportedUserId",
                        column: x => x.ReportedUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reports_AspNetUsers_ReporterUserId",
                        column: x => x.ReporterUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reports_AspNetUsers_ResolvedByUserId",
                        column: x => x.ResolvedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reports_Comments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "Comments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reports_Questions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "Questions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reports_Solutions_SolutionId",
                        column: x => x.SolutionId,
                        principalTable: "Solutions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Key", "Description", "UpdatedAt", "UpdatedByUserId", "Value" },
                values: new object[,]
                {
                    { "aciklamaMinKarakter", "Öğrenci çözüm açıklamasının asgari karakter sayısı.", null, null, "30" },
                    { "aiGunlukCozumLimit", "Öğrenci başına günlük yapay zeka çözüm hakkı.", null, null, "5" },
                    { "cozumEsikCevapSayisi", "Yapay zeka çözümü için asgari cevap sayısı eşiği.", null, null, "5" },
                    { "cozumEsikYanlisOrani", "Yapay zeka çözümü için yanlış cevap oranı eşiği (yüzde).", null, null, "60" },
                    { "cozumMaxKarakter", "İnsan tarafından yazılan çözümün azami karakter sayısı.", null, null, "4000" },
                    { "gunlukSoruSayisi", "Her ders için günlük üretilecek soru sayısı.", null, null, "1" },
                    { "puanCozumYazma", "Çözüm yazma puanı.", null, null, "5" },
                    { "puanDogruCevap", "Doğru cevap puanı.", null, null, "5" },
                    { "puanSoruYukleme", "Soru yükleme puanı.", null, null, "3" },
                    { "sikayetMinKarakter", "Şikayet açıklamasının asgari karakter sayısı.", null, null, "10" },
                    { "soruCarpani", "Günlük soru sayısı çarpanı.", null, null, "1" },
                    { "soruUretimAktifMi", "Günlük soru üretimi açık mı (1 açık, 0 kapalı).", null, null, "1" },
                    { "yorumDuzenlemeDk", "Yorum düzenleme süresi (dakika).", null, null, "15" },
                    { "yorumMaxDerinlik", "Yorum ağacının kökten sonraki azami derinliği.", null, null, "3" },
                    { "yorumMaxKarakter", "Yorumun azami karakter sayısı.", null, null, "800" },
                    { "yorumSoruBasinaMax", "Bir soruya yazılabilecek azami yorum sayısı.", null, null, "1000" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_BranchLessonId",
                table: "AspNetUsers",
                column: "BranchLessonId");

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_QuestionId",
                table: "AiLogs",
                column: "QuestionId");

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_User_Operation_CreatedAt",
                table: "AiLogs",
                columns: new[] { "UserId", "Operation", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Answers_Assignment_User",
                table: "Answers",
                columns: new[] { "AssignmentId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_Answers_AssignmentId_QuestionId",
                table: "Answers",
                columns: new[] { "AssignmentId", "QuestionId" });

            migrationBuilder.CreateIndex(
                name: "IX_Answers_Question_Include_IsCorrect",
                table: "Answers",
                column: "QuestionId")
                .Annotation("SqlServer:Include", new[] { "IsCorrect" });

            migrationBuilder.CreateIndex(
                name: "IX_Answers_User_AnsweredAt",
                table: "Answers",
                columns: new[] { "UserId", "AnsweredAt" });

            migrationBuilder.CreateIndex(
                name: "UX_Answers_Question_User",
                table: "Answers",
                columns: new[] { "QuestionId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_AssignmentQuestions_Assignment_OrderNo",
                table: "AssignmentQuestions",
                columns: new[] { "AssignmentId", "OrderNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_AssignmentQuestions_QuestionId",
                table: "AssignmentQuestions",
                column: "QuestionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_LessonId",
                table: "Assignments",
                column: "LessonId");

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_Status_EndDate",
                table: "Assignments",
                columns: new[] { "Status", "EndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_Status_StartDate",
                table: "Assignments",
                columns: new[] { "Status", "StartDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_Teacher_Status",
                table: "Assignments",
                columns: new[] { "TeacherUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Comments_Author_CreatedAt",
                table: "Comments",
                columns: new[] { "AuthorUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Comments_DeletedByUserId",
                table: "Comments",
                column: "DeletedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Comments_ParentId",
                table: "Comments",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_Comments_ParentId_QuestionId",
                table: "Comments",
                columns: new[] { "ParentId", "QuestionId" });

            migrationBuilder.CreateIndex(
                name: "IX_Comments_ReplyToUserId",
                table: "Comments",
                column: "ReplyToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Comments_Root_CreatedAt",
                table: "Comments",
                columns: new[] { "RootId", "CreatedAt" },
                filter: "[RootId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Comments_Roots",
                table: "Comments",
                columns: new[] { "QuestionId", "SolutionId", "CreatedAt", "Id" },
                filter: "[ParentId] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Comments_SolutionId_QuestionId",
                table: "Comments",
                columns: new[] { "SolutionId", "QuestionId" });

            migrationBuilder.CreateIndex(
                name: "IX_DailyTopicPlans_LessonId",
                table: "DailyTopicPlans",
                column: "LessonId");

            migrationBuilder.CreateIndex(
                name: "IX_DailyTopicPlans_PlannedByUserId",
                table: "DailyTopicPlans",
                column: "PlannedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DailyTopicPlans_TopicId_LessonId",
                table: "DailyTopicPlans",
                columns: new[] { "TopicId", "LessonId" });

            migrationBuilder.CreateIndex(
                name: "UX_DailyTopicPlans_Date_Lesson",
                table: "DailyTopicPlans",
                columns: new[] { "PlanDate", "LessonId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GenerationLogs_Date_Lesson_Status",
                table: "GenerationLogs",
                columns: new[] { "RunDate", "LessonId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_GenerationLogs_LessonId",
                table: "GenerationLogs",
                column: "LessonId");

            migrationBuilder.CreateIndex(
                name: "IX_GenerationLogs_QuestionId",
                table: "GenerationLogs",
                column: "QuestionId");

            migrationBuilder.CreateIndex(
                name: "IX_GenerationLogs_RunId",
                table: "GenerationLogs",
                column: "RunId");

            migrationBuilder.CreateIndex(
                name: "IX_GenerationLogs_TopicId",
                table: "GenerationLogs",
                column: "TopicId");

            migrationBuilder.CreateIndex(
                name: "IX_GenerationRuns_TriggeredByUserId",
                table: "GenerationRuns",
                column: "TriggeredByUserId");

            migrationBuilder.CreateIndex(
                name: "UX_GenerationRuns_Kind_Running",
                table: "GenerationRuns",
                column: "Kind",
                unique: true,
                filter: "[Status] = 0");

            migrationBuilder.CreateIndex(
                name: "IX_GenerationSchedules_LessonId",
                table: "GenerationSchedules",
                column: "LessonId");

            migrationBuilder.CreateIndex(
                name: "UX_Lessons_Name",
                table: "Lessons",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_AssignmentId",
                table: "Notifications",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_CommentId",
                table: "Notifications",
                column: "CommentId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_QuestionId",
                table: "Notifications",
                column: "QuestionId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_RunId",
                table: "Notifications",
                column: "RunId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_User_IsRead_CreatedAt",
                table: "Notifications",
                columns: new[] { "UserId", "IsRead", "CreatedAt" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "UX_Notifications_User_Type_Run",
                table: "Notifications",
                columns: new[] { "UserId", "Type", "RunId" },
                unique: true,
                filter: "[RunId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PointTransactions_AssignmentId",
                table: "PointTransactions",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_PointTransactions_CreatedByUserId",
                table: "PointTransactions",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PointTransactions_LocalDate",
                table: "PointTransactions",
                column: "LocalDate")
                .Annotation("SqlServer:Include", new[] { "UserId", "Amount" });

            migrationBuilder.CreateIndex(
                name: "IX_PointTransactions_User_CreatedAt",
                table: "PointTransactions",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "UX_PointTransactions_Answer_Reason",
                table: "PointTransactions",
                columns: new[] { "AnswerId", "Reason" },
                unique: true,
                filter: "[Reason] IN (1, 2) AND [AnswerId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_PointTransactions_Question_Upload",
                table: "PointTransactions",
                columns: new[] { "QuestionId", "Reason" },
                unique: true,
                filter: "[Reason] = 3 AND [QuestionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionLikes_UserId",
                table: "QuestionLikes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_AnswerDisputed",
                table: "Questions",
                column: "IsAnswerDisputed",
                filter: "[IsAnswerDisputed] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_Author_CreatedAt",
                table: "Questions",
                columns: new[] { "AuthorUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Questions_CorrectOptionChangedByUserId",
                table: "Questions",
                column: "CorrectOptionChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_HiddenByUserId",
                table: "Questions",
                column: "HiddenByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_Lesson_PublishedAt",
                table: "Questions",
                columns: new[] { "LessonId", "PublishedAt" },
                filter: "[IsHidden] = 0");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_ScheduledPublishDate_Unpublished",
                table: "Questions",
                column: "ScheduledPublishDate",
                filter: "[PublishedAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_TopicId_LessonId",
                table: "Questions",
                columns: new[] { "TopicId", "LessonId" });

            migrationBuilder.CreateIndex(
                name: "UX_Questions_Ai_Lesson_Date_Slot",
                table: "Questions",
                columns: new[] { "LessonId", "GenerationDate", "GenerationSlot" },
                unique: true,
                filter: "[Source] = 4");

            migrationBuilder.CreateIndex(
                name: "UX_Questions_ImageFileId",
                table: "Questions",
                column: "ImageFileId",
                unique: true,
                filter: "[ImageFileId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_CommentId",
                table: "Reports",
                column: "CommentId");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_QuestionId",
                table: "Reports",
                column: "QuestionId");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_ReportedUser_Status",
                table: "Reports",
                columns: new[] { "ReportedUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Reports_ResolvedByUserId",
                table: "Reports",
                column: "ResolvedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_SolutionId",
                table: "Reports",
                column: "SolutionId");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_Status_Target_CreatedAt",
                table: "Reports",
                columns: new[] { "Status", "TargetType", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "UX_Reports_Reporter_Comment",
                table: "Reports",
                columns: new[] { "ReporterUserId", "CommentId" },
                unique: true,
                filter: "[TargetType] = 2");

            migrationBuilder.CreateIndex(
                name: "UX_Reports_Reporter_Question",
                table: "Reports",
                columns: new[] { "ReporterUserId", "QuestionId" },
                unique: true,
                filter: "[TargetType] = 1");

            migrationBuilder.CreateIndex(
                name: "UX_Reports_Reporter_Solution",
                table: "Reports",
                columns: new[] { "ReporterUserId", "SolutionId" },
                unique: true,
                filter: "[TargetType] = 3");

            migrationBuilder.CreateIndex(
                name: "IX_Settings_UpdatedByUserId",
                table: "Settings",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Solutions_AuthorUserId",
                table: "Solutions",
                column: "AuthorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Solutions_ImageFileId",
                table: "Solutions",
                column: "ImageFileId");

            migrationBuilder.CreateIndex(
                name: "UX_Solutions_AnswerId",
                table: "Solutions",
                column: "AnswerId",
                unique: true,
                filter: "[AnswerId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_Solutions_Question_Author_Student",
                table: "Solutions",
                columns: new[] { "QuestionId", "AuthorUserId" },
                unique: true,
                filter: "[Type] = 3");

            migrationBuilder.CreateIndex(
                name: "UX_Solutions_Question_Type_TeacherAi",
                table: "Solutions",
                columns: new[] { "QuestionId", "Type" },
                unique: true,
                filter: "[Type] IN (2, 4) AND [IsDeleted] = 0");

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_Status_CreatedAt",
                table: "StoredFiles",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_UploadedByUserId",
                table: "StoredFiles",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "UX_StoredFiles_BlobName",
                table: "StoredFiles",
                column: "BlobName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_Topics_LessonId_Name",
                table: "Topics",
                columns: new[] { "LessonId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUsers_Lessons_BranchLessonId",
                table: "AspNetUsers",
                column: "BranchLessonId",
                principalTable: "Lessons",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUsers_Lessons_BranchLessonId",
                table: "AspNetUsers");

            migrationBuilder.DropTable(
                name: "AiLogs");

            migrationBuilder.DropTable(
                name: "DailyTopicPlans");

            migrationBuilder.DropTable(
                name: "GenerationLogs");

            migrationBuilder.DropTable(
                name: "GenerationSchedules");

            migrationBuilder.DropTable(
                name: "Notifications");

            migrationBuilder.DropTable(
                name: "PointTransactions");

            migrationBuilder.DropTable(
                name: "QuestionLikes");

            migrationBuilder.DropTable(
                name: "Reports");

            migrationBuilder.DropTable(
                name: "Settings");

            migrationBuilder.DropTable(
                name: "GenerationRuns");

            migrationBuilder.DropTable(
                name: "Comments");

            migrationBuilder.DropTable(
                name: "Solutions");

            migrationBuilder.DropTable(
                name: "Answers");

            migrationBuilder.DropTable(
                name: "AssignmentQuestions");

            migrationBuilder.DropTable(
                name: "Assignments");

            migrationBuilder.DropTable(
                name: "Questions");

            migrationBuilder.DropTable(
                name: "StoredFiles");

            migrationBuilder.DropTable(
                name: "Topics");

            migrationBuilder.DropTable(
                name: "Lessons");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_BranchLessonId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BranchLessonId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "Points",
                table: "AspNetUsers");
        }
    }
}
