try {
  class B {}
  const U = undefined;
  class A extends U {}
} catch(e) {
  console.log("extends undefined error:", e.message);
}
