from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Any

class WorkspaceCreate(BaseModel):
    name: str
    theme: str

class WorkspaceImport(BaseModel):
    # populate_by_name: accept both workspaceId and workspace_id
    model_config = ConfigDict(populate_by_name=True)

    # Either absolute/relative sourcePath, or a workspaceId under data/workspaces.
    source_path: Optional[str] = Field(default=None, alias="sourcePath")
    workspace_id: Optional[str] = Field(default=None, alias="workspaceId")
    name: Optional[str] = None
    theme: Optional[str] = None

class SelectDirectoryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    default_path: Optional[str] = Field(default=None, alias="defaultPath")

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
    department_id: Optional[str] = None

class ApproveRequest(BaseModel):
    modifications: Optional[Any] = None

