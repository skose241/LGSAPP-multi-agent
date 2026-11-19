using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SettingUploadLimitDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "gunlukSoruYuklemeLimiti",
                column: "Description",
                value: "Öğrenci başına günlük soru yükleme sınırı (0 = hiçbir öğrenci soru yükleyemez).");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "gunlukSoruYuklemeLimiti",
                column: "Description",
                value: "Öğrenci başına günlük soru yükleme sınırı.");
        }
    }
}
