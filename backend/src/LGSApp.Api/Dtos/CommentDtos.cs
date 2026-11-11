using System.ComponentModel.DataAnnotations;
using LGSApp.Domain.Entities;

namespace LGSApp.Api.Dtos;

public record CreateCommentRequest(
    [Required(ErrorMessage = "Yorum metni zorunludur."), StringLength(4000, ErrorMessage = "Yorum çok uzun.")] string Body,
    int? ParentId,
    int? SolutionId);

public record EditCommentRequest(
    [Required(ErrorMessage = "Yorum metni zorunludur."), StringLength(4000, ErrorMessage = "Yorum çok uzun.")] string Body,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);

public record RemoveCommentRequest(
    [Required(ErrorMessage = "Kaldırma nedeni zorunludur."), StringLength(300, ErrorMessage = "Kaldırma nedeni en fazla {1} karakter olabilir.")] string Reason);

public record CreateReportRequest(
    [EnumDataType(typeof(ReportReason), ErrorMessage = "Geçersiz şikayet nedeni.")] ReportReason Reason,
    [Required(ErrorMessage = "Şikayet açıklaması zorunludur."), StringLength(500, ErrorMessage = "Şikayet açıklaması en fazla {1} karakter olabilir.")] string Description);
