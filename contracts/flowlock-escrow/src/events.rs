use soroban_sdk::{contractevent, contracttype, Address, BytesN};

// Wrapper structs for multi-field event data
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneFundedData {
    pub agreement_id: u64,
    pub milestone_id: u32,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkSubmittedData {
    pub agreement_id: u64,
    pub milestone_id: u32,
    pub metadata_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneIdData {
    pub agreement_id: u64,
    pub milestone_id: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeOpenedData {
    pub agreement_id: u64,
    pub milestone_id: u32,
    pub reason_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MutualResolutionData {
    pub agreement_id: u64,
    pub milestone_id: u32,
    pub release_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitPaidData {
    pub agreement_id: u64,
    pub milestone_id: u32,
    pub recipient: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeeperPaidData {
    pub agreement_id: u64,
    pub milestone_id: u32,
    pub keeper: Address,
    pub amount: i128,
}

#[contractevent(topics = ["FlowLock", "AgreementCreated"], data_format = "single-value")]
pub struct AgreementCreated {
    pub agreement_id: u64,
}

#[contractevent(topics = ["FlowLock", "MilestoneFunded"], data_format = "single-value")]
pub struct MilestoneFunded {
    pub data: MilestoneFundedData,
}

#[contractevent(topics = ["FlowLock", "WorkSubmitted"], data_format = "single-value")]
pub struct WorkSubmitted {
    pub data: WorkSubmittedData,
}

#[contractevent(topics = ["FlowLock", "AutoReleased"], data_format = "single-value")]
pub struct AutoReleased {
    pub data: MilestoneIdData,
}

#[contractevent(topics = ["FlowLock", "RefundExecuted"], data_format = "single-value")]
pub struct RefundExecuted {
    pub data: MilestoneIdData,
}

#[contractevent(topics = ["FlowLock", "DisputeOpened"], data_format = "single-value")]
pub struct DisputeOpened {
    pub data: DisputeOpenedData,
}

#[contractevent(topics = ["FlowLock", "MutualResolutionReached"], data_format = "single-value")]
pub struct MutualResolutionReached {
    pub data: MutualResolutionData,
}

#[contractevent(topics = ["FlowLock", "SplitPaid"], data_format = "single-value")]
pub struct SplitPaid {
    pub data: SplitPaidData,
}

#[contractevent(topics = ["FlowLock", "KeeperPaid"], data_format = "single-value")]
pub struct KeeperPaid {
    pub data: KeeperPaidData,
}

#[contractevent(topics = ["FlowLock", "AgreementCancelled"], data_format = "single-value")]
pub struct AgreementCancelled {
    pub agreement_id: u64,
}
