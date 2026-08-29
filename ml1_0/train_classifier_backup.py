import pandas as pd
from PIL import Image

import torch
import torch.nn as nn

from torch.utils.data import Dataset
from torch.utils.data import DataLoader

from torchvision import transforms
from torchvision.models import efficientnet_b0


class DamageDataset(Dataset):

    def __init__(self, csv_file, image_dir):

        self.df = pd.read_csv(csv_file)
        self.image_dir = image_dir

        self.transform = transforms.Compose([
            transforms.Resize((224,224)),
            transforms.ToTensor()
        ])

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):

        row = self.df.iloc[idx]

        img_path = f"{self.image_dir}/{row['image']}"

        image = Image.open(img_path).convert("RGB")

        image = self.transform(image)

        label = int(row["label"])

        return image, label


dataset = DamageDataset(
    "labels.csv",
    "dataset/train/images"
)

loader = DataLoader(
    dataset,
    batch_size=16,
    shuffle=True
)

device = (
    "mps"
    if torch.backends.mps.is_available()
    else "cpu"
)

print("Using:", device)

model = efficientnet_b0(weights="DEFAULT")

model.classifier[1] = nn.Linear(
    model.classifier[1].in_features,
    4
)

model = model.to(device)

criterion = nn.CrossEntropyLoss()

optimizer = torch.optim.Adam(
    model.parameters(),
    lr=1e-4
)

for epoch in range(3):

    total_loss = 0

    for images, labels in loader:

        images = images.to(device)
        labels = labels.to(device)

        optimizer.zero_grad()

        outputs = model(images)

        loss = criterion(outputs, labels)

        loss.backward()

        optimizer.step()

        total_loss += loss.item()

    print(
        f"Epoch {epoch+1} Loss {total_loss:.4f}"
    )

torch.save(
    model.state_dict(),
    "skyguardians_damage_model.pth"
)

print("Model Saved")