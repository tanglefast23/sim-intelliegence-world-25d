import type { PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { isPanArrowKey, keyboardPanDelta } from './world-pan';

type ScreenPoint = Readonly<{ x: number; y: number }>;

type WorldInputProps = PropsWithChildren<Readonly<{
  disabled?: boolean;
  onCancel: () => void;
  onCenter: () => void;
  onQuests: () => void;
  onPan: (delta: ScreenPoint) => void;
  onPrimary: (point: ScreenPoint) => void;
  onZoom: (direction: -1 | 1, anchor: ScreenPoint) => void;
  isPointInteractive: (point: ScreenPoint) => boolean;
}>>;

function eventPoint(event: PointerEvent | WheelEvent, element: HTMLElement): ScreenPoint {
  const viewport = element.querySelector('#world-input-viewport');
  if (!(viewport instanceof HTMLElement)) throw new Error('World input viewport is missing.');
  const bounds = viewport.getBoundingClientRect();
  return { x: Math.floor(event.clientX - bounds.left), y: Math.floor(event.clientY - bounds.top) };
}

export function WorldInput({ children, disabled = false, isPointInteractive, onCancel, onCenter, onPan, onPrimary, onQuests, onZoom }: WorldInputProps) {
  const rootRef = useRef<View>(null);
  const handlersRef = useRef({ disabled, isPointInteractive, onCancel, onCenter, onPan, onPrimary, onQuests, onZoom });
  handlersRef.current = { disabled, isPointInteractive, onCancel, onCenter, onPan, onPrimary, onQuests, onZoom };

  useEffect(() => {
    const element = rootRef.current as unknown as HTMLElement | null;
    if (!element || typeof window === 'undefined') return;
    let middlePointerId: number | undefined;
    let lastMiddlePoint: ScreenPoint | undefined;
    let pendingPan = { x: 0, y: 0 };
    let panFrame = 0;
    // Space is the keyboard twin of the middle button. While it is held, moving the mouse pans
    // whether or not a button is down, so plain motion and a left drag are the same gesture, and
    // the arrow keys pan on their own clock.
    let spaceHeld = false;
    let lastPointerPoint: ScreenPoint | undefined;
    const heldArrows = new Set<string>();
    let keyboardPanFrame = 0;
    let keyboardPanLast = 0;
    let pendingZoom: Readonly<{ direction: -1 | 1; anchor: ScreenPoint }> | undefined;
    let zoomFrame = 0;

    const flushPan = () => {
      panFrame = 0;
      if (pendingPan.x !== 0 || pendingPan.y !== 0) handlersRef.current.onPan(pendingPan);
      pendingPan = { x: 0, y: 0 };
    };
    const queuePan = (delta: ScreenPoint) => {
      pendingPan = { x: pendingPan.x + delta.x, y: pendingPan.y + delta.y };
      if (panFrame === 0) panFrame = requestAnimationFrame(flushPan);
    };
    const flushZoom = () => {
      zoomFrame = 0;
      if (pendingZoom) handlersRef.current.onZoom(pendingZoom.direction, pendingZoom.anchor);
      pendingZoom = undefined;
    };
    const queueZoom = (direction: -1 | 1, anchor: ScreenPoint) => {
      pendingZoom = { direction, anchor };
      if (zoomFrame === 0) zoomFrame = requestAnimationFrame(flushZoom);
    };
    const stopKeyboardPan = () => {
      if (keyboardPanFrame !== 0) cancelAnimationFrame(keyboardPanFrame);
      keyboardPanFrame = 0;
      keyboardPanLast = 0;
    };
    const stepKeyboardPan = (timestamp: number) => {
      keyboardPanFrame = 0;
      if (handlersRef.current.disabled || heldArrows.size === 0) {
        keyboardPanLast = 0;
        return;
      }
      // The first frame has no previous timestamp to measure against, so it contributes nothing
      // and only starts the clock. Every later frame integrates its own elapsed time.
      if (keyboardPanLast !== 0) {
        handlersRef.current.onPan(keyboardPanDelta(heldArrows, timestamp - keyboardPanLast));
      }
      keyboardPanLast = timestamp;
      keyboardPanFrame = requestAnimationFrame(stepKeyboardPan);
    };
    const startKeyboardPan = () => {
      if (keyboardPanFrame !== 0) return;
      keyboardPanLast = 0;
      keyboardPanFrame = requestAnimationFrame(stepKeyboardPan);
    };
    const releaseSpacePan = () => {
      spaceHeld = false;
      heldArrows.clear();
      stopKeyboardPan();
    };
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    const isUiTarget = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('[id^="world-ui-"]'));
    const handlePointerDown = (event: PointerEvent) => {
      if (handlersRef.current.disabled) return;
      if (isUiTarget(event.target)) return;
      const point = eventPoint(event, element);
      lastPointerPoint = point;
      if (spaceHeld && event.button === 0) {
        // Space claims the left button, so a click cannot also send the player somewhere. Capture
        // keeps the drag alive when the cursor leaves the surface, exactly like the middle button.
        event.preventDefault();
        element.setPointerCapture?.(event.pointerId);
        return;
      }
      if (event.button === 1) {
        // Deliberately NOT gated on `isPointInteractive`. That gate asks "is there map under the
        // cursor", which is the right question for a click on the world and the wrong one for a
        // camera control: once a pan has brought void on screen, gating here would refuse the very
        // drag that pans back, and the drag would feel dead exactly where it is needed most.
        event.preventDefault();
        middlePointerId = event.pointerId;
        lastMiddlePoint = point;
        element.setPointerCapture?.(event.pointerId);
      } else if (event.button === 0) {
        if (!handlersRef.current.isPointInteractive(point)) return;
        handlersRef.current.onPrimary(point);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (handlersRef.current.disabled) return;
      const point = eventPoint(event, element);
      if (event.pointerId === middlePointerId && lastMiddlePoint) {
        queuePan({ x: point.x - lastMiddlePoint.x, y: point.y - lastMiddlePoint.y });
        lastMiddlePoint = point;
        lastPointerPoint = point;
        return;
      }
      // The middle button wins when both are down, so one motion never pans twice.
      if (spaceHeld && middlePointerId === undefined && lastPointerPoint) {
        queuePan({ x: point.x - lastPointerPoint.x, y: point.y - lastPointerPoint.y });
      }
      lastPointerPoint = point;
    };
    const releasePointer = (event: PointerEvent) => {
      if (event.pointerId !== middlePointerId) {
        if (spaceHeld) element.releasePointerCapture?.(event.pointerId);
        return;
      }
      element.releasePointerCapture?.(event.pointerId);
      middlePointerId = undefined;
      lastMiddlePoint = undefined;
    };
    const handleWheel = (event: WheelEvent) => {
      if (handlersRef.current.disabled) return;
      if (isUiTarget(event.target)) return;
      const point = eventPoint(event, element);
      // Same reasoning as the middle button: zoom is a camera control, so void under the cursor is
      // not a reason to refuse it. `zoomCameraAt` clamps the result either way.
      if (event.deltaY === 0) return;
      event.preventDefault();
      queueZoom(event.deltaY < 0 ? 1 : -1, point);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (handlersRef.current.disabled) return;
      const target = event.target;
      if (isTypingTarget(target)) return;
      if (event.code === 'Space' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        // Without this the page scrolls and the button under the cursor activates.
        event.preventDefault();
        spaceHeld = true;
      }
      if (isPanArrowKey(event.key)) {
        // Arrows pan on their own; Space is not required. The UI guard is what keeps the volume
        // sliders usable, since they are focusable Views that read the same arrow keys.
        if (isUiTarget(target)) return;
        event.preventDefault();
        heldArrows.add(event.key);
        startKeyboardPan();
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'f') {
        handlersRef.current.onCenter();
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        handlersRef.current.onQuests();
      }
      if (event.key === 'Escape') handlersRef.current.onCancel();
    };
    // Not gated on `disabled`: a key that goes down while the world is live and comes up while a
    // panel is open must still clear, or Space stays stuck down and every mouse move pans.
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        releaseSpacePan();
        return;
      }
      if (!isPanArrowKey(event.key)) return;
      heldArrows.delete(event.key);
      if (heldArrows.size === 0) stopKeyboardPan();
    };
    // Holding Space and switching window drops the keyup, so clear on the way out.
    const handleBlur = () => releaseSpacePan();
    const preventMiddleClick = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };
    const handleActivePanProof = (event: Event) => {
      if (handlersRef.current.disabled) return;
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as Partial<ScreenPoint> | undefined;
      if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;
      handlersRef.current.onPan({ x: Number(detail.x), y: Number(detail.y) });
    };

    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', releasePointer);
    element.addEventListener('pointercancel', releasePointer);
    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('auxclick', preventMiddleClick);
    if (window.siWorldSmokeMode === true) {
      element.addEventListener('si-world-active-pan-proof', handleActivePanProof);
    }
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      if (panFrame !== 0) cancelAnimationFrame(panFrame);
      if (zoomFrame !== 0) cancelAnimationFrame(zoomFrame);
      stopKeyboardPan();
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', releasePointer);
      element.removeEventListener('pointercancel', releasePointer);
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('auxclick', preventMiddleClick);
      if (window.siWorldSmokeMode === true) {
        element.removeEventListener('si-world-active-pan-proof', handleActivePanProof);
      }
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return <View nativeID="world-input-surface" ref={rootRef}>{children}</View>;
}
