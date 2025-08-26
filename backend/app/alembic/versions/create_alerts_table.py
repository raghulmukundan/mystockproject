"""create alerts table

Revision ID: 002_create_alerts_table
Revises: 001_add_company_profile_fields
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_create_alerts_table'
down_revision = '001_add_company_profile_fields'
branch_labels = None
depends_on = None

def upgrade():
    # Create enum types
    alert_type_enum = sa.Enum(
        'sector_concentration',
        'high_correlation', 
        'volatility_spike',
        'volume_anomaly',
        'price_target_breach',
        'portfolio_risk',
        'performance_outlier',
        'diversification_warning',
        name='alerttype'
    )
    
    alert_severity_enum = sa.Enum(
        'low',
        'medium', 
        'high',
        'critical',
        name='alertseverity'
    )
    
    # Create alerts table
    op.create_table(
        'alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('alert_type', alert_type_enum, nullable=False),
        sa.Column('severity', alert_severity_enum, nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('watchlist_id', sa.Integer(), nullable=True),
        sa.Column('symbol', sa.String(length=10), nullable=True),
        sa.Column('value', sa.Float(), nullable=True),
        sa.Column('threshold', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('is_read', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('context_data', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for better query performance
    op.create_index('ix_alerts_id', 'alerts', ['id'])
    op.create_index('ix_alerts_alert_type', 'alerts', ['alert_type'])
    op.create_index('ix_alerts_severity', 'alerts', ['severity'])
    op.create_index('ix_alerts_watchlist_id', 'alerts', ['watchlist_id'])
    op.create_index('ix_alerts_symbol', 'alerts', ['symbol'])
    op.create_index('ix_alerts_is_active', 'alerts', ['is_active'])
    op.create_index('ix_alerts_is_read', 'alerts', ['is_read'])
    op.create_index('ix_alerts_created_at', 'alerts', ['created_at'])

def downgrade():
    # Drop indexes
    op.drop_index('ix_alerts_created_at', table_name='alerts')
    op.drop_index('ix_alerts_is_read', table_name='alerts')
    op.drop_index('ix_alerts_is_active', table_name='alerts')
    op.drop_index('ix_alerts_symbol', table_name='alerts')
    op.drop_index('ix_alerts_watchlist_id', table_name='alerts')
    op.drop_index('ix_alerts_severity', table_name='alerts')
    op.drop_index('ix_alerts_alert_type', table_name='alerts')
    op.drop_index('ix_alerts_id', table_name='alerts')
    
    # Drop table
    op.drop_table('alerts')
    
    # Drop enum types
    op.execute('DROP TYPE alertseverity')
    op.execute('DROP TYPE alerttype')