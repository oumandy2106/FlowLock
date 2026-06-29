use soroban_sdk::{contracttype, Address, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AgreementStatus {
    Draft,
    Active,
    Completed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    Draft,
    Funded,
    Submitted,
    Released,
    Refunded,
    Disputed,
    MutualResolution,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    pub recipient: Address,
    pub bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub amount: i128,
    pub delivery_deadline: u64,
    pub review_deadline: u64,
    pub status: MilestoneStatus,
    pub nonce: u32,
    pub splits: Vec<Split>,
    pub keeper_bounty: i128,
    pub metadata_hash: soroban_sdk::BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Agreement {
    pub id: u64,
    pub payer: Address,
    pub provider: Address,
    pub settlement_asset: Address,
    pub platform: Address,
    pub milestone_count: u32,
    pub status: AgreementStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneInput {
    pub amount: i128,
    pub delivery_deadline: u64,
    pub review_deadline: u64,
    pub splits: Vec<Split>,
    pub keeper_bounty: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Agreement(u64),
    Milestone(u64, u32),
    Nonce(u64),
    Config,
    NextId,
}
