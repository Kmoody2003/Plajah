//! Optical margin alignment ("hanging punctuation" / character protrusion).
//!
//! A justified column looks ragged at its edges when punctuation and diagonal capitals sit flush
//! with the measure: a full stop or a hyphen is mostly white, so the line looks indented. The fix
//! (Zapf's hz-program, pdfTeX/microtype, InDesign's Optical Margin Alignment) lets those glyphs
//! hang partly outside the measure. Values are fractions of the glyph's own advance, following
//! microtype's default protrusion set; the paragraph's OMA strength scales them.

/// Fraction of the advance that may hang past the LEFT edge when `c` starts a line.
pub fn left(c: char) -> f32 {
    match c {
        '\u{2018}' | '\u{201A}' | '\'' | '\u{2039}' => 0.7,
        '\u{201C}' | '\u{201E}' | '"' => 0.5,
        '\u{00AB}' => 0.4,
        '(' | '[' | '{' => 0.05,
        '\u{00BF}' | '\u{00A1}' => 0.1,
        '-' | '\u{2010}' | '\u{2011}' => 0.7,
        '\u{2013}' => 0.3,
        '\u{2014}' => 0.2,
        '*' => 0.3,
        'A' | 'J' | 'T' | 'V' | 'W' | 'X' | 'Y' | 'v' | 'w' | 'x' | 'y' => 0.05,
        'O' | 'C' | 'G' | 'Q' | 'o' | 'c' | 'e' => 0.02,
        '\u{00C0}'..='\u{00C5}' => 0.05,
        _ => 0.0,
    }
}

/// Fraction of the advance that may hang past the RIGHT edge when `c` ends a line.
pub fn right(c: char) -> f32 {
    match c {
        '.' | ',' | '\u{3001}' | '\u{3002}' | '\u{060C}' => 0.7,
        ':' | ';' => 0.5,
        '!' | '?' => 0.2,
        '\u{2019}' | '\'' | '\u{203A}' => 0.7,
        '\u{201D}' | '"' => 0.5,
        '\u{00BB}' => 0.4,
        '-' | '\u{2010}' | '\u{2011}' | '\u{00AD}' => 0.7,
        '\u{2013}' => 0.3,
        '\u{2014}' => 0.2,
        '\u{2026}' => 0.2,
        ')' | ']' | '}' => 0.05,
        '*' => 0.3,
        'A' | 'F' | 'K' | 'L' | 'T' | 'V' | 'W' | 'X' | 'Y' | 'k' | 'r' | 't' | 'v' | 'w' | 'x' | 'y' => 0.05,
        'O' | 'C' | 'D' | 'G' | 'Q' | 'o' | 'p' | 'b' => 0.02,
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn punctuation_hangs_more_than_letters() {
        assert!(super::right('.') > super::right('T'));
        assert!(super::left('\u{201C}') > super::left('A'));
        assert_eq!(super::right('n'), 0.0);
    }
}
