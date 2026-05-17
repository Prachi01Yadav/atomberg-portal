"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("employee", "manager", "admin", name="userrole"), nullable=False),
        sa.Column("manager_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("department", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "performance_cycles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("goal_setting_open", sa.Date(), nullable=False),
        sa.Column("q1_open", sa.Date(), nullable=False),
        sa.Column("q2_open", sa.Date(), nullable=False),
        sa.Column("q3_open", sa.Date(), nullable=False),
        sa.Column("q4_open", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("performance_cycles.id"), nullable=False),
        sa.Column("thrust_area", sa.String(128), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "uom_type",
            sa.Enum("numeric_min", "numeric_max", "timeline", "zero", name="uomtype"),
            nullable=False,
        ),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("weightage", sa.Float(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "submitted", "approved", "returned", "locked", name="goalstatus"),
            nullable=False,
        ),
        sa.Column("is_shared", sa.Boolean(), default=False),
        sa.Column("shared_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("primary_shared_goal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("goals.id"), nullable=True),
        sa.Column("blockchain_tx_hash", sa.String(128), nullable=True),
        sa.Column("blockchain_verified", sa.Boolean(), default=False),
        sa.Column("manager_return_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_goals_employee_cycle", "goals", ["employee_id", "cycle_id"])

    op.create_table(
        "quarterly_checkins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("goals.id"), nullable=False),
        sa.Column("quarter", sa.Enum("Q1", "Q2", "Q3", "Q4", name="quarter"), nullable=False),
        sa.Column("actual_value", sa.Float(), nullable=True),
        sa.Column("completion_date", sa.Date(), nullable=True),
        sa.Column(
            "goal_status",
            sa.Enum("not_started", "on_track", "completed", name="checkingoalstatus"),
            nullable=False,
        ),
        sa.Column("employee_notes", sa.Text(), nullable=True),
        sa.Column("manager_comment", sa.Text(), nullable=True),
        sa.Column("computed_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_checkins_goal_quarter", "quarterly_checkins", ["goal_id", "quarter"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("goals.id"), nullable=False),
        sa.Column("changed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("change_type", sa.String(64), nullable=False),
        sa.Column("field_changed", sa.String(128), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("blockchain_tx_hash", sa.String(128), nullable=True),
    )

    op.create_table(
        "escalation_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "rule_type",
            sa.Enum("goal_not_submitted", "goal_not_approved", "checkin_not_done", name="escalationruletype"),
            nullable=False,
        ),
        sa.Column("threshold_days", sa.Integer(), nullable=False),
        sa.Column(
            "notification_target",
            sa.Enum("employee", "manager", "hr", name="notificationtarget"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), default=True),
    )

    op.create_table(
        "escalation_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("escalation_rules.id")),
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("message", sa.String(512), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "shared_goal_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("primary_goal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("goals.id"), nullable=False),
        sa.Column("recipient_goal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("goals.id"), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("shared_goal_links")
    op.drop_table("escalation_logs")
    op.drop_table("escalation_rules")
    op.drop_table("audit_logs")
    op.drop_index("ix_checkins_goal_quarter", table_name="quarterly_checkins")
    op.drop_table("quarterly_checkins")
    op.drop_index("ix_goals_employee_cycle", table_name="goals")
    op.drop_table("goals")
    op.drop_table("performance_cycles")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
