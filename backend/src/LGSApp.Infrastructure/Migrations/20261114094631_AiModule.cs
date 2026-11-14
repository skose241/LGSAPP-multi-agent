using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AiModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AiLogs_QuestionId",
                table: "AiLogs");

            migrationBuilder.AddColumn<byte>(
                name: "StatedOption",
                table: "Solutions",
                type: "tinyint",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AnswerKeyReviewedAt",
                table: "Questions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AnswerKeyReviewedByUserId",
                table: "Questions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<byte>(
                name: "AttemptCount",
                table: "AiLogs",
                type: "tinyint",
                nullable: false,
                defaultValue: (byte)1);

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAt",
                table: "AiLogs",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CostUsd",
                table: "AiLogs",
                type: "decimal(12,6)",
                precision: 12,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "CountsTowardLimit",
                table: "AiLogs",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<byte>(
                name: "ErrorKind",
                table: "AiLogs",
                type: "tinyint",
                nullable: false,
                defaultValue: (byte)0);

            migrationBuilder.AddColumn<string>(
                name: "ErrorMessage",
                table: "AiLogs",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<short>(
                name: "HttpStatus",
                table: "AiLogs",
                type: "smallint",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ImageFileId",
                table: "AiLogs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModelVersion",
                table: "AiLogs",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SolutionId",
                table: "AiLogs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<byte>(
                name: "Status",
                table: "AiLogs",
                type: "tinyint",
                nullable: false,
                defaultValue: (byte)1);

            migrationBuilder.AddColumn<int>(
                name: "ThinkingTokens",
                table: "AiLogs",
                type: "int",
                nullable: true);

            migrationBuilder.Sql(
                """
                EXEC(N'UPDATE [AiLogs] SET [Status] = 2 WHERE [Success] = 0;');
                """);

            migrationBuilder.Sql(
                """
                EXEC(N'UPDATE s
                SET s.[StatedOption] = q.[CorrectOption]
                FROM [Solutions] AS s
                INNER JOIN [Questions] AS q ON q.[Id] = s.[QuestionId]
                WHERE s.[Type] = 4 AND s.[StatedOption] IS NULL;');
                """);

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Key", "Description", "UpdatedAt", "UpdatedByUserId", "Value" },
                values: new object[,]
                {
                    { "aiCozumAktifMi", "Öğrenci istekli yapay zekâ çözümü açık mı (1 açık, 0 kapalı).", null, null, "1" },
                    { "aiGunlukCozumGlobalLimit", "Tüm kullanıcılar için günlük toplam yapay zekâ çözüm sınırı.", null, null, "150" },
                    { "aiGunlukCozumLimitModerator", "Öğretmen ve müdür başına günlük yapay zekâ çözüm hakkı (0 sınırsız, genel sınıra sayılır).", null, null, "0" },
                    { "aiOkunamadiBeklemeSaat", "Okunamayan soru görseli için yeniden denemeden önce beklenecek saat.", null, null, "24" },
                    { "aiSoruDogrulamaAktifMi", "Üretilen soruların ikinci bir yapay zekâ çağrısıyla doğrulanması açık mı (1 açık, 0 kapalı).", null, null, "1" }
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Solutions_StatedOption",
                table: "Solutions",
                sql: "([Type] = 4 OR [StatedOption] IS NULL) AND ([StatedOption] IS NULL OR [StatedOption] BETWEEN 1 AND 4)");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_AnswerKeyReviewedByUserId",
                table: "Questions",
                column: "AnswerKeyReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_ImageFileId",
                table: "AiLogs",
                column: "ImageFileId");

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_Operation_CreatedAt",
                table: "AiLogs",
                columns: new[] { "Operation", "CreatedAt" })
                .Annotation("SqlServer:Include", new[] { "CountsTowardLimit", "CostUsd" });

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_Pending",
                table: "AiLogs",
                columns: new[] { "Status", "CreatedAt" },
                filter: "[Status] = 0");

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_Question_Operation_CreatedAt",
                table: "AiLogs",
                columns: new[] { "QuestionId", "Operation", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_SolutionId",
                table: "AiLogs",
                column: "SolutionId");

            migrationBuilder.AddForeignKey(
                name: "FK_AiLogs_Solutions_SolutionId",
                table: "AiLogs",
                column: "SolutionId",
                principalTable: "Solutions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_AiLogs_StoredFiles_ImageFileId",
                table: "AiLogs",
                column: "ImageFileId",
                principalTable: "StoredFiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Questions_AspNetUsers_AnswerKeyReviewedByUserId",
                table: "Questions",
                column: "AnswerKeyReviewedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AiLogs_Solutions_SolutionId",
                table: "AiLogs");

            migrationBuilder.DropForeignKey(
                name: "FK_AiLogs_StoredFiles_ImageFileId",
                table: "AiLogs");

            migrationBuilder.DropForeignKey(
                name: "FK_Questions_AspNetUsers_AnswerKeyReviewedByUserId",
                table: "Questions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Solutions_StatedOption",
                table: "Solutions");

            migrationBuilder.DropIndex(
                name: "IX_Questions_AnswerKeyReviewedByUserId",
                table: "Questions");

            migrationBuilder.DropIndex(
                name: "IX_AiLogs_ImageFileId",
                table: "AiLogs");

            migrationBuilder.DropIndex(
                name: "IX_AiLogs_Operation_CreatedAt",
                table: "AiLogs");

            migrationBuilder.DropIndex(
                name: "IX_AiLogs_Pending",
                table: "AiLogs");

            migrationBuilder.DropIndex(
                name: "IX_AiLogs_Question_Operation_CreatedAt",
                table: "AiLogs");

            migrationBuilder.DropIndex(
                name: "IX_AiLogs_SolutionId",
                table: "AiLogs");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "aiCozumAktifMi");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "aiGunlukCozumGlobalLimit");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "aiGunlukCozumLimitModerator");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "aiOkunamadiBeklemeSaat");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "aiSoruDogrulamaAktifMi");

            migrationBuilder.DropColumn(
                name: "StatedOption",
                table: "Solutions");

            migrationBuilder.DropColumn(
                name: "AnswerKeyReviewedAt",
                table: "Questions");

            migrationBuilder.DropColumn(
                name: "AnswerKeyReviewedByUserId",
                table: "Questions");

            migrationBuilder.DropColumn(
                name: "AttemptCount",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "CostUsd",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "CountsTowardLimit",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "ErrorKind",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "ErrorMessage",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "HttpStatus",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "ImageFileId",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "ModelVersion",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "SolutionId",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "AiLogs");

            migrationBuilder.DropColumn(
                name: "ThinkingTokens",
                table: "AiLogs");

            migrationBuilder.CreateIndex(
                name: "IX_AiLogs_QuestionId",
                table: "AiLogs",
                column: "QuestionId");
        }
    }
}
