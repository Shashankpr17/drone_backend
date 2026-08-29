import os
import json
import csv
from collections import Counter

damage_map = {
    "no-damage":0,
    "minor-damage":1,
    "major-damage":2,
    "destroyed":3
}

rows = []

label_dir = "dataset/train/labels"

for file in os.listdir(label_dir):

    if "_post_disaster.json" not in file:
        continue

    path = os.path.join(label_dir,file)

    with open(path) as f:
        data = json.load(f)

    damages = []

    for building in data["features"]["xy"]:

        subtype = building["properties"].get("subtype")

        if subtype in damage_map:
            damages.append(subtype)

    if not damages:
        continue

    dominant = Counter(damages).most_common(1)[0][0]

    image_name = file.replace(".json",".png")

    rows.append([
        image_name,
        damage_map[dominant]
    ])

with open("labels.csv","w",newline="") as f:

    writer = csv.writer(f)

    writer.writerow(["image","label"])

    writer.writerows(rows)

print("Saved",len(rows),"rows")