"""add prompt_versions table

Revision ID: cfb737a29654
Revises: 202172709d13
Create Date: 2026-09-17 19:48:16.025685

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cfb737a29654'
down_revision: Union[str, None] = '202172709d13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('prompt_versions',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('agent_id', sa.Integer(), nullable=False),
    sa.Column('prompt_text', sa.String(), nullable=False),
    sa.Column('changed_by', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['agent_id'], ['custom_voice_agents.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_prompt_versions_id'), 'prompt_versions', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_prompt_versions_id'), table_name='prompt_versions')
    op.drop_table('prompt_versions')
