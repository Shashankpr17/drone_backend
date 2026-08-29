import os
import json
from collections import Counter

damage_map = {
    "no-damage": 0,
    "minor-damage": 1,
    "major-damage": 2,
    "destroyed": 3
}

label_dir = "dataset/train/labels"

for file in os.listdir(label_dir):

    if "_post_disaster.json" not in file:
        continue

    path = os.path.join(label_dir, file)

    with open(path) as f:
        data = json.load(f)

    damages = []

    for building in data["features"]["xy"]:

        subtype = building["properties"].get("subtype")

        if subtype in damage_map:
            damages.append(subtype)

    if len(damages) == 0:
        continue

    dominant = Counter(damages).most_common(1)[0][0]

    print(file, "->", dominant)