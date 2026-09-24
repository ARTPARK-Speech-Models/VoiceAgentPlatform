"""add ban_status to users

Revision ID: d3a8e6f1c402
Revises: b7e2c4d19a31
Create Date: 2026-09-24 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd3a8e6f1c402'
down_revision: str | None = 'b7e2c4d19a31'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NULL/empty = good standing; any text = banned (the text is the reason).
    op.add_column('users', sa.Column('ban_status', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'ban_status')
