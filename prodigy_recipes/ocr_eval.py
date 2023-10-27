import json
import os
import re
import unicodedata
from pathlib import Path

import prodigy
from prodigy.components.loaders import JSONL
from prodigy.util import get_config


def get_unicode_name(grapheme: str) -> str:
    return " + ".join(unicodedata.name(c).title() for c in grapheme)


UNCERTAINTY_DELIMITER_PAT = re.compile(r"🤔?⟅(.+?)⟆")
config = get_config()
SPECIAL_CHARACTERS = (
    config["keyboard"]
    if "keyboard" in config
    else [
        "ſ",
        "ā",
        "ē",
        "ī",
        "ō",
        "ū",
        "n̄",
        "m̄",
        "p̄",
        "t̄",
        "q̄",
        "q̈",
        "Ā",
        "Ē",
        "Ī",
        "Ō",
        "Ū",
        "aͤ",
        "oͤ",
        "uͤ",
        "Aͤ",
        "Oͤ",
        "Uͤ",
        "ꝗ",
        "q́",
        "å",
        "ů",
        "ꝛ",
        "⁊",
        "Æ",
        "Œ",
        "æ",
        "œ",
        "ë",
        "ↄ",
        "ę",
        "｢",
        "｣",
        "⁰",
        "¹",
        "²",
        "³",
        "⁴",
        "⁵",
        "⁶",
        "⁷",
        "⁸",
        "⁹",
        "⸗",
        "—",
        "‹",
        "›",
        "»",
        "«",
        "„",
        "”",
        "’",
        "£",
        "§",
        "†",
        "½",
        "¼",
        "¾",
        "⅓",
        "⅔",
        "⅕",
        "⅖",
        "⅗",
        "⅘",
        "⅙",
        "⅐",
        "⅚",
        "⅛",
        "⅜",
        "⅝",
        "⅞",
        "⅑",
        "⅒",
        "Α",
        "Δ",
        "Κ",
        "Π",
        "Σ",
        "ά",
        "έ",
        "ή",
        "ί",
        "α",
        "β",
        "γ",
        "δ",
        "ε",
        "ζ",
        "η",
        "θ",
        "ι",
        "κ",
        "λ",
        "μ",
        "ν",
        "ξ",
        "ο",
        "π",
        "ρ",
        "ς",
        "σ",
        "τ",
        "υ",
        "φ",
        "χ",
        "ψ",
        "ω",
        "ό",
        "ύ",
        "ώ",
        "ϑ",
        "ϰ",
        "ϱ",
    ]
)
GLOBAL_CSS = """
.prodigy-container {
    width: fit-content;
}

input#transcription {
    font-family: monospace;
}

#transcription-warnings {
    margin-top: -1em;
}

.transcription-warning {
    font-size: 1.25em;
    text-align: left;
}

.character-picker {
    text-aligns: center;
    font-size: 1.25em;
    height: 136px;
    overflow-y: scroll;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(54px, 1fr));
    grid-template-rows: repeat(auto-fit, minmax(54px, 1fr));
    grid-gap: 4px;
    justify-content: center;
}

.character-picker .character {
  all: unset;
  display:inline-block;
  width:50px;
  height:50px;
  margin: 3px;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0px 1px 3px 1px rgba(0, 0, 0, 0.5);
  font: 30px/50px 'Lato', "Trebuchet MS", Roboto, Helvetica, Arial, sans-serif;
  text-align: center;
  color: #444;
}

.character-picker .character:hover {
    background: #eee;
    cursor: pointer;
}

.character-picker .character:active {
    background: #ddd;
}

.btn-container {
    display: flex;
    justify-content: space-between;
    margin-bottom: -1em;
}

.btn-container button {
    padding: 8px !important;
    text-transform: none !important;
}

.btn-container button:disabled {
    opacity: 0.5;
    cursor: default;
}

.prodigy-container {
    padding-top: 2em;
}

.context-container {
    display: flex;
    flex-direction: column;
    line-height: 1 !important;
    white-space: normal;
}

.prodigy-content {
    margin-top: -3em;
}

.viewer-link {
    width: 100%;
    font-size: 0.5em;
    margin-top: 0.25em;
    margin-bottom: 0.25em !important;
    text-align: left;
}
"""
HTML_TEMPLATE = f"""
<div class="context-container">
    <p class="viewer-link">
        <a id="viewer-anchor"
           href=""
           target="_blank">Seite im Viewer öffnen</a>
    </p>
    <svg viewBox="0 0 {{{{context_area.width}}}} {{{{context_area.height}}}}" style="width: min(100%, {{{{context_area.width}}}}px)">
        <defs>
            <mask id="highlight-mask">
                <!-- transparent shape that matches the area to highlight -->
                <rect x="0" y="0" width="{{{{context_area.width}}}}" height="{{{{context_area.height}}}}" fill="white" />
                <rect x="{{{{line_area.x}}}}"
                    y="{{{{line_area.y}}}}"
                    width="{{{{line_area.width}}}}"
                    height="{{{{line_area.height}}}}"
                    fill="black" />
            </mask>
        </defs>
        <a onclick="showFullScreenLineModal()" style="cursor: pointer;">
            <image xlink:href="{{{{context_image_url}}}}" />
            <rect x="0"
                y="0"
                width="{{{{context_area.width}}}}"
                height="{{{{context_area.height}}}}"
                mask="url(#highlight-mask)"
                fill="black"
                opacity="0.5" />
        </a>
    </svg>
</div>
<div class="btn-container">
    <button class="keyboard-toggle" onclick="toggleCharacterPicker()" title="Hilfstastatur">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 576 512"><!--! Font Awesome Pro 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path d="M64 64C28.7 64 0 92.7 0 128V384c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm16 64h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16zM64 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V240zm16 80h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V336c0-8.8 7.2-16 16-16zm80-176c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V144zm16 80h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V240c0-8.8 7.2-16 16-16zM160 336c0-8.8 7.2-16 16-16H400c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V336zM272 128h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H272c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16zM256 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H272c-8.8 0-16-7.2-16-16V240zM368 128h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H368c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16zM352 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H368c-8.8 0-16-7.2-16-16V240zM464 128h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H464c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16zM448 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H464c-8.8 0-16-7.2-16-16V240zm16 80h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H464c-8.8 0-16-7.2-16-16V336c0-8.8 7.2-16 16-16z"/></svg>
    </button>
    <button id="fix-long-s-btn" onclick="fixLongS()" title="Alle 's' zu 'ſ' korrigieren" disabled>
        s→ſ
     </button>
     <button id="fix-umlauts-btn" onclick="fixUmlauts()" title="Alle Umlaute zu historischen Formen korrigieren" disabled>
        ä→aͤ
     </button>
    <button class="uncertainty-btn"
            onclick="insertUncertaintyMarker()"
            title="Selektion als unsicher markieren">
        🤔
    </button>
</div>
<div class="character-picker" style="display: none;">
{''.join(f'<button onclick="insertGrapheme(this.dataset.char)" class="character" title="{get_unicode_name(c)}" data-char="{c}">{c}</button>' for c in SPECIAL_CHARACTERS)}
</div>
"""


def before_db(examples: list[dict]) -> list[dict]:
    """Unify uncertainty markers to their original format.

    We decided to not show the emoji in the UI, since it breaks our input background
    highlighting approach. Instead, we add the emoji before saving to the database.
    """
    for ex in examples:
        # Remove, since this is just a dummy blank string
        del ex["html"]
        ex["transcription"] = UNCERTAINTY_DELIMITER_PAT.sub(
            r"🤔⟅\1⟆", ex["transcription"], count=0
        )
    return examples


@prodigy.recipe("ocr-eval")
def ocr_eval(dataset: str, tasks_jsonl: str):
    def get_stream():
        src = JSONL(tasks_jsonl)
        for task in src:
            line_hash = "-".join(
                (
                    task["volume_id"],
                    f"{task['page_num']:05d}",
                    str(task["context_area"]["x"] + task["line_area"]["x"]),
                    str(task["context_area"]["y"] + task["line_area"]["y"]),
                    str(task["line_area"]["width"]),
                    str(task["line_area"]["height"]),
                )
            )
            yield {**task, "html": " ", "line_hash": line_hash}

    return {
        "view_id": "blocks",
        "dataset": dataset,
        "stream": (
            prodigy.set_hashes(ex, input_keys={"line_hash"}) for ex in get_stream()
        ),
        "before_db": before_db,
        "config": {
            "blocks": [
                {
                    "view_id": "html",
                    "html_template": HTML_TEMPLATE,
                },
                {
                    "view_id": "text_input",
                    "field_id": "transcription",
                    "field_label": "Transkription",
                    "field_rows": 1,
                    "field_autofocus": False,
                },
            ],
            "javascript": (Path(__file__).parent / "./ocr_eval.js")
            .read_text()
            .replace(
                "__allowed_named_sessions__",
                json.dumps(os.environ.get("PRODIGY_POSSIBLE_SESSIONS", "").split(",")),
            ),
            "global_css": GLOBAL_CSS,
        },
    }
