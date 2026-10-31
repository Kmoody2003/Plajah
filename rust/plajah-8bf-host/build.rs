fn main() {
    // Filters expect Photoshop-sized stacks; the 1 MB default is too small for some.
    println!("cargo:rustc-link-arg-bins=/STACK:16777216");
}
