using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AnswerKeyReviewNote : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AnswerKeyReviewNote",
                table: "Questions",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AnswerKeyReviewNote",
                table: "Questions");
        }
    }
}
