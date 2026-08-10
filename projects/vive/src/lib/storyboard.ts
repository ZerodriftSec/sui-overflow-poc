import type { StoryboardCard } from "./project";

const SCENE_HEADING_PATTERN = /^(INT|EXT|INT\/EXT|EST)\./i;
const SHOT_HEADING_PATTERN =
  /^(?:EXTREME\s+CLOSE\s+UP|CLOSE\s+UP|MEDIUM\s+CLOSE\s+UP|MEDIUM\s+SHOT|WIDE\s+SHOT|EXTREME\s+WIDE\s+SHOT|OVER[-\s]THE[-\s]SHOULDER|INSERT|POV|ANGLE\s+ON|CUTAWAY)\b/i;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function toParagraphs(scriptContent: string): string[] {
  return scriptContent
    .split(/\n{2,}/)
    .map((part) => normalizeLine(part))
    .filter((part) => part.length > 0);
}

export function splitScriptIntoScenes(scriptContent: string): string[] {
  const lines = scriptContent.split("\n");
  const scenes: string[] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    if (SCENE_HEADING_PATTERN.test(line) && current.length > 0) {
      scenes.push(current.join("\n"));
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    scenes.push(current.join("\n"));
  }

  if (scenes.length > 0) {
    return scenes;
  }

  return toParagraphs(scriptContent);
}

function linesFromScene(scene: string): string[] {
  return scene
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function pickDialogue(lines: string[]): string {
  const dialogueLines = lines.filter((line) =>
    /^[A-Z][A-Z0-9 '\-().]{1,30}:/.test(line),
  );
  if (dialogueLines.length > 0) {
    return dialogueLines.slice(0, 3).join("\n");
  }
  return "";
}

function fallbackTitle(sceneHeading: string, sceneIndex: number): string {
  if (sceneHeading) return `Scene ${sceneIndex + 1}: ${sceneHeading}`;
  return `Scene ${sceneIndex + 1}`;
}

interface FallbackShotBlock {
  heading: string;
  lines: string[];
}

function splitSceneIntoShotBlocks(lines: string[]): FallbackShotBlock[] {
  const blocks: FallbackShotBlock[] = [];
  let current: FallbackShotBlock | null = null;

  for (const line of lines) {
    if (SCENE_HEADING_PATTERN.test(line)) {
      continue;
    }

    if (SHOT_HEADING_PATTERN.test(line)) {
      if (current && current.lines.length > 0) {
        blocks.push(current);
      }
      current = { heading: line, lines: [] };
      continue;
    }

    if (!current) {
      current = { heading: "", lines: [] };
    }
    current.lines.push(line);
  }

  if (current && current.lines.length > 0) {
    blocks.push(current);
  }

  return blocks;
}

function shotTypeFromHeading(heading: string): StoryboardCard["shotType"] {
  if (/EXTREME\s+CLOSE\s+UP/i.test(heading)) return "ECU";
  if (/MEDIUM\s+CLOSE\s+UP/i.test(heading)) return "MCU";
  if (/CLOSE\s+UP/i.test(heading)) return "CU";
  if (/EXTREME\s+WIDE\s+SHOT/i.test(heading)) return "EWS";
  if (/WIDE\s+SHOT/i.test(heading)) return "WS";
  return "MS";
}

function compactShotDescription(lines: string[], sceneIndex: number): string {
  const description = lines
    .filter((line) => !/^[A-Z][A-Z0-9 '\-().]{1,30}:/.test(line))
    .slice(0, 2)
    .join(" ");

  return (
    description ||
    `Establish the visual context and emotional tone for scene ${sceneIndex + 1}.`
  );
}

function buildBaseCard(input: {
  sceneIndex: number;
  shotIndex: number;
  title: string;
  shotDescription: string;
  dialogue: string;
  characterAction: string;
}): StoryboardCard {
  return {
    id: crypto.randomUUID(),
    sceneIndex: input.sceneIndex,
    shotIndex: input.shotIndex,
    title: input.title,
    scriptSegment: `Scene ${input.sceneIndex + 1}`,
    storyPurpose: "Advance the scene while preserving continuity.",
    shotDescription: input.shotDescription,
    shotType: "MS",
    cameraAngle: "eye-level",
    cameraMovement: "Static with subtle breathing room",
    characterAction: input.characterAction,
    visualSketch: "",
    sceneGraph: null,
    blocking2d: null,
    dialogue: input.dialogue,
    voiceover: "",
    sfx: "",
    musicCue: "",
    continuity: "",
    estimatedDurationSec: 4,
    transitionOut: "cut",
    generationPrompt: "",
    negativePrompt:
      "No extra limbs, no warped faces, no text overlays, no logo watermarks",
    status: "draft",
  };
}

export function buildStoryboardPrompt(card: StoryboardCard): string {
  const parts = [
    `Cinematic ${card.shotType} shot at ${card.cameraAngle} angle.`,
    card.shotDescription,
    card.scriptSegment ? `Script segment: ${card.scriptSegment}.` : "",
    card.characterAction ? `Action: ${card.characterAction}.` : "",
    card.cameraMovement ? `Camera move: ${card.cameraMovement}.` : "",
    card.visualSketch ? `Reference: ${card.visualSketch}.` : "",
    card.continuity ? `Continuity constraints: ${card.continuity}.` : "",
    card.sfx ? `Sound effects: ${card.sfx}.` : "",
    card.musicCue ? `Music cue: ${card.musicCue}.` : "",
    `Duration target: ${card.estimatedDurationSec} seconds.`,
  ];
  return parts.filter((part) => part.trim().length > 0).join(" ");
}

export function buildStoryboardCardsFromScript(
  scriptContent: string,
): StoryboardCard[] {
  const scenes = splitScriptIntoScenes(scriptContent);
  const cards: StoryboardCard[] = [];

  scenes.forEach((scene, sceneIndex) => {
    const lines = linesFromScene(scene);
    if (lines.length === 0) return;

    const sceneHeading =
      lines.find((line) => SCENE_HEADING_PATTERN.test(line)) ?? "";
    const dialogue = pickDialogue(lines);
    const shotBlocks = splitSceneIntoShotBlocks(lines);

    shotBlocks.forEach((block, blockIndex) => {
      const card = buildBaseCard({
        sceneIndex,
        shotIndex: blockIndex + 1,
        title: block.heading
          ? `${fallbackTitle(sceneHeading, sceneIndex)} - ${block.heading}`
          : fallbackTitle(sceneHeading, sceneIndex),
        shotDescription: compactShotDescription(block.lines, sceneIndex),
        dialogue: pickDialogue(block.lines),
        characterAction:
          block.lines[0] ?? "Introduce blocking and key movement beats.",
      });
      card.shotType = shotTypeFromHeading(block.heading);
      card.generationPrompt = buildStoryboardPrompt(card);
      cards.push(card);
    });

    if (dialogue && shotBlocks.length <= 1) {
      const reactionCard = buildBaseCard({
        sceneIndex,
        shotIndex: 2,
        title: `${fallbackTitle(sceneHeading, sceneIndex)} - Reaction`,
        shotDescription:
          "Capture emotional reaction to the previous beat with tighter framing.",
        dialogue,
        characterAction: "Push in on reaction, then hold for performance beat.",
      });
      reactionCard.shotType = "CU";
      reactionCard.cameraMovement = "Slow dolly in";
      reactionCard.estimatedDurationSec = 3;
      reactionCard.generationPrompt = buildStoryboardPrompt(reactionCard);
      cards.push(reactionCard);
    }
  });

  return cards.map((card, index) => ({
    ...card,
    shotIndex: index + 1,
  }));
}

export function renumberStoryboardCards(
  cards: StoryboardCard[],
): StoryboardCard[] {
  return cards.map((card, index) => ({
    ...card,
    shotIndex: index + 1,
  }));
}
