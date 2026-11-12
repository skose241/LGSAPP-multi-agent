using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FileUploads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StoredFiles_UploadedByUserId",
                table: "StoredFiles");

            migrationBuilder.DropIndex(
                name: "IX_Solutions_ImageFileId",
                table: "Solutions");

            migrationBuilder.AddColumn<Guid>(
                name: "ClientUploadId",
                table: "StoredFiles",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "StoredFiles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Questions",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Key", "Description", "UpdatedAt", "UpdatedByUserId", "Value" },
                values: new object[,]
                {
                    { "gunlukDosyaLimitiOgrenci", "Öğrenci başına günlük fotoğraf yükleme sınırı.", null, null, "60" },
                    { "gunlukDosyaLimitiOgretmen", "Öğretmen ve müdür başına günlük fotoğraf yükleme sınırı.", null, null, "500" },
                    { "gunlukSoruYuklemeLimiti", "Öğrenci başına günlük soru yükleme sınırı.", null, null, "20" },
                    { "puanliSoruYuklemeGunluk", "Günde puan kazandıran soru yükleme sayısı.", null, null, "5" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_User_CreatedAt",
                table: "StoredFiles",
                columns: new[] { "UploadedByUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "UX_StoredFiles_User_ClientUploadId",
                table: "StoredFiles",
                columns: new[] { "UploadedByUserId", "ClientUploadId" },
                unique: true,
                filter: "[ClientUploadId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StoredFiles_ReadyHasMetadata",
                table: "StoredFiles",
                sql: "[Status] <> 1 OR ([Width] IS NOT NULL AND [Height] IS NOT NULL AND [ConfirmedAt] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "UX_Solutions_ImageFileId",
                table: "Solutions",
                column: "ImageFileId",
                unique: true,
                filter: "[ImageFileId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StoredFiles_User_CreatedAt",
                table: "StoredFiles");

            migrationBuilder.DropIndex(
                name: "UX_StoredFiles_User_ClientUploadId",
                table: "StoredFiles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StoredFiles_ReadyHasMetadata",
                table: "StoredFiles");

            migrationBuilder.DropIndex(
                name: "UX_Solutions_ImageFileId",
                table: "Solutions");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "gunlukDosyaLimitiOgrenci");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "gunlukDosyaLimitiOgretmen");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "gunlukSoruYuklemeLimiti");

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "puanliSoruYuklemeGunluk");

            migrationBuilder.DropColumn(
                name: "ClientUploadId",
                table: "StoredFiles");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "StoredFiles");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Questions",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(4000)",
                oldMaxLength: 4000,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_UploadedByUserId",
                table: "StoredFiles",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Solutions_ImageFileId",
                table: "Solutions",
                column: "ImageFileId");
        }
    }
}
