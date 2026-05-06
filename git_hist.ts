import { execSync } from "child_process";
try {
  execSync("git checkout contexts/GlobalPlayerContext.tsx");
  console.log("Git checkout successful!");
} catch (e: any) {
  console.error("Git checkout failed:", e.message);
  console.error(e.stdout?.toString());
  console.error(e.stderr?.toString());
}
