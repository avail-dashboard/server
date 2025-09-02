-- Create validator-related views from existing event_data
-- This provides validator metrics without requiring a validators table

-- Basic validator count (simplified for analytics API)
CREATE OR REPLACE VIEW validator_counts AS
SELECT
    COUNT(DISTINCT ed.raw_data->'event'->'data'->>0) as total_validators,
    COUNT(DISTINCT CASE 
        WHEN ed.block_number >= (SELECT MAX(block_number) - 7200 FROM event_data LIMIT 1)
        THEN ed.raw_data->'event'->'data'->>0 
    END) as active_validators
FROM event_data ed
WHERE ed.pallet = 'staking' 
    AND ed.event_name = 'Rewarded'
    AND ed.raw_data->'event'->'data'->>0 IS NOT NULL;

-- Account transfer statistics (to replace account_profiles aggregations)
CREATE OR REPLACE VIEW account_transfer_stats AS
SELECT
    COALESCE(sent.account_id, received.account_id) as account_id,
    COALESCE(sent.transfers_sent, 0) as total_transfers_sent,
    COALESCE(received.transfers_received, 0) as total_transfers_received,
    COALESCE(sent.value_sent, 0) as total_value_sent,
    COALESCE(received.value_received, 0) as total_value_received
FROM (
    SELECT from_account as account_id, 
           COUNT(*) as transfers_sent, 
           SUM(amount::numeric) as value_sent
    FROM transfer_events 
    WHERE from_account IS NOT NULL
    GROUP BY from_account
) sent
FULL OUTER JOIN (
    SELECT to_account as account_id, 
           COUNT(*) as transfers_received, 
           SUM(amount::numeric) as value_received
    FROM transfer_events 
    WHERE to_account IS NOT NULL
    GROUP BY to_account
) received ON sent.account_id = received.account_id;

-- Create indexes on the underlying tables to improve view performance
CREATE INDEX IF NOT EXISTS idx_event_data_staking_rewards 
ON event_data (pallet, event_name, block_number) 
WHERE pallet = 'staking' AND event_name = 'Rewarded';

CREATE INDEX IF NOT EXISTS idx_event_data_staking_raw_data 
ON event_data USING GIN (raw_data) 
WHERE pallet = 'staking';

-- Success message
SELECT 'Validator views created successfully!' as status;