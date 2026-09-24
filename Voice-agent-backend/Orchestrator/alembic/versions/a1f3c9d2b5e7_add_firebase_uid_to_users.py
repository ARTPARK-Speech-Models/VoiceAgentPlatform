"""add firebase_uid to users

Revision ID: a1f3c9d2b5e7
Revises: 7c983ba172dc
Create Date: 2026-09-15 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1f3c9d2b5e7'
down_revision: str | None = '7c983ba172dc'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('firebase_uid', sa.String(), nullable=True))
    op.create_index(op.f('ix_users_firebase_uid'), 'users', ['firebase_uid'], unique=True)
    # Pre-Firebase rows keep their bcrypt hash (unused going forward);
    # new rows have no local password at all, so this can no longer be
    # NOT NULL.
    op.alter_column('users', 'password', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'password', existing_type=sa.String(), nullable=False)
    op.drop_index(op.f('ix_users_firebase_uid'), table_name='users')
    op.drop_column('users', 'firebase_uid')
