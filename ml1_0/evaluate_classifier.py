import json
from pathlib import Path

import torch
import torch.nn as nn
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.models import mobilenet_v2


DATASET_DIR = Path("dataset_split")
CHECKPOINT_PATH = Path("best_skyguardians_model.pth")
OUTPUT_MATRIX = Path("confusion_matrix.json")
OUTPUT_REPORT = Path("classification_report.txt")
BATCH_SIZE = 32


def select_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def main():
    checkpoint = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)
    class_names = tuple(checkpoint["class_names"])
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    dataset = datasets.ImageFolder(DATASET_DIR / "validation", transform=transform)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)
    model = mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(class_names))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(select_device()).eval()

    targets = []
    predictions = []
    with torch.no_grad():
        for images, labels in loader:
            outputs = model(images.to(next(model.parameters()).device))
            targets.extend(labels.tolist())
            predictions.extend(outputs.argmax(dim=1).cpu().tolist())

    labels = list(range(len(class_names)))
    matrix = confusion_matrix(targets, predictions, labels=labels)
    report = classification_report(targets, predictions, target_names=class_names, zero_division=0)
    OUTPUT_MATRIX.write_text(json.dumps(matrix.tolist(), indent=2), encoding="utf-8")
    OUTPUT_REPORT.write_text(report, encoding="utf-8")
    print(matrix)
    print(report)


if __name__ == "__main__":
    main()
