from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Any

class WorkspaceCreate(BaseModel):
    name: str
    theme: str

class WorkspaceImport(BaseModel):
    model_config = ConfigDict(validate_by_name=True)

    source_path: str = Field(..., alias="sourcePath")
    name: Optional[str] = None
    theme: Optional[str] = None

class WorkspaceModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    theme: str
    created_at: str
    last_modified_at: str

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
