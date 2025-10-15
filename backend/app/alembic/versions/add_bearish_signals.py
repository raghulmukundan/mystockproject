"""add bearish signals

Revision ID: add_bearish_signals
Revises:
Create Date: 2025-01-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_bearish_signals'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Add bearish signal columns to weekly_signals_hist table
    op.execute("""
        ALTER TABLE weekly_signals_hist
        ADD COLUMN IF NOT EXISTS below_30w_ma BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS macd_w_cross_down BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS stack_broken BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS rsi14w_lt_50 BOOLEAN DEFAULT FALSE
    """)

    # Add bearish signal columns to weekly_signals_latest table
    op.execute("""
        ALTER TABLE weekly_signals_latest
        ADD COLUMN IF NOT EXISTS below_30w_ma BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS macd_w_cross_down BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS stack_broken BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS rsi14w_lt_50 BOOLEAN DEFAULT FALSE
    """)

    # Add bearish signal columns to daily_signals table
    op.execute("""
        ALTER TABLE daily_signals
        ADD COLUMN IF NOT EXISTS below_200_sma BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS macd_cross_down BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS rsi_cross_50_down BOOLEAN DEFAULT FALSE
    """)

    # Add composite weakening flag (any bearish signal present)
    op.execute("""
        ALTER TABLE weekly_signals_latest
        ADD COLUMN IF NOT EXISTS is_weakening BOOLEAN GENERATED ALWAYS AS (
            below_30w_ma OR macd_w_cross_down OR stack_broken OR rsi14w_lt_50
        ) STORED
    """)

    op.execute("""
        ALTER TABLE daily_signals
        ADD COLUMN IF NOT EXISTS is_weakening_daily BOOLEAN GENERATED ALWAYS AS (
            below_200_sma OR macd_cross_down OR rsi_cross_50_down
        ) STORED
    """)


def downgrade():
    # Remove bearish signal columns
    op.execute("""
        ALTER TABLE weekly_signals_hist
        DROP COLUMN IF EXISTS below_30w_ma,
        DROP COLUMN IF EXISTS macd_w_cross_down,
        DROP COLUMN IF EXISTS stack_broken,
        DROP COLUMN IF EXISTS rsi14w_lt_50
    """)

    op.execute("""
        ALTER TABLE weekly_signals_latest
        DROP COLUMN IF EXISTS is_weakening,
        DROP COLUMN IF EXISTS below_30w_ma,
        DROP COLUMN IF EXISTS macd_w_cross_down,
        DROP COLUMN IF EXISTS stack_broken,
        DROP COLUMN IF EXISTS rsi14w_lt_50
    """)

    op.execute("""
        ALTER TABLE daily_signals
        DROP COLUMN IF EXISTS is_weakening_daily,
        DROP COLUMN IF EXISTS below_200_sma,
        DROP COLUMN IF EXISTS macd_cross_down,
        DROP COLUMN IF EXISTS rsi_cross_50_down
    """)
