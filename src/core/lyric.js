/**
 * LYRIC.JS — LRC lyrics parser
 *
 * Parses standard LRC format: [mm:ss.xx]lyric text
 * Provides line lookup by playback time for real-time highlight.
 */

/**
 * Parse LRC text into array of {time, text}.
 * @param {string} lrc — raw LRC content
 * @returns {Array<{time: number, text: string}>}
 */
function parse(lrc) {
  if (!lrc) return [];
  const lines = [];
  const timeRe = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;

  for (const raw of lrc.split('\n')) {
    const text = raw.replace(timeRe, '').trim();
    if (!text) continue;
    // Reset regex for each line
    const re = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
    let m;
    while ((m = re.exec(raw))) {
      const min = parseInt(m[1]), sec = parseInt(m[2]);
      let ms = parseInt(m[3]);
      if (m[3].length === 2) ms *= 10; // [mm:ss.xx] → centiseconds → milliseconds
      lines.push({ time: min * 60 + sec + ms / 1000, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/**
 * Find the index of the current lyric line for the given playback time.
 * Returns the last line whose time <= currentTime.
 * @param {Array<{time: number}>} lines
 * @param {number} currentTime — seconds
 * @returns {number} index, or -1 if before first line
 */
function currentIndex(lines, currentTime) {
  if (!lines.length) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime + 0.3) idx = i;
    else break;
  }
  return idx;
}

module.exports = { parse, currentIndex };
