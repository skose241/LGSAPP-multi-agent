using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SettingDescriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "cozumEsikCevapSayisi",
                column: "Description",
                value: "Öğretmen çözümü bekleyen listesi için asgari cevap sayısı eşiği.");

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "cozumEsikYanlisOrani",
                column: "Description",
                value: "Öğretmen çözümü bekleyen listesi için yanlış cevap oranı eşiği (yüzde).");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "cozumEsikCevapSayisi",
                column: "Description",
                value: "Yapay zeka çözümü için asgari cevap sayısı eşiği.");

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "cozumEsikYanlisOrani",
                column: "Description",
                value: "Yapay zeka çözümü için yanlış cevap oranı eşiği (yüzde).");
        }
    }
}
