from collections.abc import Iterator
from dataclasses import dataclass
from typing import final, overload

def _pop(self: _Attrib, key: str, default: str | None = None) -> str | None: ...
@overload
def _get(self: Element, key: str) -> str | None: ...
@overload
def _get(self: Element, key: str, default: str) -> str: ...
def _set(self: Element, key: str, value: str) -> None: ...
def _iter(self: Element, tag: str | None = None) -> Iterator[Element]: ...
def _find(self: Element, path: str) -> Element | None: ...
def _addprevious(self: Element, element: Element) -> None: ...
def _dunder_iter(self: Element) -> Iterator[Element]: ...
def _dunder_len(self: Element) -> int: ...
def _dunder_getitem(self: Element, idx: int) -> Element: ...
def _append(self: Element, element: Element) -> None: ...
def _insert(self: Element, index: int, element: Element) -> None: ...
def _getroot(self: _ElementTree) -> Element: ...

@final
class _Attrib:
    pop = _pop

@final
class Element:
    attrib: _Attrib
    tag: str
    text: str | None
    tail: str | None
    get = _get
    set = _set
    iter = _iter
    find = _find
    addprevious = _addprevious
    __iter__ = _dunder_iter
    __len__ = _dunder_len
    __getitem__ = _dunder_getitem
    append = _append
    insert = _insert

_Element = Element

@dataclass
@final
class QName:
    text_or_uri_or_element: str
    localname: str = ""

@final
class _ElementTree:
    getroot = _getroot

def parse(source: str) -> _ElementTree: ...
def fromstring(text: bytes) -> Element: ...
def tostring(element: Element, *, xml_declaration: bool, encoding: str) -> bytes: ...
def _sub_element(
    parent: Element, tag: str, attrib: dict[str, str] | None = None, nsmap: dict[str, str] | None = None, **extra: str
) -> Element: ...

SubElement = _sub_element
