from pydantic import BaseModel, Field


class {{pascal_name}}Payload(BaseModel):
    name: str = Field(..., description="Human-readable {{subject}} name")


class {{pascal_name}}Record({{pascal_name}}Payload):
    id: str
