// Shared state that should persist across multiple tasks
const STATE = {
  currentTask: null,
  pickerOpen: false,
  inputInitialFontSize: null,
}

function hookIntoDOM() {
  const input = document.getElementById("transcription");
  if (!document.getElementById('transcription-warnings')) {
    const container = input.parentElement.parentElement;
    container.insertAdjacentHTML(
      'afterend',
      `<div class="prodigy-content"
            style="padding: 0 20px 20px 20px; margin-top: 0;">
        <div id="transcription-warnings"></div>
      </div>`)
  }
  input.addEventListener('input', evt => {
    adjustInputFontSize();
    highlightSpecialCharacters();
  });
  input.addEventListener('change', evt => {
    adjustInputFontSize();
    highlightSpecialCharacters();
  });

  // Update input font size and background when input is initialized
  adjustInputFontSize();
  highlightSpecialCharacters();

  // Update viewer link
  const viewerLink = document.getElementById('viewer-anchor');
  const { viewer_url } = window.prodigy.content;
  viewerLink.href = viewer_url;

}

// Redirect user to a new session
function redirectToSession(session) {
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('session', session);
  window.location.href = currentUrl.href;
}

// Register event callbacks for input
document.addEventListener('prodigymount', evt => {
  // Set initial task in state
  STATE.currentTask = window.prodigy.content._task_hash;

  // Update input font size and background when input changes
  const input = document.getElementById("transcription");
  const style = window.getComputedStyle(input, null);
  STATE.inputInitialFontSize = Number.parseInt(style.getPropertyValue('font-size').slice(0, -2), 10);
  hookIntoDOM();
});

// If the session is launched without a named session, ask the user to select one
// of the sessions defined with the PRODIGY_POSSIBLE_SESSIONS environment variable.
// The selection can optionally (default: enabled) be remembered in localStorage, in
// this case anonymous future sessions will be redirected to the saved session.
document.addEventListener('prodigymount', evt => {
  const currentSession = window.prodigy.config.session;
  const possibleSessions = __allowed_named_sessions__;  // Will be templated in
  if (currentSession && possibleSessions.includes(currentSession)) {
    return;
  }
  const userSession = localStorage.getItem('prodigy_default_session');
  if (userSession) {
    redirectToSession(userSession);
    return;
  }

  let rememberSession = true;
  let selectedSession = possibleSessions[0];
  const tmpl = document.createElement('template');
  tmpl.innerHTML = `
  <div style="display: flex; position: fixed; top: 0px; left: 0px; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); z-index: 9999; align-items: center; justify-content: center;">
    <div style="width: 50%; background-color: white; display: flex; align-items: center; flex-direction: column; font-family: sans-serif; padding: 1em; border-radius: 1.5em;">
      <p style="font-weight: bold; font-size: 3em;">
        Bitte einen Benutzer auswählen:
      </p>
      <select style="margin-top: 2em; font-size: 2em; padding: 0.5em;">
        ${possibleSessions.map(sess => `<option value="${sess}">${sess}</option>`).join('\n')}
      </select>
      <label style="display: block; font-size: 1.5em; margin-top: 1em;">
        <input type="checkbox" style="margin-right: 1em;" checked="true">
        Benutzer merken
      </label>
      <button style="font-size: 2em; padding: 0.5em; margin-top: 1em; background-color: lightgray;">
        Nutzer-Session starten
      </button>
    </div>
  </div>
  `.trim();
  tmpl.content.querySelector('select').addEventListener('change', evt => {
    selectedSession = evt.target.value;
  });
  tmpl.content.querySelector('input').addEventListener('change', evt => {
    rememberSession = evt.target.checked;
  });
  tmpl.content.querySelector('button').addEventListener('click', evt => {
    if (rememberSession) {
      localStorage.setItem('prodigy_default_session', selectedSession);
    }
    redirectToSession(selectedSession)
  });

  document.body.appendChild(tmpl.content.firstChild);
});

// When the task changes, synchronize the character picker state in the DOM,
// update input box styling and register event handlers so input style remains
// in sync with input value.
document.addEventListener('prodigyupdate', evt => {
  const task = evt.detail.task._task_hash;
  if (task === STATE.currentTask) {
    // No change
    return;
  }
  STATE.currentTask = task;

  // Keep picker open across multiple tasks once it has been opened
  const picker = document.querySelector(".character-picker");
  if (STATE.pickerOpen) {
    picker.style.display = "grid";
  } else if (!STATE.pickerOpen) {
    picker.style.display = "none";
  }

  hookIntoDOM();
});

function toggleCharacterPicker() {
  const picker = document.querySelector(".character-picker");
  if (picker.style.display === "none") {
    picker.style.display = "grid";
    STATE.pickerOpen = true;
  } else {
    picker.style.display = "none";
    STATE.pickerOpen = false;
  }
}

// React hijacks the input event, so we need to do some special stuff to get our value
// to sync with the React state.
function setValueForReact(inputElem, value) {
  const lastVal = inputElem.value;
  inputElem.value = value;
  const evt = new Event('input', { target: inputElem, bubbles: true });
  evt.simulated = true;
  if (inputElem._valueTracker) {
    inputElem._valueTracker.setValue(lastVal);
  }
  inputElem.dispatchEvent(evt);
}


function insertGrapheme(grapheme) {
  const input = document.getElementById("transcription");
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  const text = input.value;

  setValueForReact(input, text.slice(0, start) + grapheme + text.slice(end));

  input.focus();
  input.setSelectionRange(start + grapheme.length, start + grapheme.length);
}

function insertUncertaintyMarker() {
  const input = document.getElementById("transcription");
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  // Only works for selections of one or more characters
  if (start === end) {
    return;
  }
  const marked = `⟅${input.value.slice(start, end)}⟆`;

  setValueForReact(input, input.value.slice(0, start) + marked + input.value.slice(end));

  input.focus();
  input.setSelectionRange(start + marked.length, start + marked.length);
}

function getInputCharacterCoordinates() {
  const input = document.getElementById("transcription");
  const styles = window.getComputedStyle(input, null);
  if (!getInputCharacterCoordinates._canvas) {
    getInputCharacterCoordinates._canvas = document.createElement('canvas');
  }
  const canvas = getInputCharacterCoordinates._canvas;
  const ctx = canvas.getContext('2d');
  function _getStyle(key, fallback) {
    return styles.getPropertyValue(key) || fallback;
  }
  ctx.font = `${_getStyle('font-weight', 400)} ${_getStyle('font-size', '20px')} ${_getStyle('font-family', 'monospace')}`;
  const out = [];
  let offset = Number.parseInt(_getStyle('padding-left', '0px').slice(0, -2), 10);
  for (let i = 0; i < input.value.length; i++) {
    const char = input.value[i];
    let width = ctx.measureText(char).width;
    if (char === '\uD83E' || char === '\uDD14') {
      width = width / 2;
    }
    out.push({ char, offset, width });
    offset += width;
  }
  return out;
}

function highlightSpecialCharacters() {
  const input = document.getElementById("transcription");
  // CSS linear color stops in the form `${color} ${start}px ${end}px`
  const gradientStops = [];
  const coords = getInputCharacterCoordinates();
  let lastOffset = 0;
  let hasS = false;
  let hasUmlauts = lastOffset;
  for (let i = 0; i < coords.length; i++) {
    let color;
    let { char, offset, width } = coords[i];
    if (char === 'ſ' || char === 's') {
      color = 'rgba(255, 0, 0, 0.5)';
      hasS = true
    } else if (char === 'f') {
      color = 'rgba(255, 0, 0, 0.1)';
    } else if ('äöüÄÖÜ'.indexOf(char) >= 0) {
      color = 'rgba(0, 128, 0, 0.5)';
      hasUmlauts = true;
    } else if (char ==='ͤ') {
      color = 'rgba(0, 128, 0, 0.5)';
      hasUmlauts = true;
      // Combining codepoint has no width, uses that of the previous character
      offset = coords[i-1].offset;
      width = coords[i-1].width;
    }
    if (char === '⟅') {
      // Mark the whole uncertainty range
      while (i < coords.length && coords[i].char !== '⟆') {
        i++;
        width += coords[i].width;
      }
      color = 'rgba(255, 255, 0, 0.5)';
    }
    // Update gradient stops:
    if (color) {
      if (offset !== lastOffset) {
        gradientStops.push(`rgba(0, 0, 0, 0) ${lastOffset}px ${offset}px`);
      }
      gradientStops.push(`${color} ${offset}px ${offset + width}px`);
      lastOffset = offset + width;
    }
  }
  gradientStops.push(`rgba(0, 0, 0, 0) ${lastOffset}px 100%`);
  input.style.background = `linear-gradient(to right, ${gradientStops.join(', ')})`;
  const warnings = [];
  if (hasS) {
    document.getElementById("fix-long-s-btn").disabled = false;
    warnings.push(['rgb(255, 0, 0)', 'Im Text kommen Formen des kleinen "s" vor!']);
  } else {
    document.getElementById("fix-long-s-btn").disabled = true;
  }
  if (hasUmlauts) {
    document.getElementById("fix-umlauts-btn").disabled = false;
    warnings.push(['rgb(0, 128, 0)', 'Im Text kommen Umlaute vor!']);
  } else {
    document.getElementById("fix-umlauts-btn").disabled = true;
  }
  const warningContainer = document.getElementById("transcription-warnings");
  warningContainer.innerHTML = "";
  if (warnings.length) {
    for (const [color, msg] of warnings) {
      warningContainer.insertAdjacentHTML('afterbegin', `<p style="color: ${color}" class="transcription-warning"><strong>⚠️ Achtung:</strong> ${msg}</p>`);
    }
  }
}

function fixLongS() {
  const input = document.getElementById("transcription");
  const text = input.value;
  const fixed = text.replace(/s/g, 'ſ');
  setValueForReact(input, fixed);
  highlightSpecialCharacters();
}

function fixUmlauts() {
  const input = document.getElementById("transcription");
  const text = input.value;
  const fixed = text.replace(/([äöüÄÖÜ])/g, (match, char) => {
    switch (char) {
      case 'ä': return 'aͤ';
      case 'ö': return 'oͤ';
      case 'ü': return 'uͤ';
      case 'Ä': return 'Aͤ';
      case 'Ö': return 'Oͤ';
      case 'Ü': return 'Uͤ';
      default: return match;
    }
  });
  setValueForReact(input, fixed);
  adjustInputFontSize();
  highlightSpecialCharacters();
}

function adjustInputFontSize() {
  const input = document.getElementById("transcription");
  const style = window.getComputedStyle(input, null);
  const paddingLeft = Number.parseInt(style.getPropertyValue('padding-left').slice(0, -2), 10);
  const paddingRight = Number.parseInt(style.getPropertyValue('padding-right').slice(0, -2), 10);
  const maxWidth = input.clientWidth - paddingLeft - paddingRight;
  if (input.scrollWidth == maxWidth) {
    input.style.fontSize = `${STATE.inputInitialFontSize}px`;
    return;
  }
  const text = input.value;
  let fontSize = Number.parseInt(style.getPropertyValue('font-size').slice(0, -2), 10);
  const fontFamily = style.getPropertyValue('font-family') || 'monospace';
  const fontWeight = style.getPropertyValue('font-weight') || 'normal';
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  let textWidth = ctx.measureText(text).width;
  while (textWidth > maxWidth) {
    fontSize -= 0.1;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    textWidth = ctx.measureText(text).width;
  }
  input.style.fontSize = `${fontSize}px`;
}

function showFullScreenLineModal() {
  const { line_image_url } = window.prodigy.content;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="line-modal" style="display: flex; position: fixed; top: 0px; left: 0px; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); z-index: 9999; align-items: center; justify-content: center;">
      <div style="width: 100%; background-color: white; display: flex; align-items: center; flex-direction: column; font-family: sans-serif; padding: 0.5em; border-radius: 1.5em;">
        <img src="${line_image_url}" style="width: 100%; max-height: 80vh; object-fit: contain;"/>
      </div>
    </div>
  `);
  document.getElementById('line-modal').addEventListener('click', closeFullScreenLineModal);
}

function closeFullScreenLineModal() {
  document.getElementById("line-modal").remove();
}