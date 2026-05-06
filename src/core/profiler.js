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

  if (!tracks.length) return null;

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
  const { topGenres, topMoods, langMix, totalTracks } = data;

  const genreLine = topGenres.map(([g]) => g).join(' / ');
  const moodLine = topMoods.map(([m]) => m).join(' / ');

  // Map detected genres to descriptive sub-genre hints
  const genreHints = topGenres.slice(0, 6).map(([g]) => {
    const map = {
      hiphop: 'boom-bap, conscious rap, 中文说唱, experimental hip-hop',
      'r&b': 'neo-soul, alternative R&B, 华语 R&B',
      jazz: 'cool jazz, jazz-hop, instrumental',
      rock: 'indie rock, post-rock, math rock',
      electronic: 'ambient, downtempo, idm, lofi',
      pop: 'indie pop, dream pop, city pop',
      folk: 'indie folk, acoustic, singer-songwriter',
      classical: 'piano, orchestral, minimalist',
      lofi: 'chillhop, study beats, jazzhop',
      punk: 'indie punk, emo, post-hardcore',
      metal: 'progressive metal, post-metal, atmospheric',
      reggae: 'dub, roots reggae, dancehall',
      world: 'latin, bossa nova, afrobeat, 国风',
    };
    return map[g] ? `- **${g}**: ${map[g]}` : `- **${g}**: explore broadly`;
  }).join('\n');

  return `## <MANDATORY_USER_DNA>
<!-- AUTO-GENERATED taste profile. Genre direction ONLY — no artist names. -->

### Core Identity
- **Library size**: ${totalTracks} tracks analyzed
- **Language mix**: ${langMix}
- **Dominant genres**: ${genreLine || 'eclectic / diverse'}
- **Emotional profile**: ${moodLine || 'varied / balanced'}

### Genre DNA (use these as your compass)
${genreHints || '- Explore broadly across all genres'}

### Scene Affinity
- **Morning / Focus**: ${pickScene(topGenres, ['lofi', 'jazz', 'folk', 'classical'])}
- **Afternoon / Energy**: ${pickScene(topGenres, ['rock', 'pop', 'hiphop', 'electronic'])}
- **Evening / Wind-down**: ${pickScene(topGenres, ['r&b', 'jazz', 'folk', 'lofi'])}
- **Late Night / Deep**: ${pickScene(topGenres, ['ambient', 'electronic', 'classical', 'lofi'])}

### Constraints
- This DNA defines TASTE DIRECTION, not a playlist. You decide which specific artists to recommend.
- 70% fresh discoveries from these genres + 30% familiar sounds.
- Chinese/Asian music should be ~50% of recommendations.
- DO NOT claim ignorance of the user's taste. These genres are the authority.
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
  return dna;
}

module.exports = { analyze, generate };
