"""add latency_per_turn to call_history

Revision ID: 4323d8b312e4
Revises: a1f3c9d2b5e7
Create Date: 2026-09-17 08:54:55.171704

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4323d8b312e4'
down_revision: Union[str, None] = 'a1f3c9d2b5e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('call_history', sa.Column('latency_per_turn', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('call_history', 'latency_per_turn')
