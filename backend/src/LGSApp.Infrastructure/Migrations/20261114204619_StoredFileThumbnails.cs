using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StoredFileThumbnails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ThumbnailBlobName",
                table: "StoredFiles",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ThumbnailHeight",
                table: "StoredFiles",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ThumbnailSizeBytes",
                table: "StoredFiles",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ThumbnailWidth",
                table: "StoredFiles",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "UX_StoredFiles_ThumbnailBlobName",
                table: "StoredFiles",
                column: "ThumbnailBlobName",
                unique: true,
                filter: "[ThumbnailBlobName] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StoredFiles_ThumbnailComplete",
                table: "StoredFiles",
                sql: "([ThumbnailBlobName] IS NULL AND [ThumbnailWidth] IS NULL AND [ThumbnailHeight] IS NULL AND [ThumbnailSizeBytes] IS NULL) OR ([ThumbnailBlobName] IS NOT NULL AND [ThumbnailWidth] IS NOT NULL AND [ThumbnailHeight] IS NOT NULL AND [ThumbnailSizeBytes] IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_StoredFiles_ThumbnailBlobName",
                table: "StoredFiles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StoredFiles_ThumbnailComplete",
                table: "StoredFiles");

            migrationBuilder.DropColumn(
                name: "ThumbnailBlobName",
                table: "StoredFiles");

            migrationBuilder.DropColumn(
                name: "ThumbnailHeight",
                table: "StoredFiles");

            migrationBuilder.DropColumn(
                name: "ThumbnailSizeBytes",
                table: "StoredFiles");

            migrationBuilder.DropColumn(
                name: "ThumbnailWidth",
                table: "StoredFiles");
        }
    }
}
