// One-off repair: reverses UTF-8→CP1252 mojibake left by PowerShell edits.
// Maps known mojibake sequences back to their intended Unicode chars.
const fs = require('fs');
const path = require('path');

// Mojibake sequences observed: 'â€X' style = UTF-8 bytes reinterpreted as CP1252.
// We decode by taking each mojibake char's CP1252 byte and re-decoding as UTF-8.
// Node lacks CP1252, so map the common chars explicitly.
const CP1252 = {
  'â': 0xe2, '€': 0x80, '“': 0x9c, '”': 0x9d, '‘': 0x91, '’': 0x92,
  '–': 0x96, '—': 0x97, '•': 0x95, '…': 0x85, '™': 0x99, 'š': 0x9a,
  '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f, 'ƒ': 0x83, '„': 0x84,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, '‹': 0x8b, 'Œ': 0x8c,
  '�': 0x81, '�': 0x8d, '�': 0x8f, '�': 0x90, '�': 0x9d,
  '¡': 0xa1, '¢': 0xa2, '£': 0xa3, '¤': 0xa4, '¥': 0xa5, '¦': 0xa6,
  '§': 0xa7, '¨': 0xa8, '©': 0xa9, 'ª': 0xaa, '«': 0xab, '¬': 0xac,
  '­': 0xad, '®': 0xae, '¯': 0xaf, '°': 0xb0, '±': 0xb1, '²': 0xb2,
  '³': 0xb3, '´': 0xb4, 'µ': 0xb5, '¶': 0xb6, '·': 0xb7, '¸': 0xb8,
  '¹': 0xb9, 'º': 0xba, '»': 0xbb, '¼': 0xbc, '½': 0xbd, '¾': 0xbe,
  '¿': 0xbf,
};
// For chars in U+0080-U+00FF, CP1252 byte = codepoint (same as latin1)
function cp1252Byte(ch) {
  const cp = ch.codePointAt(0);
  if (cp <= 0xff) return cp;
  return CP1252[ch];
}

function fixMojibake(text) {
  // Find runs of suspicious chars: 'â€', 'Ã', '�' and try to decode as UTF-8
  return text.replace(/[âÃ�][€“”‘’–—•…™š›œžŸƒ„†‡ˆ‰‹Œ¡-¿]*/g, (seq) => {
    const bytes = [];
    for (const ch of seq) {
      const b = cp1252Byte(ch);
      if (b === undefined) return seq; // can't decode — leave as-is
      bytes.push(b);
    }
    try {
      const decoded = Buffer.from(bytes).toString('utf8');
      // Only accept if it decoded to something sensible (no remaining U+FFFD)
      if (!decoded.includes('�')) return decoded;
    } catch {}
    return seq;
  });
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const roots = ['src', 'server'];
let totalFixed = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    const orig = fs.readFileSync(file, 'utf8');
    const fixed = fixMojibake(orig);
    if (fixed !== orig) {
      fs.writeFileSync(file, fixed, 'utf8');
      const n = (orig.match(/[âÃ�][€“”‘’–—•…™š›œžŸƒ„†‡ˆ‰‹Œ¡-¿]*/g) || []).length;
      console.log(`${file}: ${n} sequences repaired`);
      totalFixed++;
    }
  }
}
console.log(`Done — ${totalFixed} files modified`);
