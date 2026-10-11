//! Itemisation: bidi embedding levels (UAX #9), script runs (UAX #24) and line-break
//! opportunities (UAX #14), all indexed by UTF-16 code unit so offsets match the host string.

use crate::io::{char_at, utf16_to_string};
use unicode_bidi::Level;
use unicode_script::{Script as UScript, UnicodeScript};

/// Resolved bidi level per code unit and the paragraph (base) level.
/// `base`: 0 = auto (first strong char), 1 = LTR, 2 = RTL.
pub fn bidi_levels(text: &[u16], base: u32) -> (Vec<u8>, u8) {
    let default = match base {
        1 => Some(Level::ltr()),
        2 => Some(Level::rtl()),
        _ => None,
    };
    if text.is_empty() {
        return (Vec::new(), if base == 2 { 1 } else { 0 });
    }
    let info = unicode_bidi::utf16::BidiInfo::new(text, default);
    let para = info.paragraphs.first().map(|p| p.level.number()).unwrap_or(0);
    let mut levels: Vec<u8> = info.levels.iter().map(|l| l.number()).collect();
    levels.resize(text.len(), para);
    // Rule L1 (partial): segment/paragraph separators and tabs take the paragraph level so a tab
    // never sits inside a reversed run. Trailing line whitespace is handled at line build time.
    for (i, &u) in text.iter().enumerate() {
        if u == 0x09 || u == 0x0A || u == 0x0D || u == 0x2029 || u == 0x2028 || u == 0x1F {
            levels[i] = para;
        }
    }
    (levels, para)
}

/// ISO 15924 tag of the resolved script per code unit. Common/Inherited take the script of the
/// preceding real script (or the following one at the start), so punctuation never splits a run.
pub fn scripts(text: &[u16]) -> Vec<[u8; 4]> {
    let n = text.len();
    let mut raw: Vec<Option<UScript>> = vec![None; n];
    let mut i = 0;
    while i < n {
        let (c, w) = char_at(text, i);
        let s = c.script();
        let real = !matches!(s, UScript::Common | UScript::Inherited | UScript::Unknown);
        for k in 0..w {
            raw[i + k] = if real { Some(s) } else { None };
        }
        i += w;
    }
    let mut out = vec![*b"Latn"; n];
    let first = raw.iter().flatten().next().copied();
    let mut cur = first;
    for i in 0..n {
        if let Some(s) = raw[i] {
            cur = Some(s);
        }
        if let Some(s) = cur {
            let b = s.short_name().as_bytes();
            if b.len() == 4 {
                out[i] = [b[0], b[1], b[2], b[3]];
            }
        }
    }
    out
}

pub fn is_cursive(script: &[u8; 4]) -> bool {
    matches!(script, b"Arab" | b"Syrc" | b"Mong" | b"Nkoo" | b"Phag" | b"Mand" | b"Adlm" | b"Rohg")
}

pub fn is_cjk(script: &[u8; 4]) -> bool {
    matches!(script, b"Hani" | b"Hira" | b"Kana" | b"Hang" | b"Bopo")
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Brk {
    None,
    Allowed,
    Mandatory,
}

/// Break opportunity *before* each code unit index (len + 1 entries; index 0 is never a break).
pub fn break_opportunities(text: &[u16]) -> Vec<Brk> {
    let (s, map) = utf16_to_string(text);
    let mut byte_to_u16 = vec![usize::MAX; s.len() + 1];
    for (i, &b) in map.iter().enumerate() {
        if byte_to_u16[b] == usize::MAX {
            byte_to_u16[b] = i;
        }
    }
    let mut out = vec![Brk::None; text.len() + 1];
    for (b, op) in unicode_linebreak::linebreaks(&s) {
        let u = byte_to_u16.get(b).copied().unwrap_or(text.len());
        let u = if u == usize::MAX { text.len() } else { u };
        out[u] = match op {
            unicode_linebreak::BreakOpportunity::Mandatory => Brk::Mandatory,
            unicode_linebreak::BreakOpportunity::Allowed => Brk::Allowed,
        };
    }
    out
}

/// Visual order of runs on one line from their levels (rule L2).
pub fn reorder(levels: &[u8]) -> Vec<usize> {
    let mut order: Vec<usize> = (0..levels.len()).collect();
    if levels.is_empty() {
        return order;
    }
    let max = *levels.iter().max().unwrap();
    let min_odd = levels.iter().copied().filter(|l| l % 2 == 1).min().unwrap_or(max + 1);
    let mut lvl = max;
    while lvl >= min_odd && lvl > 0 {
        let mut i = 0;
        while i < order.len() {
            if levels[order[i]] >= lvl {
                let start = i;
                while i < order.len() && levels[order[i]] >= lvl {
                    i += 1;
                }
                order[start..i].reverse();
            } else {
                i += 1;
            }
        }
        lvl -= 1;
    }
    order
}

#[cfg(test)]
mod tests {
    use super::*;
    fn u(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }
    #[test]
    fn bidi_mixed() {
        let t = u("abc \u{05D0}\u{05D1}\u{05D2} def");
        let (lv, para) = bidi_levels(&t, 0);
        assert_eq!(para, 0);
        assert_eq!(lv[0], 0);
        assert_eq!(lv[4], 1);
        let (_, para) = bidi_levels(&u("\u{05D0}\u{05D1} abc"), 0);
        assert_eq!(para, 1);
    }
    #[test]
    fn script_runs_absorb_punctuation() {
        let s = scripts(&u("Hi, \u{0645}\u{0631}\u{062D}\u{0628}\u{0627}!"));
        assert_eq!(&s[0], b"Latn");
        assert_eq!(&s[2], b"Latn");
        assert_eq!(&s[5], b"Arab");
        assert_eq!(&s[9], b"Arab");
    }
    #[test]
    fn uax14() {
        let b = break_opportunities(&u("self-aware words\nnext"));
        assert_eq!(b[5], Brk::Allowed); // after hyphen
        assert_eq!(b[11], Brk::Allowed); // after space
        assert_eq!(b[17], Brk::Mandatory);
        assert_eq!(b[3], Brk::None);
    }
    #[test]
    fn l2_reorder() {
        assert_eq!(reorder(&[0, 1, 1, 0]), vec![0, 2, 1, 3]);
        assert_eq!(reorder(&[1, 2, 1]), vec![2, 1, 0]);
    }
}
