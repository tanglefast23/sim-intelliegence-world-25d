import { StyleSheet, View } from 'react-native';

import { ATLAS_INDEX, CHARACTER_IDS, atlasRectangle, type CharacterId } from '../render/atlas';
import { AtlasSprite } from './AtlasSprite';

const PORTRAIT_SCALE = 2;

export function portraitIdentityId(npcId: string): CharacterId {
  const candidate = npcId.replaceAll('_', '-') as CharacterId;
  return CHARACTER_IDS.includes(candidate) ? candidate : 'generic-resident';
}

export function portraitCharacterId(npcId: string): CharacterId {
  const identityId = portraitIdentityId(npcId);
  return identityId === 'protagonist' ? 'vampire-01' : identityId;
}

export function CharacterPortrait({
  displayName,
  expression = 'rest',
  npcId,
  scale = PORTRAIT_SCALE,
}: Readonly<{
  displayName: string;
  expression?: 'rest' | 'joy' | 'upset';
  npcId: string;
  scale?: 2 | 3 | 6 | 9 | 20;
}>) {
  const characterId = portraitCharacterId(npcId);
  const identityId = portraitIdentityId(npcId);
  const portraitId = ATLAS_INDEX.characters[characterId].portraits[expression]
    ?? ATLAS_INDEX.characters[characterId].portrait;
  const source = atlasRectangle(portraitId);

  // The ready node is a proof signal that harnesses wait on, so it must not appear for a crop that
  // is wrong. Previously it mounted unconditionally, so a missing expression, an id remapped to
  // generic-resident, or an out-of-atlas rectangle all still reported ready.
  // The expression fallback is deliberate: 26 of 35 characters ship only a rest portrait, so
  // requiring an exact expression match would hide the ready node for most of the cast and hang
  // any harness waiting on it. What must never pass is a crop that is not actually in the atlas.
  const withinAtlas = source.width > 0 && source.height > 0 &&
    source.x >= 0 && source.y >= 0 &&
    source.x + source.width <= ATLAS_INDEX.image.width &&
    source.y + source.height <= ATLAS_INDEX.image.height;
  const cropProven = withinAtlas;

  return (
    <View
      accessibilityLabel={`Portrait of ${displayName}`}
      nativeID={`conversation-portrait-${identityId}`}
      style={[styles.frame, scale === 3 && styles.largeFrame, scale === 6 && styles.cinematicFrame, scale === 9 && styles.cutsceneFrame, scale === 20 && styles.dialogueFrame]}
    >
      <AtlasSprite
        height={source.height}
        key={`${identityId}:${characterId}`}
        scale={scale}
        width={source.width}
        x={source.x}
        y={source.y}
      />
      {cropProven ? <View nativeID={`conversation-portrait-${identityId}-ready`} style={styles.ready} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cinematicCanvas: { height: 264, width: 240 },
  cinematicFrame: { backgroundColor: 'transparent', borderWidth: 0, height: 264, width: 240 },
  cutsceneCanvas: { height: 396, width: 360 },
  cutsceneFrame: { backgroundColor: 'transparent', borderWidth: 0, height: 396, width: 360 },
  dialogueCanvas: { height: 580, width: 480 },
  dialogueFrame: { backgroundColor: 'transparent', borderWidth: 0, height: 580, width: 480 },
  canvas: { height: 88, width: 80 },
  frame: {
    backgroundColor: '#181512',
    borderColor: '#76573d',
    borderWidth: 1,
    height: 90,
    overflow: 'hidden',
    width: 82,
  },
  largeCanvas: { height: 132, width: 120 },
  largeFrame: { height: 134, width: 122 },
  ready: { height: 0, width: 0 },
});
