from sqlalchemy import Column, String, Float, Text
from .database import Base

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    theme = Column(Text, nullable=False)
    created_at = Column(String, nullable=False)
    last_modified_at = Column(String, nullable=False)

class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, index=True)
    workspace_id = Column(String, index=True, nullable=False)
    stage = Column(String, nullable=False)  # e.g., "world_building", "qa_audit"
    status = Column(String, nullable=False)  # e.g., "running", "pending_approval", "completed", "failed"
    progress = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=True)  # Json serialized string
    result_json = Column(Text, nullable=True)   # Json serialized string
    message = Column(Text, nullable=True)
    created_at = Column(Float, nullable=False)
