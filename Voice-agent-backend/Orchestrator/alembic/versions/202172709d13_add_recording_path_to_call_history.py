"""add recording_path to call_history

Revision ID: 202172709d13
Revises: 9f458ed93542
Create Date: 2026-09-17 18:46:26.734841

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '202172709d13'
down_revision: Union[str, None] = '9f458ed93542'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('call_history', sa.Column('recording_path', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('call_history', 'recording_path')
