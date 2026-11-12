using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LGSApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class NamedCommentCreatedAtDefault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DECLARE @existing sysname = (
                    SELECT dc.[name]
                    FROM sys.default_constraints AS dc
                    INNER JOIN sys.columns AS c ON c.[default_object_id] = dc.[object_id]
                    WHERE dc.[parent_object_id] = OBJECT_ID(N'[Comments]') AND c.[name] = N'CreatedAt');
                DECLARE @drop nvarchar(400) = N'ALTER TABLE [Comments] DROP CONSTRAINT ' + QUOTENAME(@existing);
                IF @existing IS NOT NULL AND @existing <> N'DF_Comments_CreatedAt'
                    EXEC(@drop);
                IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = N'DF_Comments_CreatedAt' AND [parent_object_id] = OBJECT_ID(N'[Comments]'))
                    ALTER TABLE [Comments] ADD CONSTRAINT [DF_Comments_CreatedAt] DEFAULT (SYSUTCDATETIME()) FOR [CreatedAt];
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = N'DF_Comments_CreatedAt' AND [parent_object_id] = OBJECT_ID(N'[Comments]'))
                    ALTER TABLE [Comments] DROP CONSTRAINT [DF_Comments_CreatedAt];
                IF NOT EXISTS (
                    SELECT 1 FROM sys.default_constraints AS dc
                    INNER JOIN sys.columns AS c ON c.[default_object_id] = dc.[object_id]
                    WHERE dc.[parent_object_id] = OBJECT_ID(N'[Comments]') AND c.[name] = N'CreatedAt')
                    ALTER TABLE [Comments] ADD DEFAULT (SYSUTCDATETIME()) FOR [CreatedAt];
                """);
        }
    }
}
