/** Read after SceneArchive has updated world matrices. Export only: no per-frame game work. */
export function snapshotCarLights(replay: PolyTrackReplayRuntimeBridge | null) {
  return (replay?.listReplays?.() ?? []).flatMap(summary => {
    if (!summary.visible || summary.opacity <= 0) return [];
    const car = replay?.getCar?.(summary.id);
    if (!car?.polyviewerGetExportCar) throw new Error("Car lighting requires the updated PolyViewer runtime. Reload the page before exporting.");
    const state = car.polyviewerGetExportCar();
    if (!state.visible) return [];
    if (state.matrix.length !== 16 || !state.matrix.every(Number.isFinite)) throw new Error("Car lighting received an invalid chassis transform.");
    return [{ id: summary.id, name: summary.name, matrix: [...state.matrix], braking: state.braking === true, opacity: summary.opacity }];
  });
}
