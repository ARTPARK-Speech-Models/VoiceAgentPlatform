"""add user_api_keys table

Revision ID: b7e2c4d19a31
Revises: fab61927588e
Create Date: 2026-09-23 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2c4d19a31'
down_revision: Union[str, None] = 'fab61927588e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('user_api_keys',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_username', sa.String(), nullable=False),
    sa.Column('provider', sa.String(), nullable=False),
    sa.Column('api_key', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['user_username'], ['users.username'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_username', 'provider', name='uq_user_api_key_user_provider')
    )
    op.create_index(op.f('ix_user_api_keys_id'), 'user_api_keys', ['id'], unique=False)
    op.create_index(op.f('ix_user_api_keys_user_username'), 'user_api_keys', ['user_username'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_api_keys_user_username'), table_name='user_api_keys')
    op.drop_index(op.f('ix_user_api_keys_id'), table_name='user_api_keys')
    op.drop_table('user_api_keys')
