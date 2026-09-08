from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote

from bs4 import BeautifulSoup

from school_intel.domain.schemas import SarasDirectoryRow

_AFFILIATION_RE = re.compile(r"Aff\.\s*No\.\s*:\s*(\S+)", re.I)
_SCHOOL_CODE_RE = re.compile(r"Sch\.\s*Code:\s*(\S+)", re.I)
_STATE_RE = re.compile(r"State\s*:\s*([^<]+?)(?:\s*District\s*:|$)", re.I)
_DISTRICT_RE = re.compile(r"District\s*:\s*([^<]+)", re.I)
_NAME_RE = re.compile(r"Name\s*:\s*(.+?)(?:Head/Principal Name:|$)", re.I)
_HEAD_RE = re.compile(r"Head/Principal Name:\s*(.+)", re.I)
_ADDRESS_RE = re.compile(r"Address\s*:\s*(.+?)(?:Website\s*:|$)", re.I)
_WEBSITE_RE = re.compile(r"Website\s*:\s*(\S+)", re.I)


class SarasParser:
    """Parse SARAS directory HTML and affiliation detail pages."""

    version = "1.0.0"

    def parse_directory_html(self, html: str) -> tuple[list[SarasDirectoryRow], list[str]]:
        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table", {"id": "myTable"}) or soup.find("table")
        if not table:
            return [], ["no_table_found"]

        rows: list[SarasDirectoryRow] = []
        errors: list[str] = []
        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 7:
                continue
            try:
                rows.append(self._parse_directory_row(tr, cells))
            except Exception as exc:
                errors.append(str(exc))
        return rows, errors

    def _parse_directory_row(self, tr, cells) -> SarasDirectoryRow:
        cell_texts = [c.get_text(" ", strip=True) for c in cells]
        aff_cell = cells[1].get_text(" ", strip=True)
        aff_match = _AFFILIATION_RE.search(aff_cell)
        code_match = _SCHOOL_CODE_RE.search(aff_cell)
        affiliation_number = (aff_match.group(1) if aff_match else "").strip()
        if not affiliation_number:
            raise ValueError(f"missing_affiliation: {aff_cell[:80]}")

        loc_text = cells[2].get_text(" ", strip=True)
        state_match = re.search(r"State\s*:\s*([^:]+?)(?:\s*District\s*:|$)", loc_text, re.I)
        district_match = re.search(r"District\s*:\s*(.+)", loc_text, re.I)

        school_text = cells[4].get_text(" ", strip=True)
        name_match = re.search(r"Name\s*:\s*(.+?)(?:Head/Principal Name:|$)", school_text, re.I)
        head_match = re.search(r"Head/Principal Name:\s*(.+)", school_text, re.I)

        addr_text = cells[5].get_text(" ", strip=True)
        address_match = re.search(r"Address\s*:\s*(.+?)(?:Website\s*:|$)", addr_text, re.I)
        website_match = re.search(r"Website\s*:\s*(\S+)", addr_text, re.I)

        detail_url = None
        for a in tr.find_all("a", href=True):
            href = a["href"]
            if "AfflicationDetails" in href:
                detail_url = unquote(href).strip()
                break

        serial = None
        try:
            serial = int(cell_texts[0])
        except (TypeError, ValueError):
            pass

        return SarasDirectoryRow(
            serial_no=serial,
            affiliation_number=affiliation_number,
            school_code=code_match.group(1).strip() if code_match else None,
            school_name=(name_match.group(1).strip() if name_match else cell_texts[4]),
            state=state_match.group(1).strip() if state_match else None,
            district=district_match.group(1).strip() if district_match else None,
            status=cell_texts[3] if len(cell_texts) > 3 else None,
            head_name=head_match.group(1).strip() if head_match else None,
            address_line=address_match.group(1).strip() if address_match else None,
            website=website_match.group(1).strip() if website_match else None,
            detail_url=detail_url,
            raw_cells=cell_texts,
        )

    def parse_detail_html(self, html: str) -> dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")
        fields: dict[str, Any] = {}
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 2:
                continue
            key = tds[0].get_text(" ", strip=True)
            value = tds[1].get_text(" ", strip=True)
            if key:
                fields[key] = value
        return fields
