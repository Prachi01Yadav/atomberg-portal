const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "frontend", "src");
const endTag = "</" + "div>";

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".tsx")) {
      let t = fs.readFileSync(full, "utf8");
      if (t.includes("motion")) {
        t = t.replace(/<\/motion>/g, endTag);
        fs.writeFileSync(full, t);
        console.log("fixed", full);
      }
    }
  }
}
walk(root);
