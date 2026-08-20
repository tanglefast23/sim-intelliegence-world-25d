import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { CHARACTER_IDS, type CharacterId } from '../render/atlas';
import { portraitExpressions, portraits } from './QuestOfferDialogue';

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
  const identityId = portraitIdentityId(npcId);
  const source = portraitExpressions[identityId]?.[expression]
    ?? portraits[identityId]
    ?? portraits['generic-resident'];
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [expression, identityId]);

  return (
    <View
      accessibilityLabel={`Portrait of ${displayName}`}
      nativeID={`conversation-portrait-${identityId}`}
      style={[styles.frame, scale === 3 && styles.largeFrame, scale === 6 && styles.cinematicFrame, scale === 9 && styles.cutsceneFrame, scale === 20 && styles.dialogueFrame]}
    >
      <Image
        key={`${identityId}:${expression}`}
        onLoad={() => setLoaded(true)}
        resizeMode="contain"
        source={source}
        style={styles.portrait}
      />
      {loaded ? <View nativeID={`conversation-portrait-${identityId}-ready`} style={styles.ready} /> : null}
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
  portrait: { height: '100%', width: '100%' },
  ready: { height: 0, width: 0 },
});
