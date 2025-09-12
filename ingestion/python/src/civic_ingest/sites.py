from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Site:
    key: str
    name: str
    base_url: str
    committee: str
    default_doc_type: str = "minutes"


SITES: List[Site] = [
    Site(
        key="sfbos_lut",
        name="SF Board of Supervisors – Land Use and Transportation",
        base_url="https://sfbos.org/meetings/land-use-and-transportation-committee",
        committee="Land Use and Transportation",
        default_doc_type="minutes",
    ),
]

def get_site(key: str) -> Site:
    for s in SITES:
        if s.key == key:
            return s
    raise KeyError(f"Unknown site key: {key}")

