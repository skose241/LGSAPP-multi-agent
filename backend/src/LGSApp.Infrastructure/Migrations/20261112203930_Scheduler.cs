using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Scheduler : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Questions_Ai_Unpublished",
                table: "Questions",
                column: "GenerationDate",
                filter: "[PublishedAt] IS NULL AND [Source] = 4");

            migrationBuilder.CreateIndex(
                name: "IX_GenerationRuns_Kind_RunDate",
                table: "GenerationRuns",
                columns: new[] { "Kind", "RunDate" })
                .Annotation("SqlServer:Include", new[] { "Status", "Trigger", "FinishedAt", "SucceededCount" });

            migrationBuilder.CreateIndex(
                name: "IX_GenerationRuns_StartedAt",
                table: "GenerationRuns",
                column: "StartedAt",
                descending: new bool[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Questions_Ai_Unpublished",
                table: "Questions");

            migrationBuilder.DropIndex(
                name: "IX_GenerationRuns_Kind_RunDate",
                table: "GenerationRuns");

            migrationBuilder.DropIndex(
                name: "IX_GenerationRuns_StartedAt",
                table: "GenerationRuns");
        }
    }
}
