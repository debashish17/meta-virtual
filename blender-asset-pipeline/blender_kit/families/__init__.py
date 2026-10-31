"""Family registry: catalogue family name -> builder. Names match data/families.toml."""

from . import chairs, desk, greenery, openings, partitions, rooms, soft, storage, tables, tech, utility

FAMILIES = {
    "desk": desk.build,
    "task_chair": chairs.task_chair,
    "side_chair": chairs.side_chair,
    "armchair": chairs.armchair,
    "stool": chairs.stool,
    "sofa": soft.sofa,
    "pouf": soft.pouf,
    "rug": soft.rug,
    "table": tables.build,
    "cabinet": storage.cabinet,
    "shelf": storage.shelf,
    "plant": greenery.plant,
    "planter": greenery.planter,
    "partition": partitions.build,
    "door": openings.door,
    "window": openings.window,
    "screen": tech.screen,
    "board": tech.board,
    "stand": tech.stand,
    "bin": utility.bin_,
    "appliance": utility.appliance,
    "booth": rooms.booth,
    "lamp": rooms.lamp,
}
