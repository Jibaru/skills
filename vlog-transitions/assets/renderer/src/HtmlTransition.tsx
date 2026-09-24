import React, {useEffect, useRef, useState} from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// Mounts the staged transition (public/current/template.html) in an iframe and
// drives its deterministic window.seek(t) from Remotion's frame clock. The
// template is the single source of truth for the animation; this component is
// only a clock adapter.

type SeekWindow = Window & {
  seek?: (t: number) => void;
  READY?: boolean;
};

export const HtmlTransition: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [loadHandle] = useState(() => delayRender('template-load'));

  const onLoad = () => {
    // Wait until the template signals READY (fonts + sticker images loaded).
    const poll = () => {
      const win = ref.current?.contentWindow as SeekWindow | null;
      if (win && typeof win.seek === 'function' && win.READY === true) {
        setReady(true);
        continueRender(loadHandle);
      } else {
        setTimeout(poll, 50);
      }
    };
    poll();
  };

  useEffect(() => {
    if (!ready) {
      return;
    }
    const win = ref.current?.contentWindow as SeekWindow | null;
    if (!win || typeof win.seek !== 'function') {
      return;
    }
    const handle = delayRender(`seek-${frame}`);
    win.seek(frame / fps);
    // Double rAF inside the iframe guarantees the styles are painted before
    // Remotion screenshots the frame.
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => continueRender(handle));
    });
  }, [frame, fps, ready]);

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <iframe
        ref={ref}
        src={staticFile('current/template.html')}
        onLoad={onLoad}
        style={{width: '100%', height: '100%', border: 0}}
      />
    </AbsoluteFill>
  );
};
