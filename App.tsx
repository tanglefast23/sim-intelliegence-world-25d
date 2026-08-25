import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { installWebAccessibilityStyles } from './src/application/accessibility';
import { verifyAtlasDigest } from './src/application/atlas-integrity';
import { LoadingShell } from './src/application/LoadingShell';
import { type ResourceState, settleResourceGate } from './src/application/ResourceGate';
import { VOCAL_CUE_ASSETS } from './src/audio/vocal-cues';
import { ATLAS_INDEX } from './src/render/atlas';
import GameSurfaceShell from './src/render/GameSurfaceShell';

// Stage 7 removed the phase-2 proof assets. The generated world atlas and the generated vocal
// cues are the shipped resources, so the gate proves those instead.
const worldAtlas = require('./assets/generated/world-atlas.png') as number;
const hfmSilkscreenRegular = require('./assets/fonts/HFMSilkscreen_400Regular.ttf') as number;
const hfmSilkscreenBold = require('./assets/fonts/HFMSilkscreen_700Bold.ttf') as number;

export default function App() {
  const [resources, setResources] = useState<ResourceState>({ status: 'loading' });

  useEffect(() => {
    installWebAccessibilityStyles();
  }, []);

  useEffect(() => {
    let active = true;
    const startedAt = performance.now();
    void settleResourceGate(async () => {
      const [, loadedAssets] = await Promise.all([
        Font.loadAsync({ Silkscreen: hfmSilkscreenRegular, HFMSilkscreenBold: hfmSilkscreenBold }),
        Asset.loadAsync([worldAtlas, ...VOCAL_CUE_ASSETS]),
      ]);
      const worldImageAsset = loadedAssets.find((asset) => asset.name.includes('world-atlas'));
      if (!worldImageAsset) {
        throw new Error('Generated world atlas was not resolved.');
      }
      const vocalCueAssets = loadedAssets.filter((asset) => ['greeting', 'laugh', 'sigh', 'consequence'].some((name) => asset.name.includes(name)));
      if (vocalCueAssets.length !== VOCAL_CUE_ASSETS.length) {
        throw new Error('One or more vocal cues were not resolved.');
      }
      const worldImageResponse = await fetch(worldImageAsset.localUri ?? worldImageAsset.uri);
      if (!worldImageResponse.ok) {
        throw new Error('Generated world atlas could not be loaded.');
      }
      await verifyAtlasDigest(await worldImageResponse.arrayBuffer(), ATLAS_INDEX.image.sha256);
      const vocalCueResponses = await Promise.all(vocalCueAssets.map((asset) => fetch(asset.localUri ?? asset.uri)));
      if (vocalCueResponses.some((response) => !response.ok)) {
        throw new Error('A packaged vocal cue could not be loaded.');
      }
      const vocalCueBuffers = await Promise.all(vocalCueResponses.map((response) => response.arrayBuffer()));
      if (vocalCueBuffers.some((buffer) => buffer.byteLength === 0)) {
        throw new Error('A packaged vocal cue was empty.');
      }
      const remainingLoadingTime = Math.max(0, 500 - (performance.now() - startedAt));
      await new Promise((resolveDelay) => setTimeout(resolveDelay, remainingLoadingTime));
    }).then((nextState) => {
      if (active) {
        setResources(nextState);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (resources.status === 'failed') {
    return <LoadingShell detail={resources.detail} failed />;
  }

  if (resources.status === 'loading') {
    return <LoadingShell detail="Loading packaged font, image, and audio…" />;
  }

  return (
    <>
      <GameSurfaceShell assetsLoaded={resources.assetsLoaded} />
      <StatusBar style="light" />
    </>
  );
}
