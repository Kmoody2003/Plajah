//! Word-buffer codec shared by every ABI call.
//!
//! The host and the engine exchange flat little-endian buffers of 32-bit words: integers as
//! `u32`/`i32`, reals as `f32` bit patterns, and UTF-16 text packed two code units per word
//! (low half first) and padded to a whole word. One layout rule for everything means the JS side
//! needs a single `DataView` reader/writer and nothing is ever re-encoded twice.

pub struct Reader<'a> {
    w: &'a [u32],
    i: usize,
}

impl<'a> Reader<'a> {
    pub fn new(w: &'a [u32]) -> Self {
        Self { w, i: 0 }
    }
    #[inline]
    pub fn u32(&mut self) -> u32 {
        let v = self.w.get(self.i).copied().unwrap_or(0);
        self.i += 1;
        v
    }
    #[inline]
    pub fn i32(&mut self) -> i32 {
        self.u32() as i32
    }
    #[inline]
    pub fn f32(&mut self) -> f32 {
        f32::from_bits(self.u32())
    }
    pub fn bool(&mut self) -> bool {
        self.u32() != 0
    }
    /// `n` UTF-16 code units, packed two per word.
    pub fn utf16(&mut self, n: usize) -> Vec<u16> {
        let words = n.div_ceil(2);
        let mut out = Vec::with_capacity(n);
        for k in 0..words {
            let v = self.w.get(self.i + k).copied().unwrap_or(0);
            out.push((v & 0xffff) as u16);
            if out.len() < n {
                out.push((v >> 16) as u16);
            }
        }
        self.i += words;
        out
    }
    /// Length-prefixed UTF-16 string.
    pub fn string(&mut self) -> String {
        let n = self.u32() as usize;
        String::from_utf16_lossy(&self.utf16(n))
    }
    pub fn remaining(&self) -> usize {
        self.w.len().saturating_sub(self.i)
    }
}

#[derive(Default)]
pub struct Writer {
    pub w: Vec<u32>,
}

impl Writer {
    pub fn clear(&mut self) {
        self.w.clear();
    }
    #[inline]
    pub fn u32(&mut self, v: u32) {
        self.w.push(v);
    }
    #[inline]
    pub fn i32(&mut self, v: i32) {
        self.w.push(v as u32);
    }
    #[inline]
    pub fn f32(&mut self, v: f32) {
        self.w.push(v.to_bits());
    }
    /// Reserve a word to patch later (counts written after their payload).
    pub fn slot(&mut self) -> usize {
        self.w.push(0);
        self.w.len() - 1
    }
    pub fn patch(&mut self, at: usize, v: u32) {
        self.w[at] = v;
    }
    pub fn len(&self) -> usize {
        self.w.len()
    }
    pub fn utf16(&mut self, s: &[u16]) {
        for pair in s.chunks(2) {
            let lo = pair[0] as u32;
            let hi = pair.get(1).copied().unwrap_or(0) as u32;
            self.w.push(lo | (hi << 16));
        }
    }
    /// Length-prefixed UTF-16 string.
    pub fn string(&mut self, s: &str) {
        let u: Vec<u16> = s.encode_utf16().collect();
        self.u32(u.len() as u32);
        self.utf16(&u);
    }
}

/// UTF-16 → (String, byte offset of each code unit). Unpaired surrogates become U+FFFD but keep
/// their code-unit width so offsets stay aligned with the host's string.
pub fn utf16_to_string(s: &[u16]) -> (String, Vec<usize>) {
    let mut out = String::with_capacity(s.len());
    let mut map = vec![0usize; s.len() + 1];
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        map[i] = out.len();
        if (0xD800..0xDC00).contains(&c) && i + 1 < s.len() && (0xDC00..0xE000).contains(&s[i + 1]) {
            let cp = 0x10000 + (((c as u32) - 0xD800) << 10) + ((s[i + 1] as u32) - 0xDC00);
            out.push(char::from_u32(cp).unwrap_or('\u{FFFD}'));
            map[i + 1] = map[i];
            i += 2;
        } else {
            let ch = char::from_u32(c as u32).filter(|_| !(0xD800..0xE000).contains(&c)).unwrap_or('\u{FFFD}');
            out.push(ch);
            i += 1;
        }
    }
    map[s.len()] = out.len();
    (out, map)
}

/// Decode the code point starting at utf16 index `i` (returns char and its unit width).
#[inline]
pub fn char_at(s: &[u16], i: usize) -> (char, usize) {
    let c = s[i];
    if (0xD800..0xDC00).contains(&c) && i + 1 < s.len() && (0xDC00..0xE000).contains(&s[i + 1]) {
        let cp = 0x10000 + (((c as u32) - 0xD800) << 10) + ((s[i + 1] as u32) - 0xDC00);
        (char::from_u32(cp).unwrap_or('\u{FFFD}'), 2)
    } else if (0xD800..0xE000).contains(&c) {
        ('\u{FFFD}', 1)
    } else {
        (char::from_u32(c as u32).unwrap_or('\u{FFFD}'), 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn utf16_roundtrip_with_surrogates() {
        let s = "a😀b";
        let u: Vec<u16> = s.encode_utf16().collect();
        let mut w = Writer::default();
        w.string(s);
        let mut r = Reader::new(&w.w);
        assert_eq!(r.string(), s);
        let (st, map) = utf16_to_string(&u);
        assert_eq!(st, s);
        assert_eq!(map, vec![0, 1, 1, 5, 6]);
        assert_eq!(char_at(&u, 1), ('😀', 2));
    }
}
