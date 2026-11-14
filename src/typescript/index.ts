/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export { LocalOrigin, type IVector3 } from "./core/LocalOrigin.js";
export {
    NavigationPreset,
    type INavigationBinding,
    type INavigationPresetData,
    type IPointerGesture,
    NavigationAction,
    PointerKind
} from "./core/NavigationPreset.js";
export type { IGridOptions } from "./render/IGridOptions.js";
export {
    Viewport, type IBoxOptions, type IViewportOptions, type IEntityPick, type ICameraChangedHandler
} from "./render/Viewport.js";

export type { ICameraState } from "./core/ICameraState.js";
export {
    MapView, type IMapOptions, MapSource, type IMapLoadingChangedHandler, type IMapErrorHandler
} from "./map/MapView.js";
export type { IDrawing, IDrawingPath, IDrawingCurve, IDrawingLabel, IMeshGeometry } from "./core/IDrawing.js";
export { DxfCodec } from "./io/DxfCodec.js";
export { Coordinates } from "./core/Coordinates.js";
export { DrawingArea, type IDrawingBounds } from "./core/DrawingArea.js";

export { AxisColours, type IAxisColours } from "./render/AxisColours.js";
export { NavigationCubeTheme } from "./render/NavigationCubeTheme.js";

export { DrawingShapes, DrawingShape } from "./core/DrawingShapes.js";
export {
    DrawingSelection, type IPoint2, SelectionMode, SelectionOperation
} from "./core/DrawingSelection.js";

export { EntityDocument } from "./core/entities/EntityDocument.js";
export { BaseEntity } from "./core/entities/BaseEntity.js";
export { EntityRegistry } from "./core/entities/EntityRegistry.js";
export {
    EntityTypes, PolylineEntity, RectangleEntity, CircleEntity, MeshEntity, GroupEntity, type IPolylineData,
    type ICircleData, type IRectangleData, type IMeshData, type IGroupData
} from "./core/entities/EntityTypes.js";
export type { IEntity, IEntityInput, IEntityType, IEntityEdit, IEntityGeometry, IEntityGrip,
    IEntityLayer, IEntityDocumentData, IEntitySnap, IEntityPart,
    IEntityCapabilities } from "./core/entities/IEntity.js";
export { EntityTransforms, type EntityTransform } from "./core/entities/EntityTransform.js";

export { EntityDrawingTool, DrawingPrimitive, type IEntityDrawingOptions } from "./tools/EntityDrawingTool.js";

export { WorkingPlane } from "./core/WorkingPlane.js";
export { EntitySnapResolver, SnapSurfaceKind, type ISnapResult } from "./tools/EntitySnapResolver.js";

export { EntityMoveTool } from "./tools/EntityMoveTool.js";

export { EntityAutosave, type IEntitySnapshot, type IEntityPersistence } from "./core/entities/EntityAutosave.js";
export { BrowserProjectStore } from "./io/BrowserProjectStore.js";

export {
    EntityTransformGizmo, type ITransformGizmoView, type ITransformGizmoOptions, TransformMode, type IGripTarget
} from "./tools/EntityTransformGizmo.js";
export { TransformCursor, ActiveCursor, CursorOperation } from "./tools/TransformCursor.js";

export {
    EntityTopology, type IEntityTopologyData, type ITopologyVertex, type ITopologyEdge, type ITopologyFace,
    type IOrientedEdge, type VertexId, type EdgeId, type FaceId
} from "./core/entities/EntityTopology.js";
export { BaseTopologyEntity, TopologyEntity, BoxEntity, type IBoxData } from "./core/entities/TopologyEntity.js";

export { EntityDocumentEventKind } from "./core/entities/contracts/EntityDocumentEventKind.js";
export type { IAddEntitiesRequest } from "./core/entities/contracts/IAddEntitiesRequest.js";
export type { ICopyEntitiesRequest } from "./core/entities/contracts/ICopyEntitiesRequest.js";
export type { IEntityDocumentAction } from "./core/entities/contracts/IEntityDocumentAction.js";
export type { IEntityDocumentEvent } from "./core/entities/contracts/IEntityDocumentEvent.js";
export type { IEntityDocumentListener } from "./core/entities/contracts/IEntityDocumentListener.js";
export type { IEntityDocumentOptions } from "./core/entities/contracts/IEntityDocumentOptions.js";
export type { IEntityErrorHandler } from "./core/entities/contracts/IEntityErrorHandler.js";
export type { IEntityPointProjector } from "./core/entities/contracts/IEntityPointProjector.js";
export type { IGroupEntitiesRequest } from "./core/entities/contracts/IGroupEntitiesRequest.js";
export type { IImportDocumentRequest } from "./core/entities/contracts/IImportDocumentRequest.js";
export type { IMoveEntitiesToLayerRequest } from "./core/entities/contracts/IMoveEntitiesToLayerRequest.js";
export type { IMoveGripRequest } from "./core/entities/contracts/IMoveGripRequest.js";
export type { IMovePartRequest } from "./core/entities/contracts/IMovePartRequest.js";
export type { IRemoveEntitiesRequest } from "./core/entities/contracts/IRemoveEntitiesRequest.js";
export type { IRemoveLayerRequest } from "./core/entities/contracts/IRemoveLayerRequest.js";
export type { IRenameLayerRequest } from "./core/entities/contracts/IRenameLayerRequest.js";
export type { IReplaceDocumentRequest } from "./core/entities/contracts/IReplaceDocumentRequest.js";
export type { ISetLayerRequest } from "./core/entities/contracts/ISetLayerRequest.js";
export type { ITransformEntitiesRequest } from "./core/entities/contracts/ITransformEntitiesRequest.js";
export type { IUngroupEntityRequest } from "./core/entities/contracts/IUngroupEntityRequest.js";

export { EntityPartKind, EntityGripRole, EntitySnapKind, EntityTypeId } from "./core/entities/IEntity.js";
export { FaceRepresentationKind } from "./core/entities/EntityTopology.js";

export type { ITerrainOptions } from "./map/ITerrainOptions.js";
export { NavigationView } from "./render/NavigationView.js";

export type { IEntityBinding } from "./core/entities/contracts/IEntityBinding.js";
export type { IRegisteredEntityType } from "./core/entities/contracts/IRegisteredEntityType.js";
