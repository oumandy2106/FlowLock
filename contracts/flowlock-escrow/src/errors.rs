use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FlowLockError {
    Unauthorized = 1,
    InvalidState = 2,
    DeadlineNotReached = 3,
    DeadlineExpired = 4,
    InvalidSplit = 5,
    InvalidAmount = 6,
    UnsupportedAsset = 7,
    AlreadyFinal = 8,
    PayerEqualsProvider = 9,
    TooManyMilestones = 10,
    TooManyRecipients = 11,
    InvalidDeadline = 12,
    AgreementNotFound = 13,
    MilestoneNotFound = 14,
}
