import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ViewportSize } from '../render/camera';
import type { CharacterId } from '../render/atlas';
import type { UiScale } from '../render/responsive-layout';
import { UI_LAYER } from './ui-layers';
import { uiMetrics } from './ui-metrics';

const portraits: Partial<Record<CharacterId, number>> = {
  'devon-price': require('../../assets/source/dialogue-portraits/devon-price.png') as number,
  'elise-moreau': require('../../assets/source/dialogue-portraits/elise-moreau.png') as number,
  'generic-resident': require('../../assets/source/dialogue-portraits/generic-resident.png') as number,
  linda: require('../../assets/source/dialogue-portraits/linda.png') as number,
  'linda-boyfriend': require('../../assets/source/dialogue-portraits/linda-boyfriend.png') as number,
  'mina-park': require('../../assets/source/dialogue-portraits/mina-park.png') as number,
  'priya-nair': require('../../assets/source/dialogue-portraits/priya-nair.png') as number,
  protagonist: require('../../assets/source/dialogue-portraits/protagonist.png') as number,
  'rafael-cruz': require('../../assets/source/dialogue-portraits/rafael-cruz.png') as number,
  'resident-01': require('../../assets/source/dialogue-portraits/resident-01.png') as number,
  'resident-02': require('../../assets/source/dialogue-portraits/resident-02.png') as number,
  'resident-03': require('../../assets/source/dialogue-portraits/resident-03.png') as number,
  'resident-04': require('../../assets/source/dialogue-portraits/resident-04.png') as number,
  'resident-05': require('../../assets/source/dialogue-portraits/resident-05.png') as number,
  'resident-06': require('../../assets/source/dialogue-portraits/resident-06.png') as number,
  'resident-07': require('../../assets/source/dialogue-portraits/resident-07.png') as number,
  'resident-08': require('../../assets/source/dialogue-portraits/resident-08.png') as number,
  'resident-09': require('../../assets/source/dialogue-portraits/resident-09.png') as number,
  'resident-10': require('../../assets/source/dialogue-portraits/resident-10.png') as number,
  'resident-11': require('../../assets/source/dialogue-portraits/resident-11.png') as number,
  'resident-12': require('../../assets/source/dialogue-portraits/resident-12.png') as number,
  'resident-13': require('../../assets/source/dialogue-portraits/resident-13.png') as number,
  'resident-14': require('../../assets/source/dialogue-portraits/resident-14.png') as number,
  'resident-15': require('../../assets/source/dialogue-portraits/resident-15.png') as number,
  'resident-16': require('../../assets/source/dialogue-portraits/resident-16.png') as number,
  'resident-17': require('../../assets/source/dialogue-portraits/resident-17.png') as number,
  'resident-18': require('../../assets/source/dialogue-portraits/resident-18.png') as number,
  'resident-19': require('../../assets/source/dialogue-portraits/resident-19.png') as number,
  'resident-20': require('../../assets/source/dialogue-portraits/resident-20.png') as number,
  'resident-21': require('../../assets/source/dialogue-portraits/resident-21.png') as number,
  'resident-22': require('../../assets/source/dialogue-portraits/resident-22.png') as number,
  'resident-23': require('../../assets/source/dialogue-portraits/resident-23.png') as number,
  'resident-24': require('../../assets/source/dialogue-portraits/resident-24.png') as number,
  'sora-tan': require('../../assets/source/dialogue-portraits/sora-tan.png') as number,
  'tomas-reed': require('../../assets/source/dialogue-portraits/tomas-reed.png') as number,
};

type QuestOfferDialogueProps = Readonly<{
  accent: string;
  onAccept: () => void;
  onDecline: () => void;
  playerName: string;
  speakerId?: Exclude<CharacterId, 'protagonist'>;
  speakerName?: string;
  speakerText?: string;
  surface: ViewportSize;
  uiScale: UiScale;
}>;

export function QuestOfferDialogue({
  accent,
  onAccept,
  onDecline,
  playerName,
  speakerId = 'linda',
  speakerName = 'Linda',
  speakerText = 'My boyfriend has been frightening me. I do not feel safe checking on him alone. Will you help me?',
  surface,
  uiScale,
}: QuestOfferDialogueProps) {
  const [playerPortraitLoaded, setPlayerPortraitLoaded] = useState(false);
  const [speakerPortraitLoaded, setSpeakerPortraitLoaded] = useState(false);
  useEffect(() => setSpeakerPortraitLoaded(false), [speakerId]);
  const metrics = uiMetrics(uiScale);
  const choiceWidth = Math.min(430, Math.round(surface.width * 0.36));
  const stripHeight = Math.max(Math.round(150 * metrics.scale), Math.round(surface.height * 0.22));
  const portraitHeight = Math.min(700, Math.round(surface.height * 0.96));
  const portraitWidth = Math.round(portraitHeight * 754 / 900);
  const dialogueText = { fontSize: metrics.conversationText, lineHeight: Math.round(metrics.conversationText * 1.5) };
  return (
    <View accessibilityLabel={`${speakerName} authored dialogue`} nativeID="world-ui-quest-offer-overlay" style={styles.overlay}>
      <View
        nativeID="world-ui-quest-offer-panel"
        style={[styles.scene, { height: surface.height, width: surface.width }]}
      >
        <View style={styles.actorLeft}>
          <Image
            accessibilityLabel={`Portrait of ${playerName}`}
            nativeID="conversation-portrait-protagonist"
            onLoad={() => setPlayerPortraitLoaded(true)}
            resizeMode="contain"
            source={portraits.protagonist}
            style={{ height: portraitHeight, width: portraitWidth }}
          />
          {playerPortraitLoaded ? <View nativeID="conversation-portrait-protagonist-ready" style={styles.portraitReady} /> : null}
        </View>
        <View style={styles.actorRight}>
          <Image
            accessibilityLabel={`Portrait of ${speakerName}`}
            nativeID={`conversation-portrait-${speakerId}`}
            onLoad={() => setSpeakerPortraitLoaded(true)}
            resizeMode="contain"
            source={portraits[speakerId] ?? portraits['generic-resident']}
            style={{ height: portraitHeight, width: portraitWidth }}
          />
          {speakerPortraitLoaded ? <View nativeID={`conversation-portrait-${speakerId}-ready`} style={styles.portraitReady} /> : null}
        </View>
        <View style={[styles.actions, { bottom: stripHeight + metrics.gap, left: (surface.width - choiceWidth) / 2, width: choiceWidth }] }>
          <Pressable
            accessibilityLabel={speakerId === 'linda' ? "Accept Linda's request" : `Ask ${speakerName} what happened`}
            onPress={onAccept}
            role="button"
            style={({ pressed }) => [styles.accept, { minHeight: metrics.primaryControl }, pressed && styles.pressed]}
          >
            <Text style={[styles.acceptText, { fontSize: metrics.persistentText }]}>{speakerId === 'linda' ? 'YES · HELP LINDA' : 'ASK WHAT HAPPENED'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={speakerId === 'linda' ? "Decline Linda's request" : `Leave ${speakerName}`}
            onPress={onDecline}
            role="button"
            style={({ pressed }) => [styles.decline, { minHeight: metrics.primaryControl }, pressed && styles.pressed]}
          >
            <Text style={[styles.declineText, { fontSize: metrics.persistentText }]}>{speakerId === 'linda' ? 'NO · NOT NOW' : 'LEAVE'}</Text>
          </Pressable>
        </View>
        <View accessibilityLiveRegion="polite" style={[styles.speech, { height: stripHeight, paddingHorizontal: Math.max(28, Math.round(surface.width * 0.19)) }] }>
          <View style={[styles.nameplate, { backgroundColor: accent }]}>
            <Text style={[styles.speaker, { fontSize: metrics.persistentText }]}>{speakerName.toUpperCase()}</Text>
          </View>
          <Text style={[styles.dialogue, dialogueText]}>
            {speakerText}
          </Text>
          <Text style={[styles.question, { fontSize: metrics.secondaryText }]}>{speakerName.toUpperCase()} IS WAITING FOR {playerName.toUpperCase()}'S ANSWER.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accept: { alignItems: 'center', backgroundColor: '#d3a04c', justifyContent: 'center', paddingHorizontal: 14 },
  acceptText: { color: '#211d1a', fontFamily: 'Silkscreen' },
  actions: { flexDirection: 'column', gap: 7, position: 'absolute', zIndex: 5 },
  actorLeft: { bottom: 0, left: 0, position: 'absolute', zIndex: 2 },
  actorRight: { bottom: 0, position: 'absolute', right: '1%', zIndex: 2 },
  decline: { alignItems: 'center', backgroundColor: '#100d0ae6', borderColor: '#76573d', borderWidth: 1, justifyContent: 'center', paddingHorizontal: 14 },
  declineText: { color: '#c3b18f', fontFamily: 'Silkscreen' },
  dialogue: { color: '#fff0c7', fontFamily: 'Silkscreen' },
  nameplate: { alignItems: 'center', borderColor: '#fff0c7', borderWidth: 1, minWidth: 180, paddingHorizontal: 22, paddingVertical: 7, position: 'absolute', right: '18%', top: -18 },
  overlay: { backgroundColor: '#08090733', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: UI_LAYER.cutscene },
  pressed: { opacity: 0.78, transform: [{ translateY: 2 }] },
  portraitReady: { height: 0, width: 0 },
  question: { color: '#9d8768', fontFamily: 'Silkscreen', marginTop: 10 },
  scene: { overflow: 'hidden', position: 'relative' },
  speaker: { color: '#211d1a', fontFamily: 'Silkscreen' },
  speech: { backgroundColor: '#100d0ae6', borderTopColor: '#9c6a3d', borderTopWidth: 2, bottom: 0, justifyContent: 'center', left: 0, paddingBottom: 18, paddingTop: 28, position: 'absolute', right: 0, zIndex: 4 },
});
