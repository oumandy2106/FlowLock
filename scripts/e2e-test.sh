#!/bin/bash
# FlowLock E2E Test Script
# Runs the full flow: create → fund → submit → keeper auto-release

set -e

STELLAR="$HOME/.cargo/bin/stellar"
CONTRACT_ID="CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV"
BACKEND_URL="http://localhost:3001"

# Get addresses
ALICE=$($STELLAR keys address alice)
BOB=$($STELLAR keys address bob)
PLATFORM=$($STELLAR keys address platform)
KEEPER=$($STELLAR keys address keeper-bot)

echo "=== FlowLock E2E Test ==="
echo "Payer (alice):    $ALICE"
echo "Provider (bob):   $BOB"
echo "Platform:         $PLATFORM"
echo "Keeper:           $KEEPER"
echo "Contract:         $CONTRACT_ID"
echo ""

# Calculate deadlines: delivery in 120s, review in 180s from now
NOW=$(date +%s)
DELIVERY_DEADLINE=$((NOW + 120))
REVIEW_DEADLINE=$((NOW + 180))

echo "Current time:     $NOW"
echo "Delivery deadline: $DELIVERY_DEADLINE (in 120s)"
echo "Review deadline:   $REVIEW_DEADLINE (in 180s)"
echo ""

# Step 1: Create agreement on-chain
echo "=== Step 1: Creating agreement on-chain ==="
RESULT=$($STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account alice \
  --network testnet \
  -- \
  create_agreement \
  --payer $ALICE \
  --provider $BOB \
  --settlement_asset CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --platform $PLATFORM \
  --milestones "[{\"amount\": 10000000, \"delivery_deadline\": $DELIVERY_DEADLINE, \"review_deadline\": $REVIEW_DEADLINE, \"splits\": [{\"recipient\": \"$BOB\", \"bps\": 9000}, {\"recipient\": \"$PLATFORM\", \"bps\": 1000}], \"keeper_bounty\": 100000}]" \
  2>&1) || true

echo "Create result: $RESULT"
echo ""

# Step 2: Get agreement to verify
echo "=== Step 2: Verify agreement on-chain ==="
$STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account alice \
  --network testnet \
  -- \
  get_agreement \
  --agreement_id 0 || echo "Agreement 0 not found, trying result ID"
echo ""

# Step 3: Deploy native token SAC for XLM if needed, then fund
echo "=== Step 3: Fund milestone with XLM ==="
$STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account alice \
  --network testnet \
  -- \
  fund_with_settlement_asset \
  --agreement_id 0 \
  --milestone_id 0 \
  --amount 10000000
echo ""
echo "Milestone funded!"

# Step 4: Submit work
echo "=== Step 4: Submit work ==="
$STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account bob \
  --network testnet \
  -- \
  submit_work \
  --agreement_id 0 \
  --milestone_id 0 \
  --metadata_hash 0101010101010101010101010101010101010101010101010101010101010101
echo ""
echo "Work submitted!"

# Step 5: Verify milestone status
echo "=== Step 5: Verify milestone status ==="
$STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account alice \
  --network testnet \
  -- \
  get_milestone \
  --agreement_id 0 \
  --milestone_id 0
echo ""

echo "=== Waiting for review deadline to pass... ==="
echo "Review deadline is at $REVIEW_DEADLINE"
echo "Will wait until then + 10s buffer"

WAIT_TIME=$((REVIEW_DEADLINE - $(date +%s) + 10))
if [ $WAIT_TIME -gt 0 ]; then
  echo "Waiting ${WAIT_TIME}s..."
  sleep $WAIT_TIME
fi

# Step 6: Keeper executes auto-release
echo "=== Step 6: Keeper executes auto-release ==="
$STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account keeper-bot \
  --network testnet \
  -- \
  execute_due \
  --agreement_id 0 \
  --milestone_id 0 \
  --caller $KEEPER
echo ""
echo "Auto-release executed!"

# Step 7: Final verification
echo "=== Step 7: Final verification ==="
echo "Agreement:"
$STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account alice \
  --network testnet \
  -- \
  get_agreement \
  --agreement_id 0

echo ""
echo "Milestone:"
$STELLAR contract invoke \
  --id $CONTRACT_ID \
  --source-account alice \
  --network testnet \
  -- \
  get_milestone \
  --agreement_id 0 \
  --milestone_id 0

echo ""
echo "=== E2E Test Complete ==="
