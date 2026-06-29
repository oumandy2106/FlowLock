use crate::types::*;
use crate::FlowLockEscrow;
use crate::FlowLockEscrowClient;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{StellarAssetClient, Client as TokenClient};
use soroban_sdk::{vec, Address, BytesN, Env};

fn setup_env() -> (
    Env,
    Address,          // contract_id
    Address,          // payer
    Address,          // provider
    Address,          // platform
    Address,          // keeper
    Address,          // token
    FlowLockEscrowClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(FlowLockEscrow, ());
    let client = FlowLockEscrowClient::new(&env, &contract_id);

    let payer = Address::generate(&env);
    let provider = Address::generate(&env);
    let platform = Address::generate(&env);
    let keeper = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token.address();
    let sac = StellarAssetClient::new(&env, &token_address);
    sac.mint(&payer, &100_000_000_000);

    (env, contract_id, payer, provider, platform, keeper, token_address, client)
}

fn default_milestone_input(
    env: &Env,
    provider: &Address,
    platform: &Address,
    delivery_deadline: u64,
    review_deadline: u64,
) -> MilestoneInput {
    MilestoneInput {
        amount: 1_000_000_000,
        delivery_deadline,
        review_deadline,
        splits: vec![
            env,
            Split {
                recipient: provider.clone(),
                bps: 9_000,
            },
            Split {
                recipient: platform.clone(),
                bps: 1_000,
            },
        ],
        keeper_bounty: 10_000_000,
    }
}

fn create_default_agreement(
    env: &Env,
    client: &FlowLockEscrowClient,
    payer: &Address,
    provider: &Address,
    platform: &Address,
    token: &Address,
    delivery_deadline: u64,
    review_deadline: u64,
) -> u64 {
    let milestones = vec![
        env,
        default_milestone_input(env, provider, platform, delivery_deadline, review_deadline),
    ];
    client.create_agreement(payer, provider, token, platform, &milestones)
}

fn meta_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[1u8; 32])
}

// ==================== HAPPY PATH ====================

#[test]
fn test_happy_path_approve() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    let agreement = client.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Active);
    assert_eq!(agreement.milestone_count, 1);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Funded);

    client.submit_work(&id, &0u32, &meta_hash(&env));

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Submitted);

    client.approve_release(&id, &0u32);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Released);

    let agreement = client.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Completed);

    let token_client = TokenClient::new(&env, &token);
    let provider_bal = token_client.balance(&provider);
    let platform_bal = token_client.balance(&platform);
    assert!(provider_bal > 0);
    assert!(platform_bal > 0);
}

// ==================== AUTO-RELEASE BY KEEPER ====================

#[test]
fn test_auto_release_by_keeper() {
    let (env, _, payer, provider, platform, keeper, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);
    client.submit_work(&id, &0u32, &meta_hash(&env));

    env.ledger().set_timestamp(2001);

    client.execute_due(&id, &0u32, &keeper);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Released);

    let token_client = TokenClient::new(&env, &token);
    let keeper_bal = token_client.balance(&keeper);
    assert_eq!(keeper_bal, 10_000_000);

    let provider_bal = token_client.balance(&provider);
    assert!(provider_bal > 0);
}

// ==================== AUTO-REFUND BY KEEPER ====================

#[test]
fn test_auto_refund_by_keeper() {
    let (env, _, payer, provider, platform, keeper, token, client) = setup_env();

    let initial_balance = TokenClient::new(&env, &token).balance(&payer);

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    env.ledger().set_timestamp(1001);

    client.execute_due(&id, &0u32, &keeper);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Refunded);

    let final_balance = TokenClient::new(&env, &token).balance(&payer);
    assert_eq!(final_balance, initial_balance);
}

// ==================== DISPUTE + MUTUAL RESOLUTION ====================

#[test]
fn test_dispute_and_mutual_resolution() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);
    client.submit_work(&id, &0u32, &meta_hash(&env));

    let reason = BytesN::from_array(&env, &[2u8; 32]);
    client.request_dispute(&id, &0u32, &reason, &payer);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Disputed);

    // 50/50 resolution
    client.resolve_by_mutual_agreement(&id, &0u32, &5_000u32);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::MutualResolution);

    let token_client = TokenClient::new(&env, &token);
    let provider_bal = token_client.balance(&provider);
    let payer_refund = token_client.balance(&payer);
    assert!(provider_bal > 0);
    assert!(payer_refund > 0);
}

// ==================== CANCEL UNFUNDED ====================

#[test]
fn test_cancel_unfunded() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.cancel_unfunded(&id, &payer);

    let agreement = client.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Cancelled);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Cancelled);
}

// ==================== PERMISSION ERRORS ====================

#[test]
#[should_panic]
fn test_provider_cannot_fund() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();
    let env2 = Env::default();
    // Don't mock auths — let it fail
    let contract_id = env2.register(FlowLockEscrow, ());
    let client2 = FlowLockEscrowClient::new(&env2, &contract_id);

    let payer2 = Address::generate(&env2);
    let provider2 = Address::generate(&env2);
    let platform2 = Address::generate(&env2);
    let token_admin = Address::generate(&env2);
    let token2 = env2.register_stellar_asset_contract_v2(token_admin.clone());
    let sac = StellarAssetClient::new(&env2, &token2.address());
    sac.mint(&payer2, &100_000_000_000);

    // This will panic because provider tries to call fund (payer.require_auth fails)
    let milestones = vec![
        &env2,
        default_milestone_input(&env2, &provider2, &platform2, 1000, 2000),
    ];
    let _ = client2.create_agreement(&payer2, &provider2, &token2.address(), &platform2, &milestones);
}

#[test]
fn test_unauthorized_cancel() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    let result = client.try_cancel_unfunded(&id, &provider);
    assert!(result.is_err());
}

// ==================== STATE ERRORS ====================

#[test]
fn test_fund_twice_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    let result = client.try_fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);
    assert!(result.is_err());
}

#[test]
fn test_submit_without_fund_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    let result = client.try_submit_work(&id, &0u32, &meta_hash(&env));
    assert!(result.is_err());
}

#[test]
fn test_approve_without_submit_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    let result = client.try_approve_release(&id, &0u32);
    assert!(result.is_err());
}

// ==================== VALIDATION ERRORS ====================

#[test]
fn test_splits_not_10000_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let milestones = vec![
        &env,
        MilestoneInput {
            amount: 1_000_000_000,
            delivery_deadline: 1000,
            review_deadline: 2000,
            splits: vec![
                &env,
                Split {
                    recipient: provider.clone(),
                    bps: 5_000,
                },
                Split {
                    recipient: platform.clone(),
                    bps: 4_000,
                },
            ],
            keeper_bounty: 10_000_000,
        },
    ];

    let result = client.try_create_agreement(&payer, &provider, &token, &platform, &milestones);
    assert!(result.is_err());
}

#[test]
fn test_amount_zero_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let milestones = vec![
        &env,
        MilestoneInput {
            amount: 0,
            delivery_deadline: 1000,
            review_deadline: 2000,
            splits: vec![
                &env,
                Split {
                    recipient: provider.clone(),
                    bps: 10_000,
                },
            ],
            keeper_bounty: 0,
        },
    ];

    let result = client.try_create_agreement(&payer, &provider, &token, &platform, &milestones);
    assert!(result.is_err());
}

#[test]
fn test_payer_equals_provider_fails() {
    let (env, _, payer, _, platform, _, token, client) = setup_env();

    let milestones = vec![
        &env,
        default_milestone_input(&env, &payer, &platform, 1000, 2000),
    ];

    let result = client.try_create_agreement(&payer, &payer, &token, &platform, &milestones);
    assert!(result.is_err());
}

#[test]
fn test_deadline_in_past_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    env.ledger().set_timestamp(5000);

    let milestones = vec![
        &env,
        default_milestone_input(&env, &provider, &platform, 100, 200),
    ];

    let result = client.try_create_agreement(&payer, &provider, &token, &platform, &milestones);
    assert!(result.is_err());
}

// ==================== EDGE CASES ====================

#[test]
fn test_execute_due_before_deadline_fails() {
    let (env, _, payer, provider, platform, keeper, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    env.ledger().set_timestamp(500);

    let result = client.try_execute_due(&id, &0u32, &keeper);
    assert!(result.is_err());
}

#[test]
fn test_double_execute_due_fails() {
    let (env, _, payer, provider, platform, keeper, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    env.ledger().set_timestamp(1001);

    client.execute_due(&id, &0u32, &keeper);

    let result = client.try_execute_due(&id, &0u32, &keeper);
    assert!(result.is_err());
}

#[test]
fn test_split_rounding() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let milestones = vec![
        &env,
        MilestoneInput {
            amount: 1_000_000_001, // odd amount
            delivery_deadline: 1000,
            review_deadline: 2000,
            splits: vec![
                &env,
                Split {
                    recipient: provider.clone(),
                    bps: 3_333,
                },
                Split {
                    recipient: platform.clone(),
                    bps: 3_333,
                },
                Split {
                    recipient: Address::generate(&env),
                    bps: 3_334,
                },
            ],
            keeper_bounty: 1,
        },
    ];

    let id = client.create_agreement(&payer, &provider, &token, &platform, &milestones);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_001i128);
    client.submit_work(&id, &0u32, &meta_hash(&env));
    client.approve_release(&id, &0u32);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Released);
}

#[test]
fn test_multiple_milestones() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let milestones = vec![
        &env,
        default_milestone_input(&env, &provider, &platform, 1000, 2000),
        default_milestone_input(&env, &provider, &platform, 3000, 4000),
    ];

    let id = client.create_agreement(&payer, &provider, &token, &platform, &milestones);

    let agreement = client.get_agreement(&id);
    assert_eq!(agreement.milestone_count, 2);

    // Fund and complete first milestone
    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);
    client.submit_work(&id, &0u32, &meta_hash(&env));
    client.approve_release(&id, &0u32);

    let agreement = client.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Active);

    // Fund and complete second milestone
    client.fund_with_settlement_asset(&id, &1u32, &1_000_000_000i128);
    client.submit_work(&id, &1u32, &meta_hash(&env));
    client.approve_release(&id, &1u32);

    let agreement = client.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Completed);
}

#[test]
fn test_submit_after_delivery_deadline_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    env.ledger().set_timestamp(1001);

    let result = client.try_submit_work(&id, &0u32, &meta_hash(&env));
    assert!(result.is_err());
}

#[test]
fn test_cancel_funded_agreement_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);

    let result = client.try_cancel_unfunded(&id, &payer);
    assert!(result.is_err());
}

#[test]
fn test_too_many_milestones_fails() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let milestones = vec![
        &env,
        default_milestone_input(&env, &provider, &platform, 1000, 2000),
        default_milestone_input(&env, &provider, &platform, 1000, 2000),
        default_milestone_input(&env, &provider, &platform, 1000, 2000),
        default_milestone_input(&env, &provider, &platform, 1000, 2000),
        default_milestone_input(&env, &provider, &platform, 1000, 2000),
        default_milestone_input(&env, &provider, &platform, 1000, 2000),
    ];

    let result = client.try_create_agreement(&payer, &provider, &token, &platform, &milestones);
    assert!(result.is_err());
}

#[test]
fn test_dispute_by_provider() {
    let (env, _, payer, provider, platform, _, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);
    client.submit_work(&id, &0u32, &meta_hash(&env));

    let reason = BytesN::from_array(&env, &[3u8; 32]);
    client.request_dispute(&id, &0u32, &reason, &provider);

    let m = client.get_milestone(&id, &0u32);
    assert_eq!(m.status, MilestoneStatus::Disputed);
}

#[test]
fn test_dispute_by_unauthorized_fails() {
    let (env, _, payer, provider, platform, keeper, token, client) = setup_env();

    let id = create_default_agreement(&env, &client, &payer, &provider, &platform, &token, 1000, 2000);

    client.fund_with_settlement_asset(&id, &0u32, &1_000_000_000i128);
    client.submit_work(&id, &0u32, &meta_hash(&env));

    let reason = BytesN::from_array(&env, &[3u8; 32]);
    let result = client.try_request_dispute(&id, &0u32, &reason, &keeper);
    assert!(result.is_err());
}
