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

            migrationBuilder.AddColumn<string>(
                name: "BodyFingerprint",
                table: "Comments",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "yorumMaxDerinlik",
                columns: new[] { "Description", "Value" },
                values: new object[] { "Yorum ağacının mutlak azami derinliği (en fazla 10).", "10" });

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Key", "Description", "UpdatedAt", "UpdatedByUserId", "Value" },
                values: new object[] { "yorumGorunurDerinlik", "Listede bir kökün altında gösterilen yorum seviyesi sayısı.", null, null, "3" });

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

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "yorumGorunurDerinlik");

            migrationBuilder.DropColumn(
                name: "BodyFingerprint",
                table: "Comments");

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "yorumMaxDerinlik",
                columns: new[] { "Description", "Value" },
                values: new object[] { "Yorum ağacının kökten sonraki azami derinliği.", "3" });

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
