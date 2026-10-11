//! Liang hyphenation (TeX's algorithm) over hyph-utf8 pattern files loaded at runtime.
//!
//! Patterns are assets, not code: the host fetches `<lang>.pat.txt` / `<lang>.hyp.txt` and hands
//! the text to `pt_hyph_load`, so adding a language never touches the .wasm. Lines starting with
//! `%` (the licence headers that must travel with the patterns) are skipped.

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

/// FNV-1a: pattern keys are a handful of chars, where SipHash's setup dominates the lookup.
#[derive(Default)]
pub struct Fnv(u64);
impl Hasher for Fnv {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        let mut h = if self.0 == 0 { 0xcbf29ce484222325 } else { self.0 };
        for b in bytes {
            h ^= *b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        self.0 = h;
    }
}
type FastMap<K, V> = HashMap<K, V, BuildHasherDefault<Fnv>>;

pub struct Hyphenator {
    patterns: FastMap<Vec<char>, Vec<u8>>,
    max_len: usize,
    exceptions: HashMap<String, Vec<usize>>,
    pub left_min: usize,
    pub right_min: usize,
}

impl Hyphenator {
    pub fn load(patterns: &str, exceptions: &str, left_min: usize, right_min: usize) -> Self {
        let mut map: FastMap<Vec<char>, Vec<u8>> = FastMap::default();
        let mut max_len = 0;
        for tok in patterns.lines().filter(|l| !l.trim_start().starts_with('%')).flat_map(|l| l.split_whitespace()) {
            let mut letters = Vec::new();
            let mut vals: Vec<u8> = vec![0];
            for c in tok.chars() {
                if let Some(d) = c.to_digit(10) {
                    *vals.last_mut().unwrap() = d as u8;
                } else {
                    letters.extend(c.to_lowercase());
                    vals.push(0);
                }
            }
            if letters.is_empty() {
                continue;
            }
            max_len = max_len.max(letters.len());
            map.insert(letters, vals);
        }
        let mut exc = HashMap::new();
        for tok in exceptions.lines().filter(|l| !l.trim_start().starts_with('%')).flat_map(|l| l.split_whitespace()) {
            let mut word = String::new();
            let mut pts = Vec::new();
            let mut n = 0usize;
            for c in tok.chars() {
                if c == '-' {
                    pts.push(n);
                } else {
                    for lc in c.to_lowercase() {
                        word.push(lc);
                        n += 1;
                    }
                }
            }
            exc.insert(word, pts);
        }
        Self { patterns: map, max_len, exceptions: exc, left_min: left_min.max(1), right_min: right_min.max(1) }
    }

    pub fn pattern_count(&self) -> usize {
        self.patterns.len()
    }

    /// Break positions (in chars of `word`) where a hyphen may be inserted *before* that char.
    /// `left`/`right` override the language minimums when non-zero.
    pub fn hyphenate(&self, word: &[char], left: usize, right: usize) -> Vec<usize> {
        let left = if left > 0 { left } else { self.left_min };
        let right = if right > 0 { right } else { self.right_min };
        let n = word.len();
        if n < left + right {
            return Vec::new();
        }
        let lower: Vec<char> = word.iter().map(|c| c.to_lowercase().next().unwrap_or(*c)).collect();
        let key: String = lower.iter().collect();
        if let Some(p) = self.exceptions.get(&key) {
            return p.iter().copied().filter(|&i| i >= left && i <= n - right).collect();
        }
        let mut w = Vec::with_capacity(n + 2);
        w.push('.');
        w.extend_from_slice(&lower);
        w.push('.');
        let len = w.len();
        let mut points = vec![0u8; len + 1];
        for i in 0..len {
            let end = (i + self.max_len).min(len);
            for j in i + 1..=end {
                if let Some(v) = self.patterns.get(&w[i..j]) {
                    for (k, &val) in v.iter().enumerate() {
                        if val > points[i + k] {
                            points[i + k] = val;
                        }
                    }
                }
            }
        }
        // points[p] sits between w[p-1] and w[p]; w is offset by the leading '.'.
        (left..=n - right).filter(|&i| points[i + 1] % 2 == 1).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const PAT: &str = include_str!("../../../services/text/hyphenation/patterns/en-us.pat.txt");
    const HYP: &str = include_str!("../../../services/text/hyphenation/patterns/en-us.hyp.txt");

    fn hy(h: &Hyphenator, w: &str) -> String {
        let cs: Vec<char> = w.chars().collect();
        let pts = h.hyphenate(&cs, 0, 0);
        let mut s = String::new();
        for (i, c) in cs.iter().enumerate() {
            if pts.contains(&i) {
                s.push('-');
            }
            s.push(*c);
        }
        s
    }

    #[test]
    fn english_patterns() {
        let h = Hyphenator::load(PAT, HYP, 2, 3);
        assert!(h.pattern_count() > 4000);
        assert_eq!(hy(&h, "hyphenation"), "hy-phen-ation");
        assert_eq!(hy(&h, "typography"), "ty-pog-ra-phy");
        assert_eq!(hy(&h, "Justification"), "Jus-ti-fi-ca-tion");
        assert_eq!(hy(&h, "associate"), "as-so-ciate");
        assert_eq!(hy(&h, "the"), "the");
    }
}
