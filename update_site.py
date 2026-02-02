import os
import re

PROJECT_ROOT = "/Users/deepansh/StudioProjects/WIISER_SleepAwaker"
WIDGET_SCRIPT = '<script type="module" src="/js/sleep_awaker_widget.js"></script>'
NAV_LINK_PATTERN = r'<a href="drowsiness\.html".*?>.*?Sleep Awaker.*?</a>'

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    
    # 1. Remove Navbar Link
    # This regex tries to match the specific link. We use re.DOTALL in case it spans lines, 
    # but the provided example shows it on one line. simpler regex is safer if format varies.
    # We will try a few variations just in case.
    
    # Simple replace if it matches exactly the known format
    content, count = re.subn(r'<a\s+href=["\']drowsiness\.html["\'].*?>.*?Sleep Awaker.*?</a>', '', content, flags=re.IGNORECASE | re.DOTALL)
    if count > 0:
        print(f"Removed nav link from: {filepath}")

    # 2. Inject Script
    # Inject before </body>
    if "sleep_awaker_widget.js" not in content:
        if "</body>" in content:
            content = content.replace("</body>", f"{WIDGET_SCRIPT}\n</body>")
            print(f"Injected widget script into: {filepath}")
        else:
            print(f"WARNING: No </body> tag in {filepath}, appending to end.")
            content += f"\n{WIDGET_SCRIPT}"
    else:
        print(f"Widget script already present in: {filepath}")

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

def main():
    for root, dirs, files in os.walk(PROJECT_ROOT):
        # Exclude hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
        for file in files:
            if file.endswith(".html"):
                filepath = os.path.join(root, file)
                process_file(filepath)

if __name__ == "__main__":
    main()
