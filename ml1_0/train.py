from torchvision.models import efficientnet_b0

model = efficientnet_b0(weights="DEFAULT")
model.classifier[1] = nn.Linear(
    model.classifier[1].in_features,
    4
)
torch.save(
    model.state_dict(),
    "skyguardians_damage_model.pth"
)