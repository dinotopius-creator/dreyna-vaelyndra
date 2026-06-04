from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(globals().get("__file__", "scripts/generate_creature_assets.py")).resolve().parents[1]


def build_icon(size: int, transparent: bool = False) -> Image.Image:
    image = Image.new(
        "RGBA",
        (size, size),
        (0, 0, 0, 0) if transparent else (7, 3, 15, 255),
    )
    pixels = image.load()
    center = size / 2

    for y in range(size):
        for x in range(size):
            dx = (x - center) / size
            dy = (y - center) / size
            distance = (dx * dx + dy * dy) ** 0.5
            violet = max(0, 1 - distance * 2.1)
            gold = max(
                0,
                1
                - ((x - size * 0.36) ** 2 + (y - size * 0.31) ** 2) ** 0.5
                / (size * 0.72),
            )
            pixels[x, y] = (
                int(7 + 32 * violet + 44 * gold),
                int(3 + 16 * violet + 24 * gold),
                int(15 + 54 * violet),
                pixels[x, y][3],
            )

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (size * 0.14, size * 0.14, size * 0.86, size * 0.86),
        outline=(232, 183, 79, 130),
        width=max(2, size // 28),
    )
    glow_draw.ellipse(
        (size * 0.20, size * 0.20, size * 0.80, size * 0.80),
        fill=(11, 6, 28, 225),
    )
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(max(1, size // 90))))

    draw = ImageDraw.Draw(image)
    crown = [
        (size * 0.29, size * 0.56),
        (size * 0.27, size * 0.38),
        (size * 0.40, size * 0.47),
        (size * 0.50, size * 0.28),
        (size * 0.60, size * 0.47),
        (size * 0.73, size * 0.38),
        (size * 0.71, size * 0.56),
    ]
    draw.polygon([(x + size * 0.015, y + size * 0.02) for x, y in crown], fill=(0, 0, 0, 90))
    draw.polygon(crown, fill=(255, 220, 139, 255))
    draw.rectangle((size * 0.29, size * 0.56, size * 0.71, size * 0.65), fill=(191, 124, 39, 255))
    draw.rectangle((size * 0.34, size * 0.59, size * 0.66, size * 0.63), fill=(255, 220, 139, 255))
    for x, y, radius in [(0.27, 0.37, 0.035), (0.50, 0.27, 0.04), (0.73, 0.37, 0.035)]:
        draw.ellipse(
            (
                size * (x - radius),
                size * (y - radius),
                size * (x + radius),
                size * (y + radius),
            ),
            fill=(255, 220, 139, 255),
        )

    draw.arc(
        (size * 0.25, size * 0.24, size * 0.75, size * 0.76),
        35,
        145,
        fill=(122, 212, 255, 170),
        width=max(2, size // 38),
    )
    draw.arc(
        (size * 0.20, size * 0.20, size * 0.80, size * 0.80),
        205,
        325,
        fill=(255, 146, 213, 145),
        width=max(2, size // 44),
    )
    return image


def save_icons() -> None:
    launcher_sizes = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    foreground_sizes = {
        "mdpi": 108,
        "hdpi": 162,
        "xhdpi": 216,
        "xxhdpi": 324,
        "xxxhdpi": 432,
    }

    for density, size in launcher_sizes.items():
        output = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
        output.mkdir(parents=True, exist_ok=True)
        icon = build_icon(size)
        icon.save(output / "ic_launcher.png")
        icon.save(output / "ic_launcher_round.png")

    for density, size in foreground_sizes.items():
        output = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
        output.mkdir(parents=True, exist_ok=True)
        build_icon(size, transparent=True).save(output / "ic_launcher_foreground.png")

    for size, filename in [
        (180, "apple-touch-icon.png"),
        (192, "app-icon-192.png"),
        (512, "app-icon-512.png"),
    ]:
        build_icon(size).save(ROOT / "public" / filename)


def save_splash() -> None:
    canvas_size = 2732
    splash = Image.new("RGBA", (canvas_size, canvas_size), (7, 3, 15, 255))
    pixels = splash.load()
    center_x = canvas_size / 2
    center_y = canvas_size * 0.46

    for y in range(canvas_size):
        for x in range(canvas_size):
            dx = (x - center_x) / canvas_size
            dy = (y - center_y) / canvas_size
            glow = max(0, 1 - (dx * dx + dy * dy) ** 0.5 * 2)
            pixels[x, y] = (
                int(7 + glow * 25),
                int(3 + glow * 11),
                int(15 + glow * 45),
                255,
            )

    emblem_size = 920
    splash.alpha_composite(
        build_icon(emblem_size),
        ((canvas_size - emblem_size) // 2, 760),
    )

    resized = splash.resize((1080, 1080), Image.Resampling.LANCZOS)
    drawable_names = [
        "drawable",
        "drawable-land-hdpi",
        "drawable-land-mdpi",
        "drawable-land-xhdpi",
        "drawable-land-xxhdpi",
        "drawable-land-xxxhdpi",
        "drawable-port-hdpi",
        "drawable-port-mdpi",
        "drawable-port-xhdpi",
        "drawable-port-xxhdpi",
        "drawable-port-xxxhdpi",
    ]
    for name in drawable_names:
        output = ROOT / "android" / "app" / "src" / "main" / "res" / name
        output.mkdir(parents=True, exist_ok=True)
        resized.save(output / "splash.png")


if __name__ == "__main__":
    save_icons()
    save_splash()
    print("Generated Vaelyndra Creature APK assets.")
