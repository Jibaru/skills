import React from 'react';
import {Composition} from 'remotion';
import {HtmlTransition} from './HtmlTransition';
import config from './current-config.json';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Transition"
      component={HtmlTransition}
      width={config.size.width}
      height={config.size.height}
      fps={config.fps}
      durationInFrames={Math.round(config.durationSeconds * config.fps)}
    />
  );
};
