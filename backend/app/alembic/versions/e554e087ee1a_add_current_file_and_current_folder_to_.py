"""Add current_file and current_folder to ImportJob

Revision ID: e554e087ee1a
Revises: de341b361e26
Create Date: 2025-09-08 16:16:23.940723

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e554e087ee1a'
down_revision = 'de341b361e26'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add current_file and current_folder columns to import_jobs table
    op.add_column('import_jobs', sa.Column('current_file', sa.String(), nullable=True))
    op.add_column('import_jobs', sa.Column('current_folder', sa.String(), nullable=True))


def downgrade() -> None:
    # Remove current_file and current_folder columns from import_jobs table
    op.drop_column('import_jobs', 'current_folder')
    op.drop_column('import_jobs', 'current_file')