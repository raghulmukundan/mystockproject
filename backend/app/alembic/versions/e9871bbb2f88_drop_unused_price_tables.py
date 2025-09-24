"""drop_unused_price_tables

Revision ID: e9871bbb2f88
Revises: e554e087ee1a
Create Date: 2025-09-23 22:22:57.025390

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e9871bbb2f88'
down_revision = 'e554e087ee1a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop unused price tables
    # These tables were replaced by prices_realtime_cache and prices_daily_ohlc

    # Check if tables exist before dropping
    connection = op.get_bind()

    # Drop current_prices table if exists
    connection.execute(sa.text("""
        DROP TABLE IF EXISTS current_prices CASCADE;
    """))

    # Drop prices_daily table if exists (replaced by prices_daily_ohlc)
    connection.execute(sa.text("""
        DROP TABLE IF EXISTS prices_daily CASCADE;
    """))

    # Drop cached_prices table if exists (replaced by prices_realtime_cache)
    connection.execute(sa.text("""
        DROP TABLE IF EXISTS cached_prices CASCADE;
    """))


def downgrade() -> None:
    # Note: We cannot recreate the dropped tables as we don't have their schema
    # This is a one-way migration to clean up unused tables
    # If you need to rollback, you would need to recreate the tables manually
    pass