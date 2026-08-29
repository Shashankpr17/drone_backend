import argparse
import csv
from pathlib import Path


CLASS_NAMES = (
    "normal",
    "waterlogged",
    "infrastructure_damage",
    "submerged_vehicle",
    "severe_flood_damage",
)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def main():
    parser = argparse.ArgumentParser(description="Generate labels.csv from class folders.")
    parser.add_argument("--data-dir", type=Path, default=Path("dataset"))
    parser.add_argument("--output", type=Path, default=Path("folder_labels.csv"))
    args = parser.parse_args()

    rows = []
    for label, class_name in enumerate(CLASS_NAMES):
        class_dir = args.data_dir / class_name
        if not class_dir.exists():
            print(f"Warning: missing class folder: {class_dir}")
            continue

        for image_path in sorted(class_dir.rglob("*")):
            if image_path.is_file() and image_path.suffix.lower() in IMAGE_EXTENSIONS:
                rows.append((image_path.relative_to(args.data_dir).as_posix(), label, class_name))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as output_file:
        writer = csv.writer(output_file)
        writer.writerow(("image", "label", "class_name"))
        writer.writerows(rows)

    print(f"Saved {len(rows)} labels to {args.output}")
    for label, class_name in enumerate(CLASS_NAMES):
        print(f"{label} ({class_name}): {sum(row[1] == label for row in rows)}")


if __name__ == "__main__":
    main()