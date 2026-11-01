"""Filesystem locations. Everything is resolved from this file, so commands work from any cwd."""

from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]
REPO = PIPELINE.parent

REFERENCE = REPO / "reference"
DATA = PIPELINE / "data"
GENERATED = PIPELINE / "generated" / "catalog"
OCR_CACHE = GENERATED / "ocr"
REPORT = GENERATED / "report.json"

WEB_CATALOGUE = REPO / "apps" / "web" / "public" / "assets" / "catalogue"
CROPS = WEB_CATALOGUE / "crops"
CROPS_URL = "/assets/catalogue/crops"
REVIEW_PAGE = WEB_CATALOGUE / "index.html"

SHARED_CATALOGUE = REPO / "packages" / "shared" / "src" / "catalogue" / "catalogue.generated.json"
SHARED_BUILDS = SHARED_CATALOGUE.with_name("builds.generated.json")
SHARED_WORLD = REPO / "packages" / "shared" / "src" / "world"
SHARED_SPRITES = SHARED_WORLD / "sprites.generated.json"        # reference crops placed as scene props
SHARED_FOOTPRINTS = SHARED_WORLD / "footprints.generated.json"  # measured part sizes, for obstacles
SPRITES = REPO / "apps" / "web" / "public" / "assets" / "sprites"
SPRITES_URL = "/assets/sprites"

WINOCR = Path(__file__).resolve().parent / "winocr.ps1"

# build stage
KIT = PIPELINE / "blender_kit"
KIT_ENTRY = KIT / "entry.py"
BLENDER_DEFAULT = Path(r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
LEDGER = GENERATED / "build_ledger.json"
TEXTURES = PIPELINE / "generated" / "textures"   # detail maps blender_kit/materials.py tints
REVIEW_BASELINE = GENERATED / "review_baseline.json"  # GLB hashes behind decisions saved without one
BATCHES = GENERATED / "batches"
REVIEWS = DATA / "reviews.json"
MODELS = REPO / "apps" / "web" / "public" / "assets" / "models" / "catalogue"
MODELS_URL = "/assets/models/catalogue"
THUMBS = WEB_CATALOGUE / "thumbs"
THUMBS_URL = "/assets/catalogue/thumbs"
BUILD_REVIEW_PAGE = WEB_CATALOGUE / "review.html"
