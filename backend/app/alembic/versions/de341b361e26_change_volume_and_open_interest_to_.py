"""Change volume and open_interest to BigInteger

Revision ID: de341b361e26
Revises: 002_create_alerts_table
Create Date: 2025-09-08 15:58:53.049972

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'de341b361e26'
down_revision = '002_create_alerts_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change volume column from integer to bigint in historical_prices table
    op.execute("ALTER TABLE historical_prices ALTER COLUMN volume TYPE BIGINT")
    op.execute("ALTER TABLE historical_prices ALTER COLUMN open_interest TYPE BIGINT")


def downgrade() -> None:
    # Revert bigint columns back to integer (with potential data loss warning)
    op.execute("ALTER TABLE historical_prices ALTER COLUMN volume TYPE INTEGER")
    op.execute("ALTER TABLE historical_prices ALTER COLUMN open_interest TYPE INTEGER")