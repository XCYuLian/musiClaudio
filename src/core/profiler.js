/**
 * PROFILER.JS — Soul DNA Engine
 *
 * Analyzes imported playlist data to extract the user's musical DNA:
 *   - Top artists & genres
 *   - Mood/emotion profile
 *   - Scene-based preferences
 *
 * Outputs to data/internal_taste_dna.md
 * Called after each successful playlist import.
 */

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

// ── Genre/Mood keyword mapping ──
const GENRE_SIGNALS = {
  'rock': ['摇滚', 'rock', 'metal', 'punk', 'grunge', 'alternative', 'indie rock', '后摇', 'post-rock'],
  'hiphop': ['hip hop', 'rap', '说唱', 'trap', 'drill', 'boombap', 'freestyle'],
  'electronic': ['electronic', 'edm', 'house', 'techno', 'dubstep', 'electronica', 'ambient', 'synth', 'trance', 'dnb', 'drum and bass'],
  'pop': ['pop', '流行', 'k-pop', 'j-pop', 'c-pop', 'mandopop', 'cantopop', 'synthpop', 'dream pop'],
  'r&b': ['r&b', 'rnb', 'soul', 'neo soul', 'funk', '节奏布鲁斯'],
  'jazz': ['jazz', '爵士', 'bebop', 'swing', 'fusion', 'latin jazz', 'blues'],
  'folk': ['folk', '民谣', 'acoustic', 'singer-songwriter', 'indie folk'],
  'classical': ['classical', '古典', 'orchestra', 'piano', 'violin', 'symphony', 'chamber', 'opera'],
  'lofi': ['lofi', 'lo-fi', 'chillhop', 'study beats', 'jazzhop'],
  'punk': ['punk', 'emo', 'hardcore', 'post-hardcore', 'screamo'],
  'metal': ['metal', 'death metal', 'black metal', 'doom', 'thrash', 'djent', 'metalcore'],
  'reggae': ['reggae', 'dub', 'ska', 'dancehall'],
  'world': ['world', 'latin', 'bossa nova', 'afrobeat', 'korean', 'japanese', 'french', 'chinese traditional', '国风'],
};

const MOOD_SIGNALS = {
  'energetic': ['energetic', 'upbeat', 'dance', 'party', 'workout', 'hype', 'banger', '燃', '炸'],
  'calm': ['calm', 'peaceful', 'serene', 'ambient', 'meditation', 'sleep', '宁静', '放松'],
  'melancholy': ['melancholy', 'sad', 'rainy', 'heartbreak', 'lonely', 'nostalgia', '伤感', 'emo'],
  'romantic': ['romantic', 'love', 'sweet', 'tender', 'ballad', '情歌', '浪漫'],
  'dark': ['dark', 'gothic', 'industrial', 'noir', 'heavy', 'intense', '暗黑'],
  'experimental': ['experimental', 'avant-garde', 'noise', 'glitch', 'abstract', '实验'],
};

// ── Analyze tracks ──

async function analyze(playlistPath = null) {
  const src = playlistPath || paths.PLAYLIST_FILE;

  let tracks = [];
  try {
    if (fs.existsSync(src)) {
      const raw = fs.readFileSync(src, 'utf-8');
      tracks = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[profiler] Cannot read playlist:', err.message);
    return null;
  }

  if (!tracks.length) {
    console.log('[profiler] No tracks to analyze');
    return null;
  }

  // Parse "Artist - SongName" format
  const artists = {};
  const allText = tracks.join(' ').toLowerCase();

  tracks.forEach(t => {
    const dash = t.indexOf(' - ');
    const artist = dash > 0 ? t.slice(0, dash).trim() : t;
    artists[artist] = (artists[artist] || 0) + 1;
  });

  // Top artists
  const topArtists = Object.entries(artists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // Genre detection
  const genres = {};
  for (const [genre, keywords] of Object.entries(GENRE_SIGNALS)) {
    for (const kw of keywords) {
      const count = (allText.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
      if (count > 0) genres[genre] = (genres[genre] || 0) + count;
    }
  }
  const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Mood detection
  const moods = {};
  for (const [mood, keywords] of Object.entries(MOOD_SIGNALS)) {
    for (const kw of keywords) {
      const count = (allText.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
      if (count > 0) moods[mood] = (moods[mood] || 0) + count;
    }
  }
  const topMoods = Object.entries(moods).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Language mix
  const cjkCount = (allText.match(/[一-鿿぀-ゟ゠-ヿ가-힯]/g) || []).length;
  const langMix = cjkCount > tracks.length * 0.3 ? 'Chinese-dominant' : cjkCount > tracks.length * 0.1 ? 'Mixed' : 'International';

  // Build DNA markdown
  const dna = buildDNA({ topArtists, topGenres, topMoods, langMix, totalTracks: tracks.length });
  return dna;
}

function buildDNA(data) {
  const { topArtists, topGenres, topMoods, langMix, totalTracks } = data;

  const artistList = topArtists.slice(0, 10).map(([a, c]) => `- ${a} (${c} tracks)`).join('\n');
  const genreLine = topGenres.map(([g]) => g).join(' / ');
  const moodLine = topMoods.map(([m]) => m).join(' / ');

  return `## <MANDATORY_USER_DNA>
<!-- This DNA profile is AUTO-GENERATED from the user's actual playlist data. -->
<!-- You MUST base ALL music recommendations on this profile. NEVER claim ignorance. -->

### Core Identity
- **Library size**: ${totalTracks} tracks analyzed
- **Language mix**: ${langMix}
- **Dominant genres**: ${genreLine || 'eclectic / diverse'}
- **Emotional profile**: ${moodLine || 'varied / balanced'}

### Top Artists (by track count)
${artistList || '(not enough data)'}

### Scene Affinity
- **Morning / Focus**: ${pickScene(topGenres, ['lofi', 'jazz', 'folk', 'classical'])}
- **Afternoon / Energy**: ${pickScene(topGenres, ['rock', 'pop', 'hiphop', 'electronic'])}
- **Evening / Wind-down**: ${pickScene(topGenres, ['r&b', 'jazz', 'folk', 'lofi'])}
- **Late Night / Deep**: ${pickScene(topGenres, ['ambient', 'electronic', 'classical', 'lofi'])}

### Constraints
- The user's taste centers on **${genreLine || 'diverse genres'}**.
- Emotional range skews **${moodLine || 'balanced'}**.
- Language preference: **${langMix}**.
- If unsure, default to the user's top artists before suggesting unfamiliar music.
- DO NOT claim you "haven't seen the playlist" or "don't know the taste". This DNA is the authoritative source.
</MANDATORY_USER_DNA>`;
}

function pickScene(genres, candidates) {
  for (const c of candidates) {
    if (genres.some(([g]) => g === c)) return c;
  }
  return candidates[0];
}

// ── Persist ──

async function generate(playlistPath = null) {
  const dna = await analyze(playlistPath);
  if (!dna) return null;

  const outPath = path.join(paths.DATA, 'internal_taste_dna.md');
  fs.writeFileSync(outPath, dna, 'utf-8');
  console.log(`[profiler] DNA written to ${outPath} (${dna.length} chars)`);
  return dna;
}

module.exports = { analyze, generate };
