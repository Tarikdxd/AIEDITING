import {AdapterRegistry} from '@aiediting/adapter-sdk';
import {BlenderAdapter} from '@aiediting/adapter-blender';
import {FfmpegAdapter} from '@aiediting/adapter-ffmpeg';
import {HyperframesAdapter} from '@aiediting/adapter-hyperframes';
import {MotionCanvasAdapter} from '@aiediting/adapter-motion-canvas';
import {MptAdapter} from '@aiediting/adapter-mpt';
import {RemotionAdapter} from '@aiediting/adapter-remotion';
import {StykanimateAdapter} from '@aiediting/adapter-stykanimate';

export function createDefaultRegistry(): AdapterRegistry {
  return new AdapterRegistry()
    .register(new FfmpegAdapter())
    .register(new HyperframesAdapter())
    .register(new RemotionAdapter())
    .register(new MotionCanvasAdapter())
    .register(new BlenderAdapter())
    .register(new StykanimateAdapter())
    .register(new MptAdapter());
}

export {AdapterRegistry};
