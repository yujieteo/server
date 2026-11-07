from dataclasses import dataclass

from pptx.opc.packuri import PackURI

class OpcPackage: ...

@dataclass
class Part:
    partname: PackURI
    content_type: str
    package: OpcPackage
    blob: bytes | None = None
