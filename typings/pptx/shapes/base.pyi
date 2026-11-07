from lxml.etree import Element
from pptx.text.text import TextFrame

class BaseShape:
    name: str
    width: int
    height: int
    has_text_frame: bool
    text_frame: TextFrame
    element: Element
