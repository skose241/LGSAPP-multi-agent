using System.ComponentModel.DataAnnotations;
using LGSApp.Infrastructure.Services.Reports;

namespace LGSApp.Api.Dtos;

public record ResolveReportRequest(
    [EnumDataType(typeof(ReportResolveAction), ErrorMessage = "Geçersiz işlem.")] ReportResolveAction Action,
    [StringLength(500, ErrorMessage = "Not en fazla {1} karakter olabilir.")] string? Note,
    [Range(1, 4, ErrorMessage = "Doğru şık 1 ile 4 arasında olmalıdır.")] byte? CorrectOption,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);
