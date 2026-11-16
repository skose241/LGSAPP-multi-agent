using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class QuestionClientRequestId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ClientRequestId",
                table: "Questions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "UX_Questions_Author_ClientRequestId",
                table: "Questions",
                columns: new[] { "AuthorUserId", "ClientRequestId" },
                unique: true,
                filter: "[ClientRequestId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_Questions_Author_ClientRequestId",
                table: "Questions");

            migrationBuilder.DropColumn(
                name: "ClientRequestId",
                table: "Questions");
        }
    }
}
