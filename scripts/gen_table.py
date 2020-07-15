import os
import json
import random
import requests

ROWS = 3000
COLS = 30
resp = requests.get("http://svnweb.freebsd.org/csrg/share/dict/words?view=co&content-type=text/plain")
WORDS = resp.text.splitlines()

HTML_TAGS = [
    "<b>{}</b>",
    "<i>{}</i>",
    "{0}",
    "<span style='color: red;'>{}</span>",
    "<em>{}</em>",
]

def random_word(max_words=3):
    return " ".join([random.choice(WORDS) for _ in range(max_words)])


def random_html():
    return random.choice(HTML_TAGS).format(random_word())


def generate():
    data = [[random_html() for _ in range(0, COLS)] for _ in range(0, ROWS)]
    data_str = json.dumps(data).replace("\'", "\\\'")
    with open("data.ts", "w") as f:
        f.write(f"export const ROWS = {ROWS};\n")
        f.write(f"export const COLS = {COLS};\n")
        f.write(f"export const DATA: string[][] = JSON.parse('{data_str}');\n")


if __name__ == "__main__":
    generate()
