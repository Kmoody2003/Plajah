const fs = require("fs");
let content = fs.readFileSync("services/archiveContentService.ts", "utf8");
content = content.replace(/fetch\(`\/api\/proxy\?url=\$\{encodeURIComponent\(targetUrl\)\}`\)/g, "fetch(targetUrl)");
fs.writeFileSync("services/archiveContentService.ts", content);
