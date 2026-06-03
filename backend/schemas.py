from pydantic import BaseModel
from typing import Optional, List, Any

class WorkspaceCreate(BaseModel):
    name: str
    theme: str

class WorkspaceModel(BaseModel):
    id: str
    name: str
    theme: str
    created_at: str
    last_modified_at: str

    class Config:
        orm_mode = True
        from_attributes = True

class WorkspaceResponse(BaseModel):
    success: bool
    data: WorkspaceModel

class WorkspaceListResponse(BaseModel):
    success: bool
    data: List[WorkspaceModel]

class JobModel(BaseModel):
    id: str
    workspace_id: str
    stage: str
    status: str
    progress: str
    stage_index: int
    payload: Optional[Any] = None
    result: Optional[Any] = None
    message: Optional[str] = None
    created_at: float

class JobResponse(BaseModel):
    success: bool
    data: Optional[JobModel] = None

class FeedbackRequest(BaseModel):
    message: str
    agent_role: Optional[str] = "world_builder"

class ApproveRequest(BaseModel):
    modifications: Optional[Any] = None
