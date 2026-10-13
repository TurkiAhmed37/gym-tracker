// Starting program, taken from Hypertrophy_Training_Plan.pdf.
// Only used the first time a user signs in (or when they reset the program).
// After that, the program lives in the user's data and is edited from the Program page.

export const MUSCLES = [
  'Chest', 'Back', 'Front delts', 'Side delts', 'Rear delts',
  'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs',
];

// primary = counts as 1 set, secondary = counts as 0.5 set (rules from page 7 of the plan)
// [id, name, primary, secondary, notes, compound]
const EX = [
  ['flat-db-bench', 'Flat Dumbbell Bench Press', ['Chest'], ['Triceps', 'Front delts'], 'Alt: chest press machine or barbell bench press.', true],
  ['lat-pulldown', 'Lat Pulldown (medium grip)', ['Back'], ['Biceps', 'Forearms'], 'Alt: pull-ups or assisted pull-ups.', true],
  ['smith-incline', 'Smith Machine Incline Press', ['Chest'], ['Triceps', 'Front delts'], 'Bench at about 30°. Alt: incline press machine.', true],
  ['cs-row', 'Chest-Supported Row', ['Back'], ['Biceps', 'Forearms', 'Rear delts'], 'Row machine with chest pad, or chest-supported T-bar row.', true],
  ['pec-deck', 'Pec Deck Fly', ['Chest'], [], 'Alt: cable fly.', false],
  ['db-lateral', 'Dumbbell Lateral Raise', ['Side delts'], [], 'Alt: lateral raise machine.', false],
  ['standing-calf', 'Standing Calf Raise', ['Calves'], [], 'Alt: calf raise on the leg press.', false],
  ['leg-press', 'Leg Press', ['Quads'], ['Glutes'], 'Main lift of the day. Lower under control.', true],
  ['rdl', 'Romanian Deadlift (barbell)', ['Hamstrings', 'Glutes'], [], 'Hips back, knees slightly bent, bar close to the legs.', true],
  ['reverse-lunge', 'Reverse Lunge', ['Quads', 'Glutes'], [], 'Smith machine or dumbbells. Reps are per leg.', true],
  ['seated-leg-curl', 'Seated Leg Curl', ['Hamstrings'], [], 'Alt: lying leg curl.', false],
  ['leg-extension', 'Leg Extension', ['Quads'], [], '', false],
  ['wrist-curl', 'Barbell Wrist Curl', ['Forearms'], [], 'Palms up, forearms on thighs.', false],
  ['cable-crunch', 'Cable Crunch', ['Abs'], [], 'Kneeling, rope held beside the head.', false],
  ['db-shoulder-press', 'Seated Dumbbell Shoulder Press', ['Front delts'], ['Side delts', 'Triceps'], 'Alt: shoulder press machine.', true],
  ['cable-lateral', 'Cable Lateral Raise', ['Side delts'], [], 'One arm at a time, low pulley. Alt: machine.', false],
  ['preacher-curl', 'Preacher Curl (EZ bar or machine)', ['Biceps'], ['Forearms'], '', false],
  ['pushdown', 'Triceps Pushdown (cable)', ['Triceps'], [], 'Bar or rope.', false],
  ['reverse-pec-deck', 'Reverse Pec Deck', ['Rear delts'], [], 'Alt: cable rear delt fly.', false],
  ['hammer-curl', 'Hammer Curl', ['Biceps', 'Forearms'], [], 'Palms face each other.', false],
  ['overhead-ext', 'Overhead Cable Triceps Extension', ['Triceps'], [], 'Rope, facing away from the pulley.', false],
  ['hanging-leg-raise', 'Hanging Leg Raise', ['Abs'], [], "Alt: captain's chair leg raise.", false],
  ['incline-db-press', 'Incline Dumbbell Press', ['Chest'], ['Triceps', 'Front delts'], 'Alt: incline press machine.', true],
  ['neutral-pulldown', 'Close Neutral-Grip Pulldown', ['Back'], ['Biceps', 'Forearms'], 'V-bar handle, pull to the upper chest.', true],
  ['cable-row', 'Seated Cable Row', ['Back'], ['Biceps', 'Forearms', 'Rear delts'], 'Alt: any row machine.', true],
  ['cable-fly', 'Cable Fly', ['Chest'], [], 'Alt: pec deck.', false],
  ['cs-rear-delt', 'Chest-Supported Rear Delt Raise', ['Rear delts'], [], 'Dumbbells, face down on an incline bench.', false],
  ['incline-curl', 'Incline Dumbbell Curl', ['Biceps'], ['Forearms'], '', false],
  ['lying-db-ext', 'Lying Dumbbell Triceps Extension', ['Triceps'], [], 'Same bench, set flat or low.', false],
  ['squat', 'Barbell Squat', ['Quads', 'Glutes'], [], 'Main lift of the day.', true],
  ['back-extension', '45° Back Extension (weighted)', ['Hamstrings', 'Glutes'], [], 'Hold a plate against the chest.', true],
  ['lying-leg-curl', 'Lying Leg Curl', ['Hamstrings'], [], '', false],
  ['hip-thrust', 'Barbell Hip Thrust', ['Glutes'], [], 'Upper back on a bench. Alt: hip thrust machine.', true],
  ['seated-calf', 'Seated Calf Raise', ['Calves'], [], '', false],
];

// [exerciseId, sets, repMin, repMax, superset label]
const DAYS = [
  ['upper-a', 'Upper A', 'Chest + back, side delts, calves', false, [
    ['flat-db-bench', 3, 6, 10], ['lat-pulldown', 3, 8, 12], ['smith-incline', 3, 8, 12],
    ['cs-row', 3, 8, 12], ['pec-deck', 2, 10, 15], ['db-lateral', 3, 10, 20, 'A'], ['standing-calf', 3, 10, 15, 'A'],
  ]],
  ['legs-1', 'Legs 1', 'Quads, hamstrings, glutes, calves, forearms, abs', false, [
    ['leg-press', 3, 6, 10], ['rdl', 3, 8, 12], ['reverse-lunge', 3, 8, 12], ['seated-leg-curl', 4, 10, 15],
    ['leg-extension', 2, 10, 15], ['standing-calf', 4, 10, 15, 'A'], ['wrist-curl', 3, 12, 20, 'A'], ['cable-crunch', 4, 10, 15],
  ]],
  ['upper-b', 'Upper B', 'Shoulders + arms, abs', false, [
    ['db-shoulder-press', 3, 6, 10], ['cable-lateral', 4, 10, 20], ['preacher-curl', 3, 8, 12, 'A'], ['pushdown', 3, 8, 12, 'A'],
    ['reverse-pec-deck', 3, 12, 20], ['hammer-curl', 2, 10, 15, 'B'], ['overhead-ext', 2, 10, 15, 'B'], ['hanging-leg-raise', 3, 10, 15],
  ]],
  ['upper-c', 'Upper C', 'Full upper body', false, [
    ['incline-db-press', 3, 8, 12], ['neutral-pulldown', 3, 8, 12], ['cable-row', 3, 8, 12], ['cable-fly', 2, 10, 15],
    ['db-lateral', 3, 10, 20, 'A'], ['cs-rear-delt', 2, 12, 20, 'A'], ['incline-curl', 2, 8, 12, 'B'], ['lying-db-ext', 2, 8, 12, 'B'],
  ]],
  ['legs-2', 'Legs 2', 'Squat day (optional)', true, [
    ['squat', 3, 6, 10], ['back-extension', 3, 8, 12], ['lying-leg-curl', 3, 10, 15], ['leg-extension', 3, 10, 15],
    ['hip-thrust', 2, 8, 12], ['seated-calf', 4, 10, 15, 'A'], ['cable-crunch', 3, 10, 15, 'A'],
  ]],
];

export function seedProgram() {
  const exercises = {};
  for (const [id, name, primary, secondary, notes, compound] of EX) {
    exercises[id] = { id, name, primary, secondary, notes, compound, archived: false };
  }
  const days = DAYS.map(([id, name, focus, optional, slots]) => ({
    id, name, focus, optional,
    slots: slots.map(([exId, sets, repMin, repMax, ss]) => ({ exId, sets, repMin, repMax, ss: ss || '' })),
  }));
  return { exercises, days };
}

export function defaultSettings() {
  return { targetMin: 10, targetMax: 20, lastExportAt: null, deloadWeeks: [], accent: 'blue', goal: '', quote: '' };
}
