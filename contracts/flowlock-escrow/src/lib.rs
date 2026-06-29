#![no_std]

mod errors;
mod events;
mod types;

#[cfg(test)]
mod test;

use errors::FlowLockError;
use events::*;
use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, Vec};
use types::*;

const MAX_MILESTONES: u32 = 5;
const MAX_RECIPIENTS: u32 = 5;
const BPS_TOTAL: u32 = 10_000;

#[contract]
pub struct FlowLockEscrow;

#[contractimpl]
impl FlowLockEscrow {
    pub fn create_agreement(
        env: Env,
        payer: Address,
        provider: Address,
        settlement_asset: Address,
        platform: Address,
        milestones: Vec<MilestoneInput>,
    ) -> Result<u64, FlowLockError> {
        payer.require_auth();

        if payer == provider {
            return Err(FlowLockError::PayerEqualsProvider);
        }

        let count = milestones.len();
        if count == 0 || count > MAX_MILESTONES {
            return Err(FlowLockError::TooManyMilestones);
        }

        let now = env.ledger().timestamp();

        for i in 0..count {
            let m = milestones.get(i).unwrap();

            if m.amount <= 0 {
                return Err(FlowLockError::InvalidAmount);
            }
            if m.delivery_deadline <= now || m.review_deadline <= m.delivery_deadline {
                return Err(FlowLockError::InvalidDeadline);
            }
            if m.splits.len() == 0 || m.splits.len() > MAX_RECIPIENTS {
                return Err(FlowLockError::TooManyRecipients);
            }
            if m.keeper_bounty < 0 {
                return Err(FlowLockError::InvalidAmount);
            }

            let mut total_bps: u32 = 0;
            for j in 0..m.splits.len() {
                let s = m.splits.get(j).unwrap();
                total_bps += s.bps;
            }
            if total_bps != BPS_TOTAL {
                return Err(FlowLockError::InvalidSplit);
            }
        }

        let agreement_id = Self::next_id(&env);

        let agreement = Agreement {
            id: agreement_id,
            payer: payer.clone(),
            provider: provider.clone(),
            settlement_asset: settlement_asset.clone(),
            platform: platform.clone(),
            milestone_count: count,
            status: AgreementStatus::Active,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Agreement(agreement_id), &agreement);

        let empty_hash = BytesN::from_array(&env, &[0u8; 32]);

        for i in 0..count {
            let m = milestones.get(i).unwrap();
            let milestone = Milestone {
                amount: m.amount,
                delivery_deadline: m.delivery_deadline,
                review_deadline: m.review_deadline,
                status: MilestoneStatus::Draft,
                nonce: 0,
                splits: m.splits.clone(),
                keeper_bounty: m.keeper_bounty,
                metadata_hash: empty_hash.clone(),
            };
            env.storage()
                .persistent()
                .set(&DataKey::Milestone(agreement_id, i), &milestone);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Nonce(agreement_id), &0u32);

        AgreementCreated { agreement_id }.publish(&env);

        Ok(agreement_id)
    }

    pub fn fund_with_settlement_asset(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
        amount: i128,
    ) -> Result<(), FlowLockError> {
        let agreement = Self::get_agreement_internal(&env, agreement_id)?;
        let mut milestone = Self::get_milestone_internal(&env, agreement_id, milestone_id)?;

        agreement.payer.require_auth();

        Self::assert_state(&milestone.status, &MilestoneStatus::Draft)?;

        if amount != milestone.amount {
            return Err(FlowLockError::InvalidAmount);
        }

        let token_client = token::Client::new(&env, &agreement.settlement_asset);
        token_client.transfer(
            &agreement.payer,
            &env.current_contract_address(),
            &amount,
        );

        milestone.status = MilestoneStatus::Funded;
        milestone.nonce += 1;
        env.storage().persistent().set(
            &DataKey::Milestone(agreement_id, milestone_id),
            &milestone,
        );

        MilestoneFunded {
            data: MilestoneFundedData {
                agreement_id,
                milestone_id,
                amount,
            },
        }
        .publish(&env);

        Ok(())
    }

    pub fn submit_work(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
        metadata_hash: BytesN<32>,
    ) -> Result<(), FlowLockError> {
        let agreement = Self::get_agreement_internal(&env, agreement_id)?;
        let mut milestone = Self::get_milestone_internal(&env, agreement_id, milestone_id)?;

        agreement.provider.require_auth();

        Self::assert_state(&milestone.status, &MilestoneStatus::Funded)?;

        let now = env.ledger().timestamp();
        if now > milestone.delivery_deadline {
            return Err(FlowLockError::DeadlineExpired);
        }

        milestone.status = MilestoneStatus::Submitted;
        milestone.metadata_hash = metadata_hash.clone();
        milestone.nonce += 1;
        env.storage().persistent().set(
            &DataKey::Milestone(agreement_id, milestone_id),
            &milestone,
        );

        WorkSubmitted {
            data: WorkSubmittedData {
                agreement_id,
                milestone_id,
                metadata_hash,
            },
        }
        .publish(&env);

        Ok(())
    }

    pub fn approve_release(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<(), FlowLockError> {
        let agreement = Self::get_agreement_internal(&env, agreement_id)?;
        let mut milestone = Self::get_milestone_internal(&env, agreement_id, milestone_id)?;

        agreement.payer.require_auth();

        Self::assert_state(&milestone.status, &MilestoneStatus::Submitted)?;

        Self::execute_split(&env, &agreement, &milestone, agreement_id, milestone_id);

        milestone.status = MilestoneStatus::Released;
        milestone.nonce += 1;
        env.storage().persistent().set(
            &DataKey::Milestone(agreement_id, milestone_id),
            &milestone,
        );

        Self::check_completion(&env, agreement_id, &agreement);

        Ok(())
    }

    pub fn execute_due(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
        caller: Address,
    ) -> Result<(), FlowLockError> {
        caller.require_auth();

        let agreement = Self::get_agreement_internal(&env, agreement_id)?;
        let mut milestone = Self::get_milestone_internal(&env, agreement_id, milestone_id)?;

        let now = env.ledger().timestamp();

        match milestone.status {
            MilestoneStatus::Funded => {
                if now <= milestone.delivery_deadline {
                    return Err(FlowLockError::DeadlineNotReached);
                }
                let token_client = token::Client::new(&env, &agreement.settlement_asset);
                token_client.transfer(
                    &env.current_contract_address(),
                    &agreement.payer,
                    &milestone.amount,
                );

                milestone.status = MilestoneStatus::Refunded;
                milestone.nonce += 1;

                RefundExecuted {
                    data: MilestoneIdData {
                        agreement_id,
                        milestone_id,
                    },
                }
                .publish(&env);
            }
            MilestoneStatus::Submitted => {
                if now <= milestone.review_deadline {
                    return Err(FlowLockError::DeadlineNotReached);
                }

                if milestone.keeper_bounty > 0 {
                    let token_client = token::Client::new(&env, &agreement.settlement_asset);
                    token_client.transfer(
                        &env.current_contract_address(),
                        &caller,
                        &milestone.keeper_bounty,
                    );
                    KeeperPaid {
                        data: KeeperPaidData {
                            agreement_id,
                            milestone_id,
                            keeper: caller,
                            amount: milestone.keeper_bounty,
                        },
                    }
                    .publish(&env);
                }

                Self::execute_split(&env, &agreement, &milestone, agreement_id, milestone_id);

                milestone.status = MilestoneStatus::Released;
                milestone.nonce += 1;

                AutoReleased {
                    data: MilestoneIdData {
                        agreement_id,
                        milestone_id,
                    },
                }
                .publish(&env);
            }
            _ => {
                return Err(FlowLockError::InvalidState);
            }
        }

        env.storage().persistent().set(
            &DataKey::Milestone(agreement_id, milestone_id),
            &milestone,
        );

        Self::check_completion(&env, agreement_id, &agreement);

        Ok(())
    }

    pub fn request_dispute(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
        reason_hash: BytesN<32>,
        caller: Address,
    ) -> Result<(), FlowLockError> {
        caller.require_auth();

        let agreement = Self::get_agreement_internal(&env, agreement_id)?;
        let mut milestone = Self::get_milestone_internal(&env, agreement_id, milestone_id)?;

        if caller != agreement.payer && caller != agreement.provider {
            return Err(FlowLockError::Unauthorized);
        }

        Self::assert_state(&milestone.status, &MilestoneStatus::Submitted)?;

        milestone.status = MilestoneStatus::Disputed;
        milestone.nonce += 1;
        env.storage().persistent().set(
            &DataKey::Milestone(agreement_id, milestone_id),
            &milestone,
        );

        DisputeOpened {
            data: DisputeOpenedData {
                agreement_id,
                milestone_id,
                reason_hash,
            },
        }
        .publish(&env);

        Ok(())
    }

    pub fn resolve_by_mutual_agreement(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
        release_bps: u32,
    ) -> Result<(), FlowLockError> {
        let agreement = Self::get_agreement_internal(&env, agreement_id)?;
        let mut milestone = Self::get_milestone_internal(&env, agreement_id, milestone_id)?;

        agreement.payer.require_auth();
        agreement.provider.require_auth();

        Self::assert_state(&milestone.status, &MilestoneStatus::Disputed)?;

        if release_bps > BPS_TOTAL {
            return Err(FlowLockError::InvalidSplit);
        }

        let token_client = token::Client::new(&env, &agreement.settlement_asset);
        let net_amount = milestone.amount - milestone.keeper_bounty;
        let provider_amount = (net_amount * release_bps as i128) / BPS_TOTAL as i128;
        let payer_amount = net_amount - provider_amount;

        if provider_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &agreement.provider,
                &provider_amount,
            );
        }
        if payer_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &agreement.payer,
                &payer_amount,
            );
        }

        milestone.status = MilestoneStatus::MutualResolution;
        milestone.nonce += 1;
        env.storage().persistent().set(
            &DataKey::Milestone(agreement_id, milestone_id),
            &milestone,
        );

        MutualResolutionReached {
            data: MutualResolutionData {
                agreement_id,
                milestone_id,
                release_bps,
            },
        }
        .publish(&env);

        Self::check_completion(&env, agreement_id, &agreement);

        Ok(())
    }

    pub fn cancel_unfunded(
        env: Env,
        agreement_id: u64,
        caller: Address,
    ) -> Result<(), FlowLockError> {
        caller.require_auth();

        let mut agreement = Self::get_agreement_internal(&env, agreement_id)?;

        if caller != agreement.payer {
            return Err(FlowLockError::Unauthorized);
        }

        for i in 0..agreement.milestone_count {
            let milestone = Self::get_milestone_internal(&env, agreement_id, i)?;
            if milestone.status != MilestoneStatus::Draft {
                return Err(FlowLockError::InvalidState);
            }
        }

        agreement.status = AgreementStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Agreement(agreement_id), &agreement);

        for i in 0..agreement.milestone_count {
            let mut milestone = Self::get_milestone_internal(&env, agreement_id, i)?;
            milestone.status = MilestoneStatus::Cancelled;
            env.storage()
                .persistent()
                .set(&DataKey::Milestone(agreement_id, i), &milestone);
        }

        AgreementCancelled { agreement_id }.publish(&env);

        Ok(())
    }

    // --- Read functions ---

    pub fn get_agreement(env: Env, agreement_id: u64) -> Result<Agreement, FlowLockError> {
        Self::get_agreement_internal(&env, agreement_id)
    }

    pub fn get_milestone(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, FlowLockError> {
        Self::get_milestone_internal(&env, agreement_id, milestone_id)
    }

    // --- Internal helpers ---

    fn next_id(env: &Env) -> u64 {
        let id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::NextId)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::NextId, &(id + 1));
        id
    }

    fn get_agreement_internal(env: &Env, id: u64) -> Result<Agreement, FlowLockError> {
        env.storage()
            .persistent()
            .get(&DataKey::Agreement(id))
            .ok_or(FlowLockError::AgreementNotFound)
    }

    fn get_milestone_internal(
        env: &Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, FlowLockError> {
        env.storage()
            .persistent()
            .get(&DataKey::Milestone(agreement_id, milestone_id))
            .ok_or(FlowLockError::MilestoneNotFound)
    }

    fn assert_state(
        current: &MilestoneStatus,
        expected: &MilestoneStatus,
    ) -> Result<(), FlowLockError> {
        if current != expected {
            return Err(FlowLockError::InvalidState);
        }
        Ok(())
    }

    fn is_final(status: &MilestoneStatus) -> bool {
        matches!(
            status,
            MilestoneStatus::Released
                | MilestoneStatus::Refunded
                | MilestoneStatus::MutualResolution
                | MilestoneStatus::Cancelled
        )
    }

    fn execute_split(
        env: &Env,
        agreement: &Agreement,
        milestone: &Milestone,
        agreement_id: u64,
        milestone_id: u32,
    ) {
        let token_client = token::Client::new(env, &agreement.settlement_asset);
        let contract = env.current_contract_address();
        let net_amount = milestone.amount - milestone.keeper_bounty;

        let mut paid: i128 = 0;
        let split_count = milestone.splits.len();

        for i in 0..split_count {
            let s = milestone.splits.get(i).unwrap();
            let share = if i == split_count - 1 {
                net_amount - paid
            } else {
                (net_amount * s.bps as i128) / BPS_TOTAL as i128
            };

            if share > 0 {
                token_client.transfer(&contract, &s.recipient, &share);
                SplitPaid {
                    data: SplitPaidData {
                        agreement_id,
                        milestone_id,
                        recipient: s.recipient,
                        amount: share,
                    },
                }
                .publish(env);
            }
            paid += share;
        }
    }

    fn check_completion(env: &Env, agreement_id: u64, agreement: &Agreement) {
        let mut all_final = true;
        for i in 0..agreement.milestone_count {
            if let Ok(m) = Self::get_milestone_internal(env, agreement_id, i) {
                if !Self::is_final(&m.status) {
                    all_final = false;
                    break;
                }
            }
        }
        if all_final {
            let mut ag = agreement.clone();
            ag.status = AgreementStatus::Completed;
            env.storage()
                .persistent()
                .set(&DataKey::Agreement(agreement_id), &ag);
        }
    }
}
