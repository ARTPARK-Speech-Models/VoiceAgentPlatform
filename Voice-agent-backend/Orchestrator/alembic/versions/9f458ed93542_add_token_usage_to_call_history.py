"""add token_usage to call_history

Revision ID: 9f458ed93542
Revises: 4323d8b312e4
Create Date: 2026-09-17 16:59:13.336418

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f458ed93542'
down_revision: Union[str, None] = '4323d8b312e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('call_history', sa.Column('token_usage', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('call_history', 'token_usage')
