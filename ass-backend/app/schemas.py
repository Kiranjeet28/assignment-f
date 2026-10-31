from typing import Literal

from pydantic import BaseModel, Field, model_validator


QuestionType = Literal["mcq", "short_answer", "true_false", "fill_blank"]
Difficulty = Literal["easy", "medium", "hard"]


class PageSize(BaseModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    unit: Literal["px"] = "px"


class PageInput(BaseModel):
    page_number: int = Field(default=1, ge=1)
    page_image_url: str = Field(min_length=1, description="Base64 image data URL from /api/upload")
    page_size: PageSize


class GenerateRequest(BaseModel):
    pages: list[PageInput] = Field(min_length=1, max_length=30)
    question_count: int = Field(default=8, ge=1, le=30)
    question_types: list[QuestionType] = Field(min_length=1, 
        default_factory=lambda: ["mcq", "short_answer", "true_false", "fill_blank"]
    )
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "mixed"
    include_activities: bool = False


class Question(BaseModel):
    type: QuestionType
    question: str = Field(min_length=5)
    options: list[str] | None = None
    answer: str = Field(min_length=1)
    difficulty: Difficulty
    source_sentence: str = Field(min_length=5)

    @model_validator(mode="after")
    def validate_options(self):
        if self.type == "mcq" and (self.options is None or len(self.options) != 4):
            raise ValueError("MCQ questions require exactly four options")
        if self.type != "mcq" and self.options not in (None, []):
            raise ValueError("Only MCQs can include options")
        return self


class QuestionSet(BaseModel):
    questions: list[Question]


class TextBlock(BaseModel):
    page: int
    text: str
    bbox: dict[str, float]
    tag: Literal["paragraph", "heading", "callout", "activity"] = "paragraph"
    optional: bool = False


class SkippedRegion(BaseModel):
    page: int
    bbox: dict[str, float]
    type: Literal["photo", "map", "diagram", "image", "caption", "activity"]
    caption: str | None = None
    reason: str


class ProcessedPage(BaseModel):
    page_number: int
    page_size: PageSize
    page_image_url: str
    extracted_text: str
    blocks: list[TextBlock]
    words: list[dict]
    skipped_regions: list[SkippedRegion]

