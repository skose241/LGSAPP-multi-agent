namespace LGSApp.Domain.Entities;

public enum AiLogStatus : byte
{
    Pending = 0,
    Succeeded = 1,
    Failed = 2,
    Rejected = 3
}
