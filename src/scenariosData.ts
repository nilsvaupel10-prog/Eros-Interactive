export interface ScenarioPreset {
  id: string;
  name: string;
  emoji: string;
  shortDescription: string;
  fullSetup: string;
}

export const defaultScenarios: ScenarioPreset[] = [
  {
    id: 'truth_or_dare',
    name: 'Truth or Dare',
    emoji: '🎲',
    shortDescription: 'The classic unhinged living room game that grows more explicit by the round.',
    fullSetup: 'The group gathers around the sofa, drinks in hand, playing a highly charged game of Truth or Dare. Each round demands bolder confessions and physical acts as psychological and physical defenses evaporate.'
  },
  {
    id: 'mountain_cabin',
    name: 'Locked Cabin',
    emoji: '🏔️',
    shortDescription: 'Locked inside a luxury ski cabin by a freezing snowstorm with a single bed.',
    fullSetup: 'A freezing mountain storm traps them in a cozy, isolated luxury cabin with a roaring fireplace, plenty of liquor, and only one massive bed. Group heat is the only way to beat the cold.'
  },
  {
    id: 'beach_bonfire',
    name: 'Beach Bonfire',
    emoji: '🔥',
    shortDescription: 'A private midnight beach gathering under the stars, sharing blankets and drinks.',
    fullSetup: 'Under a clear dark sky, they gather next to a warm sand bonfire. Covered in shared blankets, with the crashing waves as soundtrack, the boundaries between friendship and touch wash away.'
  },
  {
    id: 'vip_lounge',
    name: 'VIP Club Lounge',
    emoji: '🥂',
    shortDescription: 'The private, high-status backroom of a premium venue, heavy with substances and synth.',
    fullSetup: 'Sunk deep into plush velvet couches in a locked VIP suite. The bass shakes the floors, the drinks are flowing, and the combination of exclusive access and physical energy leads to daring touch.'
  }
];
