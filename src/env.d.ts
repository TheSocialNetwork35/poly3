export {};

declare global {
  interface Window {
    __POLYTRACK_062__?: PolyTrackBridge;
    __POLYVIEWER_INPUT_ACTIVE__: boolean;
  }

  interface PolyTrackBridge {
    readonly version: "0.6.2";
    readonly renderer: PolyTrackRenderer;
    readonly scene: PolyTrackScene;
    readonly camera: PolyTrackCamera;
    readonly canvas: HTMLCanvasElement;
    readonly state: object;
  }

  interface PolyTrackRenderer {
    readonly scene: PolyTrackScene;
    readonly camera: PolyTrackCamera;
    readonly canvas: HTMLCanvasElement;
  }

  interface PolyTrackScene {
    onBeforeRender: ((...args: unknown[]) => void) | null;
  }

  interface PolyTrackVector3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): PolyTrackVector3;
  }

  interface PolyTrackQuaternion {
    x: number;
    y: number;
    z: number;
    w: number;
    set(x: number, y: number, z: number, w: number): PolyTrackQuaternion;
  }

  interface PolyTrackCamera {
    position: PolyTrackVector3;
    quaternion: PolyTrackQuaternion;
    fov?: number;
    aspect?: number;
    updateProjectionMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    matrixWorldInverse: { copy(value: unknown): { invert(): void } };
    matrixWorld: unknown;
  }
}
