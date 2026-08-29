import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.models import MobileNet_V2_Weights, mobilenet_v2

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(iterable, **_kwargs):
        return iterable


DATASET_DIR = Path("dataset_split")
TRAIN_DIR = DATASET_DIR / "train"
VAL_DIR = DATASET_DIR / "validation"
CHECKPOINT_PATH = Path("best_skyguardians_model.pth")
EPOCHS = 30
PATIENCE = 5
BATCH_SIZE = 32
MIN_SAMPLES_PER_CLASS = 200
SEED = 42
CLASS_NAMES = (
    "normal",
    "waterlogged",
    "infrastructure_damage",
    "submerged_vehicle",
    "severe_flood_damage",
)


def seed_everything():
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)


def select_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def validate_dataset():
    if not TRAIN_DIR.exists() or not VAL_DIR.exists():
        raise SystemExit("Missing dataset_split/train or dataset_split/validation. Run retrain.sh first.")

    counts = {
        class_name: sum(path.is_file() for path in (TRAIN_DIR / class_name).glob("*"))
        for class_name in CLASS_NAMES
    }
    print("Training class distribution:")
    for class_name, count in counts.items():
        print(f"{class_name}: {count}")

    insufficient = {name: count for name, count in counts.items() if count < MIN_SAMPLES_PER_CLASS}
    if insufficient:
        raise SystemExit(
            f"Training rejected: every class requires at least {MIN_SAMPLES_PER_CLASS} samples. "
            f"Insufficient classes: {insufficient}"
        )


def evaluate(model, loader, criterion, device):
    model.eval()
    total_loss = 0.0
    total_correct = 0
    total_items = 0
    targets = []
    predictions = []

    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            total_loss += criterion(outputs, labels).item() * labels.size(0)
            predicted = outputs.argmax(dim=1)
            total_correct += (predicted == labels).sum().item()
            total_items += labels.size(0)
            targets.extend(labels.cpu().tolist())
            predictions.extend(predicted.cpu().tolist())

    return total_loss / total_items, 100.0 * total_correct / total_items, targets, predictions


def main():
    seed_everything()
    validate_dataset()
    device = select_device()
    print(f"Using: {device}")

    weights = MobileNet_V2_Weights.DEFAULT
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.75, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(weights.transforms().mean, weights.transforms().std),
    ])
    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(weights.transforms().mean, weights.transforms().std),
    ])

    train_dataset = datasets.ImageFolder(TRAIN_DIR, transform=train_transform)
    val_dataset = datasets.ImageFolder(VAL_DIR, transform=val_transform)
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    model = mobilenet_v2(weights=weights)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(CLASS_NAMES))
    model = model.to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    best_val_accuracy = -1.0
    epochs_without_improvement = 0

    for epoch in range(EPOCHS):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for images, labels in tqdm(train_loader, desc=f"Epoch {epoch + 1}/{EPOCHS} - Training", leave=False):
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * labels.size(0)
            train_correct += (outputs.argmax(dim=1) == labels).sum().item()
            train_total += labels.size(0)

        val_loss, val_accuracy, _, _ = evaluate(model, val_loader, criterion, device)
        train_epoch_loss = train_loss / train_total
        train_accuracy = 100.0 * train_correct / train_total

        if val_accuracy > best_val_accuracy:
            best_val_accuracy = val_accuracy
            epochs_without_improvement = 0
            torch.save({
                "model_state_dict": model.state_dict(),
                "class_names": list(CLASS_NAMES),
                "architecture": "mobilenet_v2",
            }, CHECKPOINT_PATH)
        else:
            epochs_without_improvement += 1

        print("--------------------------------------------------")
        print(f"Epoch {epoch + 1}/{EPOCHS}")
        print(f"Train Loss: {train_epoch_loss:.4f}")
        print(f"Train Accuracy: {train_accuracy:.2f}%")
        print(f"Validation Loss: {val_loss:.4f}")
        print(f"Validation Accuracy: {val_accuracy:.2f}%")
        print(f"Best Validation Accuracy: {best_val_accuracy:.2f}%")
        print("--------------------------------------------------")

        if epochs_without_improvement >= PATIENCE:
            print(f"Early stopping after {PATIENCE} epochs without improvement.")
            break

    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    _, _, targets, predictions = evaluate(model, val_loader, criterion, device)
    matrix = confusion_matrix(targets, predictions, labels=list(range(len(CLASS_NAMES))))
    report = classification_report(targets, predictions, target_names=CLASS_NAMES, zero_division=0)
    Path("confusion_matrix.json").write_text(json.dumps(matrix.tolist(), indent=2), encoding="utf-8")
    Path("classification_report.txt").write_text(report, encoding="utf-8")

    print("Confusion Matrix:")
    print(matrix)
    print("Classification Report:")
    print(report)
    print("========================")
    print("Training Complete")
    print(f"Best Validation Accuracy: {best_val_accuracy:.2f}%")
    print(f"Model Saved As: {CHECKPOINT_PATH}")
    print("========================")


if __name__ == "__main__":
    main()
