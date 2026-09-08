"""Verified CBSE SARAS endpoint paths (SARAS 7.0)."""

SARAS_BASE_URL = "https://saras.cbse.gov.in"
SARAS_DIRECTORY_PATH = "/saras/AffiliatedList/ListOfSchdirReport"
SARAS_DETAIL_PATH = "/saras/AffiliatedList/AfflicationDetails/{affiliation_number}"
SARAS_DISTRICT_BIND_PATH = "/saras/AffiliatedList/Dist_Bind"

PARSER_VERSION = "1.0.0"

# State IDs discovered from live SARAS form (value -> label in <select id="State">)
# Collection iterates these for state-wise directory download.
KNOWN_STATE_IDS = [
    "25", "1", "22", "2", "3", "26", "33", "30", "31", "27", "50", "28", "4", "5", "6",
    "7", "34", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
    "21", "23", "24", "29", "32", "35", "36", "37", "38", "39", "40", "41", "42", "43",
    "44", "45", "46", "47", "48", "49", "51", "52",
]
