const SEP = '\u0001';

const NEXT_KEEP = ['week', 'weeks', 'month', 'year', 'day', 'time', 'semester', 'sem', 'step', 'one', 'to',
  'morning', 'evening', 'night', 'weekend', 'class', 'lecture', 'meeting', 'exam', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CONNECTORS = ['and also', 'another thing', 'one more thing', 'apart from that', 'other than that',
  'by the way', 'oh and'];
const FILLERS = ['um', 'uh', 'er', 'so', 'okay', 'ok', 'well', 'like', 'also', 'and', 'then', 'right',
  'yeah', 'actually', 'basically', 'plus'];

const phrase = (p) => p.replace(/ /g, '\\s+');
const RE_NEXT = new RegExp('\\bnext\\b(?!\\s+(?:' + NEXT_KEEP.join('|') + ')\\b)', 'gi');
const RE_CONNECTORS = new RegExp('\\b(?:' + CONNECTORS.map(phrase).join('|') + ')\\b', 'gi');
const RE_FILLER = new RegExp('^(?:' + FILLERS.join('|') + ')(?=[\\s,]|$)', 'i');

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function tidy(part) {
  let s = part.trim();
  for (;;) {
    const before = s;
    s = s.replace(/^[,\s]+/, '').replace(RE_FILLER, '');
    if (s === before) break;
  }
  s = s.replace(/[,\s.]+$/, '');
  return capitalise(s);
}

export function splitTranscript(text) {
  let s = String(text ?? '');
  s = s.replace(/\r?\n/g, SEP);
  s = s.replace(/([?!])(?=\s|$)/g, '$1' + SEP);
  s = s.replace(/\.(?=\s|$)/g, SEP);
  s = s.replace(/\b(?:new\s+note|next\s+note)\b/gi, SEP);
  s = s.replace(RE_NEXT, SEP);
  s = s.replace(RE_CONNECTORS, SEP);
  return s.split(SEP).map(tidy).filter(Boolean);
}

// Places inside one piece where a new thought MAY start: a joining word, or a phrase that opens a new
// task. These are only candidates; the sorter keeps a cut only when the two sides belong to different nodes.
const JOINERS = ['and then', 'and', 'also', 'then', 'plus'];
const STARTERS = ['i need', 'i have to', 'i should', 'i want', 'i must', 'i will', "i'll", 'i also', 'we need',
  'we have to', 'we should', 'remind me', 'remember to', "don't forget", 'do not forget'];
const RE_SOFT = new RegExp('\\s+(?:(?:' + JOINERS.map(phrase).join('|') + ')\\s+|(?=(?:' +
  STARTERS.map(phrase).join('|') + ')\\b))', 'gi');
const RE_TAIL_JOINER = new RegExp('\\s+(?:' + JOINERS.map(phrase).join('|') + ')$', 'i');
const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

export function softSplits(piece) {
  const s = String(piece ?? '');
  const seen = new Set();
  const out = [];
  for (const m of s.matchAll(RE_SOFT)) {
    const left = tidy(s.slice(0, m.index).replace(RE_TAIL_JOINER, ''));
    const right = tidy(s.slice(m.index));
    const key = left + SEP + right;
    // A bare "and" usually joins two halves of one thought, so it needs longer sides to count.
    const min = /^\s+and\s+$/i.test(m[0]) ? 3 : 2;
    if (wordCount(left) < min || wordCount(right) < min || seen.has(key)) continue;
    seen.add(key);
    out.push([left, right]);
    if (out.length === 8) break;
  }
  return out;
}

const LEAD_INS = ['add to the shopping list', 'add to my shopping list', 'put on the shopping list',
  'i need to buy', 'i need to get', 'i have to buy', 'i want to buy', 'we need to buy', 'need to buy',
  'need to get', 'shopping list', 'pick up', 'purchase', 'i need', 'we need', 'order', 'buy', 'get', 'add']
  .sort((a, b) => b.length - a.length);
const TRAILERS = ['to the shopping list', 'to my shopping list', 'on the shopping list',
  'in the shopping list', 'from the shop', 'from the store', 'from the market'];
const RE_LEAD = new RegExp('^(?:' + LEAD_INS.map(phrase).join('|') + ')\\b', 'i');
const RE_TRAIL = new RegExp('\\s*\\b(?:' + TRAILERS.map(phrase).join('|') + ')\\s*$', 'i');

export function toChecklistItems(text) {
  let s = String(text ?? '').trim();
  s = s.replace(RE_LEAD, '').replace(RE_TRAIL, '');
  const out = s.split(/,|\s+and\s+|\s+&\s+|\s+plus\s+/i)
    .map((e) => e.trim().replace(/^(?:some|a|an|the)\s+/i, '').trim())
    .filter(Boolean)
    .map(capitalise);
  return out.length ? out : [text];
}

const STOP = new Set(('i me my we our you your the a an to of in on at for with and or but is are was were be ' +
  'been am do does did have has had need needs want wants should must will would can could that this it its ' +
  'about from by as so then also just really remind remember get got going go im ive dont not no there some ' +
  'any please').split(' '));

export function proposeNodeName(text) {
  const words = String(text ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter((w) => w && !STOP.has(w)).slice(0, 2);
  return words.length ? words.map(capitalise).join(' ') : 'New Node';
}
