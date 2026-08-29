import json
import os
from collections import Counter

LABEL_DIR = "dataset/train/labels"

damage_counter = Counter()

for file in os.listdir(LABEL_DIR):

    if not file.endswith(".json"):
        continue

    path = os.path.join(LABEL_DIR, file)

    with open(path) as f:
        data = json.load(f)

    buildings = data["features"]["xy"]

    for b in buildings:

        subtype = b["properties"].get("subtype")

        if subtype:
            damage_counter[subtype] += 1

print("\nDamage Distribution:\n")

for k, v in damage_counter.items():
    print(k, ":", v)