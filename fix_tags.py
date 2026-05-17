from pathlib import Path

root = Path(r"c:\Users\arche\Desktop\ATOMBERG\atomquest\frontend\src")
close_div = "</" + "div>"
for path in root.rglob("*.tsx"):
    text = path.read_text(encoding="utf-8")
    if "motion" in text:
        text = text.replace("</motion>", close_div)
        path.write_text(text, encoding="utf-8")
        print("fixed", path)
