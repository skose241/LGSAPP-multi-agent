using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Revision1 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Comments_Comments_RootId",
                table: "Comments");

            migrationBuilder.Sql(
                "ALTER TABLE [Comments] ADD [BodyFingerprint] nvarchar(64) NOT NULL CONSTRAINT [DF_Comments_BodyFingerprint] DEFAULT N'';");

            migrationBuilder.Sql(
                """
                INSERT INTO [Settings] ([Key], [Value], [Description], [UpdatedAt], [UpdatedByUserId])
                SELECT
                    N'yorumGorunurDerinlik',
                    CASE
                        WHEN TRY_CAST(m.[Value] AS int) BETWEEN 1 AND 10 THEN CAST(TRY_CAST(m.[Value] AS int) AS nvarchar(255))
                        ELSE N'3'
                    END,
                    N'Listede bir kökün altında gösterilen yorum seviyesi sayısı.',
                    NULL,
                    NULL
                FROM (SELECT 1 AS [One]) AS d
                LEFT JOIN [Settings] AS m ON m.[Key] = N'yorumMaxDerinlik'
                WHERE NOT EXISTS (SELECT 1 FROM [Settings] WHERE [Key] = N'yorumGorunurDerinlik');
                """);

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "yorumMaxDerinlik",
                columns: new[] { "Description", "Value" },
                values: new object[] { "Yorum ağacının mutlak azami derinliği (en fazla 10).", "10" });

            migrationBuilder.CreateIndex(
                name: "IX_Comments_Duplicate",
                table: "Comments",
                columns: new[] { "AuthorUserId", "QuestionId", "BodyFingerprint", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Comments_RootId_QuestionId",
                table: "Comments",
                columns: new[] { "RootId", "QuestionId" });

            migrationBuilder.AddForeignKey(
                name: "FK_Comments_Comments_RootId_QuestionId",
                table: "Comments",
                columns: new[] { "RootId", "QuestionId" },
                principalTable: "Comments",
                principalColumns: new[] { "Id", "QuestionId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Comments_Comments_RootId_QuestionId",
                table: "Comments");

            migrationBuilder.DropIndex(
                name: "IX_Comments_Duplicate",
                table: "Comments");

            migrationBuilder.DropIndex(
                name: "IX_Comments_RootId_QuestionId",
                table: "Comments");

            migrationBuilder.Sql(
                """
                UPDATE [Settings]
                SET [Value] = ISNULL((SELECT [Value] FROM [Settings] WHERE [Key] = N'yorumGorunurDerinlik'), N'3'),
                    [Description] = N'Yorum ağacının kökten sonraki azami derinliği.'
                WHERE [Key] = N'yorumMaxDerinlik';
                """);

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "yorumGorunurDerinlik");

            migrationBuilder.Sql("ALTER TABLE [Comments] DROP CONSTRAINT [DF_Comments_BodyFingerprint];");

            migrationBuilder.DropColumn(
                name: "BodyFingerprint",
                table: "Comments");

            migrationBuilder.AddForeignKey(
                name: "FK_Comments_Comments_RootId",
                table: "Comments",
                column: "RootId",
                principalTable: "Comments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
