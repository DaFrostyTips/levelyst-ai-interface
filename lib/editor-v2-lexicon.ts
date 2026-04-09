const SYSTEM_LABELS: Record<string, string> = {
  "player/platformer_controller": "Platformer Controller",
  "physics/gravity": "Gravity Physics",
  "camera/side_scroll": "Side-Scroll Camera",
  "enemy/basic_enemy": "Basic Enemy",
  "systems/checkpoint": "Checkpoint System",
  "systems/coin_collectible": "Coin Collectible",
  "player/fps_controller": "FPS Controller",
  "combat/hitscan_weapon": "Hitscan Weapon",
  "ai/basic_zombie": "Basic Zombie",
  "systems/wave_manager": "Wave Manager",
  "physics/character_body": "Character Body",
  movement: "Platformer Controller",
  camera: "Side-Scroll Camera",
  combat: "Hitscan Weapon",
  "enemy-ai": "Basic Zombie",
  "wave-manager": "Wave Manager",
  checkpoints: "Checkpoint System",
}

const SECTION_CANONICALS: Array<{ label: string; aliases: string[] }> = [
  { label: "Intro", aliases: ["intro", "opening", "start"] },
  {
    label: "Gameplay Loop",
    aliases: ["gameplay loop", "main gameplay", "loop", "main loop", "infiltration", "lap one", "lap two"],
  },
  { label: "Puzzle Section", aliases: ["puzzle", "puzzle section"] },
  { label: "Mid Boss", aliases: ["mid boss", "phase one", "phase two"] },
  { label: "Boss Fight", aliases: ["boss", "boss fight", "boss encounter", "final boss"] },
  { label: "End", aliases: ["end", "escape", "finish"] },
]

export function getSystemLabel(typeId: string, fallback?: string) {
  return SYSTEM_LABELS[typeId] ?? fallback ?? typeId
}

export function normalizeSectionLabel(raw: string) {
  const normalized = raw
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()

  if (!normalized) return ""

  const matched = SECTION_CANONICALS.find((entry) => entry.aliases.includes(normalized))
  if (matched) return matched.label

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}
