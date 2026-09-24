import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setOverwriteOutput(true);
// H.264 4K60 by default; quality over speed for the final render.
Config.setCodec('h264');
Config.setCrf(16);
