/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { DrawingSelection, SelectionMode, SelectionOperation } from "../DrawingSelection.js";
import { EntityTypeId } from "./IEntity.js";
import { EntityTypes } from "./EntityTypes.js";
import { EntityTransforms } from "./EntityTransform.js";
import { EntityDocumentEventKind } from "./contracts/EntityDocumentEventKind.js";

import type { IDrawing, IDrawingPath, IMeshGeometry } from "../IDrawing.js";
import type { IVector3 } from "../LocalOrigin.js";
import type { IPoint2 } from "../DrawingSelection.js";
import type {
    IEntity, IEntityLayer, IEntityDocumentData, IEntityGrip, IEntityCapabilities, IEntityPart, IEntityEdit
} from "./IEntity.js";
import type { EntityTopology } from "./EntityTopology.js";
import type { EntityRegistry } from "./EntityRegistry.js";
import type { EntityTransform } from "./EntityTransform.js";
import type { IAddEntitiesRequest } from "./contracts/IAddEntitiesRequest.js";
import type { IRemoveEntitiesRequest } from "./contracts/IRemoveEntitiesRequest.js";
import type { ICopyEntitiesRequest } from "./contracts/ICopyEntitiesRequest.js";
import type { ITransformEntitiesRequest } from "./contracts/ITransformEntitiesRequest.js";
import type { IMoveGripRequest } from "./contracts/IMoveGripRequest.js";
import type { IMovePartRequest } from "./contracts/IMovePartRequest.js";
import type { IGroupEntitiesRequest } from "./contracts/IGroupEntitiesRequest.js";
import type { IUngroupEntityRequest } from "./contracts/IUngroupEntityRequest.js";
import type { ISetLayerRequest } from "./contracts/ISetLayerRequest.js";
import type { IMoveEntitiesToLayerRequest } from "./contracts/IMoveEntitiesToLayerRequest.js";
import type { IRenameLayerRequest } from "./contracts/IRenameLayerRequest.js";
import type { IRemoveLayerRequest } from "./contracts/IRemoveLayerRequest.js";
import type { IImportDocumentRequest } from "./contracts/IImportDocumentRequest.js";
import type { IReplaceDocumentRequest } from "./contracts/IReplaceDocumentRequest.js";
import type { IEntityDocumentDraft } from "./contracts/IEntityDocumentDraft.js";
import type { IEntityDocumentMutation } from "./contracts/IEntityDocumentMutation.js";
import type { IEntityDocumentAction } from "./contracts/IEntityDocumentAction.js";
import type { IEntityDocumentListener } from "./contracts/IEntityDocumentListener.js";
import type { IEntityPointProjector } from "./contracts/IEntityPointProjector.js";
import type { IEntityDocumentOptions } from "./contracts/IEntityDocumentOptions.js";
import type { IEntityDocumentEvent } from "./contracts/IEntityDocumentEvent.js";
import type { ITransaction } from "./contracts/ITransaction.js";

export class EntityDocument {
    private static readonly DEFAULT_HISTORY_STEPS : number = 100;
    private static readonly DEFAULT_HISTORY_BYTES : number = 33_554_432;
    private static readonly TRIANGLE_VERTEX_COUNT : number = 3;
    private static readonly SELECTION_COLOUR : number = 0xffbb33;

    public readonly registry : EntityRegistry;
    private readonly options : IEntityDocumentOptions;
    private entities = new Map<string, IEntity>();
    private readonly children = new Map<string | null, string[]>();
    private readonly worldTransforms = new Map<string, EntityTransform>();
    private layers = new Map<string, IEntityLayer>([
        ["default", {name: "default", visible: true, locked: false}]
    ]);
    private readonly selected = new Set<string>();
    private readonly undo : ITransaction[] = [];
    private readonly redo : ITransaction[] = [];
    private readonly listeners = new Set<IEntityDocumentListener>();
    private readonly queue : IEntityDocumentAction[] = [];
    private processing : boolean = false;
    private revision : number = 0;
    private sequence : number = 0;
    private readonly historySteps : number;
    private readonly historyBytes : number;

    constructor(registry : EntityRegistry = EntityTypes.CreateRegistry(),
        options : IEntityDocumentOptions = {}) {
        this.registry = registry;
        this.options = options;
        this.historySteps = options.historySteps ?? EntityDocument.DEFAULT_HISTORY_STEPS;
        this.historyBytes = options.historyBytes ?? EntityDocument.DEFAULT_HISTORY_BYTES;
        if (!Number.isInteger(this.historySteps) || this.historySteps < 1 ||
            !Number.isFinite(this.historyBytes) || this.historyBytes < 1) {
            throw new RangeError("History limits must be positive.");
        }
    }

    public NewId() : string {
        let id : string;
        do {
            id = `entity-${String(++this.sequence)}`;
        } while (this.entities.has(id));
        return id;
    }

    public getRevision() : number {
        return this.revision;
    }

    public getEntities() : readonly IEntity[] {
        return structuredClone([...this.entities.values()]);
    }

    public getLayers() : readonly IEntityLayer[] {
        return structuredClone([...this.layers.values()]);
    }

    public getSelection() : readonly string[] {
        return [...this.selected];
    }

    public getEntity(id : string) : IEntity {
        return structuredClone(this.requireEntity(id));
    }

    public Subscribe(listener : IEntityDocumentListener) : IEntityDocumentAction {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public AddEntities(request : IAddEntitiesRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.addEntities(draft, copy);
            });
        });
    }

    public RemoveEntities(request : IRemoveEntitiesRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.removeEntities(draft, copy);
            });
        });
    }

    public CopyEntities(request : ICopyEntitiesRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.copyEntities(draft, copy);
            });
        });
    }

    public TransformEntities(request : ITransformEntitiesRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.transformEntities(draft, copy);
            }, copy.expectedRevision);
        });
    }

    public MoveGrip(request : IMoveGripRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.moveGrip(draft, copy);
            }, copy.expectedRevision);
        });
    }

    public MovePart(request : IMovePartRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.applyMovePart(draft, copy);
            }, copy.expectedRevision);
        });
    }

    public GroupEntities(request : IGroupEntitiesRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.groupEntities(draft, copy);
            });
        });
    }

    public UngroupEntity(request : IUngroupEntityRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.ungroupEntity(draft, copy);
            });
        });
    }

    public setLayer(request : ISetLayerRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.applySetLayer(draft, copy);
            });
        });
    }

    public MoveEntitiesToLayer(request : IMoveEntitiesToLayerRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.moveEntitiesToLayer(draft, copy);
            });
        });
    }

    public RenameLayer(request : IRenameLayerRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.renameLayer(draft, copy);
            });
        });
    }

    public RemoveLayer(request : IRemoveLayerRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.removeLayer(draft, copy);
            });
        });
    }

    public ImportDocument(request : IImportDocumentRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.importDocument(draft, copy);
            });
        });
    }

    public ReplaceDocument(request : IReplaceDocumentRequest) : void {
        const copy = structuredClone(request);
        this.dispatch(() => {
            this.commit((draft) => {
                this.replaceDocument(draft, copy);
            });
        });
    }

    public Select(ids : readonly string[], operation : SelectionOperation = SelectionOperation.REPLACE) : void {
        const copy = [...ids];
        this.dispatch(() => {
            this.select(copy, operation);
        });
    }

    public IsVisible(id : string) : boolean {
        return this.ancestors(id).every((entity) => this.layers.get(entity.layer)?.visible === true);
    }

    public IsEditable(id : string) : boolean {
        return this.IsVisible(id) && this.ancestors(id).every((entity) => !this.layers.get(entity.layer)?.locked);
    }

    public getCapabilities(id : string) : IEntityCapabilities {
        const entity = this.requireEntity(id);
        const capabilities = this.registry.getType(entity.type).Parse(entity.data).getCapabilities();
        return {...capabilities, grips: capabilities.grips && this.IsEditable(id)};
    }

    // Logical topology uses entity-local coordinates, independent of render triangulation.
    public getTopology(id : string) : EntityTopology | undefined {
        const entity = this.requireEntity(id);
        return this.registry.getType(entity.type).Parse(entity.data).getTopology();
    }

    public getWorldTransform(id : string) : EntityTransform {
        return [...this.world(id, this.entities, this.worldTransforms)];
    }

    public getChildren(id : string | null) : readonly IEntity[] {
        return structuredClone((this.children.get(id) ?? []).map((child) => this.requireEntity(child)));
    }

    public getGeometry(id : string, descendants : boolean = true) : readonly IDrawingPath[] {
        const entity = this.requireEntity(id);
        if (!this.IsVisible(id)) {
            return [];
        }
        const matrix = this.getWorldTransform(id);
        const geometry = this.registry.getType(entity.type).Parse(entity.data).getGeometry();
        const faces : IDrawingPath[] = (geometry.meshes ?? []).flatMap((mesh) =>
            Array.from({length: mesh.triangles.length / EntityDocument.TRIANGLE_VERTEX_COUNT}, (_, index) => ({
                layer: entity.layer,
                closed: true, filled: true, points: mesh.triangles.slice(index * EntityDocument.TRIANGLE_VERTEX_COUNT,
                    (index + 1) * EntityDocument.TRIANGLE_VERTEX_COUNT)
                    .flatMap((vertex) => mesh.vertices[vertex] === undefined ? [] : [mesh.vertices[vertex]])})));
        const own = [...geometry.paths, ...faces].map((path) => ({
            ...path, layer: entity.layer,
            points: path.points.map((point) => EntityTransforms.TransformPoint(matrix, point)),
            ...(path.curve === undefined ? {} : {curve: {...path.curve,
                centre: EntityTransforms.TransformPoint(matrix, path.curve.centre),
                axisU: EntityTransforms.TransformPoint(matrix, path.curve.axisU, true),
                axisV: EntityTransforms.TransformPoint(matrix, path.curve.axisV, true)}})
        }));
        return descendants ? [...own, ...this.getChildren(id).flatMap((child) => this.getGeometry(child.id))] : own;
    }

    public getGrips(id : string) : readonly IEntityGrip[] {
        const entity = this.requireEntity(id);
        if (!this.IsEditable(id)) {
            return [];
        }
        const matrix = this.getWorldTransform(id);
        return this.registry.getType(entity.type).Parse(entity.data).getGrips().map((grip) =>
            ({...grip, position: EntityTransforms.TransformPoint(matrix, grip.position),
                ...(grip.plane === undefined ? {} : {plane: EntityTransforms.Multiply(matrix, grip.plane)})}));
    }

    public getDrawing() : IDrawing {
        return this.draw();
    }

    public PreviewGrip(id : string, grip : string, position : IVector3, revision : number) : IDrawing {
        if (revision !== this.revision) {
            throw new Error("Entity preview is stale.");
        }
        const entity = this.requireEntity(id);
        const result = this.editGrip(id, grip, position);
        this.registry.getType(result.type).Validate(result.data);
        return this.draw(new Map([[id, {...entity, ...result}]]));
    }

    public PreviewPart(id : string, part : IEntityPart, delta : IVector3, revision : number) : IDrawing {
        if (revision !== this.revision) {
            throw new Error("Entity preview is stale.");
        }
        this.assertEditableTree(id);
        const result = this.movePart(id, part, delta);
        this.registry.getType(result.type).Validate(result.data);
        return this.draw(new Map([[id, {...this.requireEntity(id), ...result}]]));
    }

    public PreviewTransform(ids : readonly string[], delta : EntityTransform, revision : number) : IDrawing {
        if (revision !== this.revision) {
            throw new Error("Entity preview is stale.");
        }
        return this.draw(this.transformOverrides(ids, delta));
    }

    public SelectRegion(region : readonly IPoint2[], mode : SelectionMode, operation : SelectionOperation,
        project : IEntityPointProjector, scope : string | null = null) : void {
        const ids = this.getChildren(scope).filter((entity) => {
            if (!this.IsEditable(entity.id)) {
                return false;
            }
            const parts = this.getGeometry(entity.id);
            const matches = parts.map((part) => {
                const projected = part.points.map(project);
                return projected.every((point) => point !== null) && DrawingSelection.PathInSelection(
                    projected, region, mode, part.closed, part.filled ?? false);
            });
            return matches.length > 0 &&
                (mode === SelectionMode.WINDOW ? matches.every(Boolean) : matches.some(Boolean));
        }).map((entity) => entity.id);
        this.Select(ids, operation);
    }

    public Undo() : void {
        this.dispatch(() => {
            this.travel(this.undo, this.redo, false);
        });
    }

    public Redo() : void {
        this.dispatch(() => {
            this.travel(this.redo, this.undo, true);
        });
    }

    public Serialize() : IEntityDocumentData {
        return {version: 1, entities: this.getEntities(), layers: this.getLayers()};
    }

    private dispatch(action : IEntityDocumentAction) : void {
        this.queue.push(action);
        if (this.processing) {
            return;
        }
        this.processing = true;
        try {
            let next = this.queue.shift();
            while (next !== undefined) {
                next();
                next = this.queue.shift();
            }
        } catch (error : unknown) {
            this.queue.length = 0;
            throw error;
        } finally {
            this.processing = false;
        }
    }

    private select(ids : readonly string[], operation : SelectionOperation = SelectionOperation.REPLACE) : void {
        const previous = [...this.selected];
        if (operation === SelectionOperation.REPLACE) {
            this.selected.clear();
        }
        for (const id of ids) {
            if (this.entities.has(id) && this.IsEditable(id)) {
                if (operation === SelectionOperation.REMOVE) {
                    this.selected.delete(id);
                } else {
                    this.selected.add(id);
                }
            }
        }
        if (JSON.stringify(previous) !== JSON.stringify([...this.selected])) {
            this.emit(EntityDocumentEventKind.SELECTION_CHANGED, [...this.selected]);
        }
    }

    private draw(preview : ReadonlyMap<string, IEntity> = new Map()) : IDrawing {
        const entities = preview.size === 0 ? this.entities : new Map([...this.entities, ...preview]);
        const transforms = preview.size === 0 ? this.worldTransforms : new Map<string, EntityTransform>();
        const paths : IDrawingPath[] = [];
        const meshes : IMeshGeometry[] = [];
        for (const original of this.entities.values()) {
            if (!this.IsVisible(original.id)) {
                continue;
            }
            const entity = preview.get(original.id) ?? original;
            const matrix = this.world(entity.id, entities, transforms);
            const highlighted = this.ancestors(entity.id).some((ancestor) => this.selected.has(ancestor.id));
            const geometry = this.registry.getType(entity.type).Parse(entity.data).getGeometry();
            paths.push(...geometry.paths.map((path) => ({
                ...path, entityId: entity.id, layer: entity.layer,
                points: path.points.map((point) => EntityTransforms.TransformPoint(matrix, point)),
                ...(highlighted ? {colour: EntityDocument.SELECTION_COLOUR} : {}),
                ...(path.curve === undefined ? {} : {curve: {...path.curve,
                    centre: EntityTransforms.TransformPoint(matrix, path.curve.centre),
                    axisU: EntityTransforms.TransformPoint(matrix, path.curve.axisU, true),
                    axisV: EntityTransforms.TransformPoint(matrix, path.curve.axisV, true)}})
            })));
            meshes.push(...(geometry.meshes ?? []).map((mesh) => ({...mesh, entityId: entity.id, layer: entity.layer,
                vertices: mesh.vertices.map((point) => EntityTransforms.TransformPoint(matrix, point)),
                ...(highlighted ? {colour: EntityDocument.SELECTION_COLOUR} : {})})));
        }
        return {paths, meshes, warnings: []};
    }

    private updateEntity(entities : Map<string, IEntity>, id : string, change : Partial<IEntity>) : void {
        const entity = entities.get(id);
        if (entity === undefined) {
            throw new Error(`Unknown entity: ${id}`);
        }
        entities.set(id, {...entity, ...change});
    }

    private commit(mutate : IEntityDocumentMutation, expectedRevision? : number) : void {
        if (expectedRevision !== undefined && expectedRevision !== this.revision) {
            throw new Error("Entity preview is stale; the document changed during the operation.");
        }
        const draft : IEntityDocumentDraft = {
            entities: new Map(this.entities),
            layers: new Map(this.layers),
            reservedIds: new Set<string>()
        };
        mutate(draft);
        const entities = draft.entities;
        const layers = draft.layers;
        this.validate(entities, layers);
        const changedEntities = [...new Set([...this.entities.keys(), ...entities.keys()])]
            .filter((id) => this.entities.get(id) !== entities.get(id))
            .map((id) => ({id, before: this.entities.get(id), after: entities.get(id)}));
        const changedLayers = [...new Set([...this.layers.keys(), ...layers.keys()])]
            .filter((id) => this.layers.get(id) !== layers.get(id))
            .map((id) => ({id, before: this.layers.get(id), after: layers.get(id)}));
        if (changedEntities.length === 0 && changedLayers.length === 0) {
            return;
        }
        const cost = changedEntities.map((change) => ({id: change.id,
            before: change.before === undefined ? null : {...change.before,
                data: change.before.data === change.after?.data ? null : change.before.data},
            after: change.after === undefined ? null : {...change.after,
                data: change.before?.data === change.after.data ? null : change.after.data}}));
        const bytes = new TextEncoder().encode(JSON.stringify([cost, changedLayers])).byteLength;
        if (bytes > this.historyBytes) {
            throw new RangeError("Command exceeds the history byte limit.");
        }
        this.undo.push({entities: changedEntities, layers: changedLayers, bytes});
        this.redo.length = 0;
        let total = this.undo.reduce((sum, entry) => sum + entry.bytes, 0);
        while (this.undo.length > this.historySteps || total > this.historyBytes) {
            total -= this.undo.shift()?.bytes ?? 0;
        }
        this.entities = entities;
        this.rebuildHierarchy();
        this.layers = layers;
        this.revision++;
        this.select([...this.selected]);
        this.emit(EntityDocumentEventKind.DOCUMENT_CHANGED, changedEntities.map((change) => change.id));
    }

    private newEntityId(draft : IEntityDocumentDraft) : string {
        let id = this.NewId();
        while (draft.entities.has(id) || draft.reservedIds.has(id)) {
            id = this.NewId();
        }
        draft.reservedIds.add(id);
        return id;
    }

    private addEntities(draft : IEntityDocumentDraft, request : IAddEntitiesRequest) : void {
        const entities = draft.entities;
        for (const input of request.entities) {
            if (input.id !== undefined) {
                draft.reservedIds.add(input.id);
            }
        }
        for (const input of request.entities) {
            const id = input.id ?? this.newEntityId(draft);
            if (entities.has(id)) {
                throw new Error(`Duplicate entity: ${id}`);
            }
            entities.set(id, {id, name: input.name, type: input.type, parentId: input.parentId ?? null,
                layer: input.layer ?? "default", transform: input.transform ?? EntityTransforms.Identity(),
                data: input.data});
        }
    }

    private removeEntities(draft : IEntityDocumentDraft, request : IRemoveEntitiesRequest) : void {
        const entities = draft.entities;
        for (const id of this.roots(request.ids)) {
            this.assertEditableTree(id);
            for (const child of this.subtree(id)) {
                entities.delete(child);
            }
        }
    }

    private copyEntities(draft : IEntityDocumentDraft, request : ICopyEntitiesRequest) : void {
        const entities = draft.entities;
        EntityTransforms.Validate(request.delta);
        for (const root of this.roots(request.ids)) {
            this.assertEditableTree(root);
            const ids = new Map(this.subtree(root).map((id) => [id, this.newEntityId(draft)]));
            for (const [source, id] of ids) {
                const original = this.requireEntity(source);
                const parentId = original.parentId === null ? null :
                    ids.get(original.parentId) ?? original.parentId;
                const parent = original.parentId === null ? EntityTransforms.Identity() :
                    this.getWorldTransform(original.parentId);
                entities.set(id, {...original, id, parentId, transform: source === root ?
                    EntityTransforms.Multiply(EntityTransforms.Inverse(parent),
                        EntityTransforms.Multiply(request.delta, this.getWorldTransform(source))) :
                    original.transform});
            }
        }
    }

    private transformEntities(draft : IEntityDocumentDraft, request : ITransformEntitiesRequest) : void {
        for (const entry of this.transformOverrides(request.ids, request.delta)) {
            draft.entities.set(entry[0], entry[1]);
        }
    }

    private transformOverrides(ids : readonly string[], delta : EntityTransform) : ReadonlyMap<string, IEntity> {
        EntityTransforms.Validate(delta);
        const overrides = new Map<string, IEntity>();
        for (const id of this.roots(ids)) {
            this.assertEditableTree(id);
            const entity = this.requireEntity(id);
            const parent = entity.parentId === null ? EntityTransforms.Identity() :
                this.getWorldTransform(entity.parentId);
            overrides.set(id, {...entity, transform: EntityTransforms.Multiply(EntityTransforms.Inverse(parent),
                EntityTransforms.Multiply(delta, this.getWorldTransform(id)))});
        }
        return overrides;
    }

    private moveGrip(draft : IEntityDocumentDraft, request : IMoveGripRequest) : void {
        this.updateEntity(draft.entities, request.id, this.editGrip(request.id, request.grip, request.position));
    }

    private editGrip(id : string, grip : string, position : IVector3) : IEntityEdit {
        this.assertEditableTree(id);
        const entity = this.requireEntity(id);
        const local = EntityTransforms.TransformPoint(EntityTransforms.Inverse(this.getWorldTransform(id)), position);
        return this.registry.getType(entity.type).Parse(entity.data).MoveGrip(grip, local);
    }

    private applyMovePart(draft : IEntityDocumentDraft, request : IMovePartRequest) : void {
        const entities = draft.entities;
        this.assertEditableTree(request.id);
        this.updateEntity(entities, request.id, this.movePart(request.id, request.part, request.delta));
    }

    private groupEntities(draft : IEntityDocumentDraft, request : IGroupEntitiesRequest) : void {
        const entities = draft.entities;
        if (entities.has(request.id)) {
            throw new Error("Group id already exists.");
        }
        const roots = this.roots(request.ids);
        if (roots.length === 0) {
            throw new Error("Select entities to group.");
        }
        entities.set(request.id, {id: request.id, type: EntityTypeId.GROUP, name: request.name, data: {},
            parentId: null, layer: "default", transform: EntityTransforms.Identity()});
        for (const id of roots) {
            this.assertEditableTree(id);
            this.updateEntity(entities, id, {parentId: request.id, transform: this.getWorldTransform(id)});
        }
    }

    private ungroupEntity(draft : IEntityDocumentDraft, request : IUngroupEntityRequest) : void {
        const entities = draft.entities;
        this.assertEditableTree(request.id);
        const entity = this.requireEntity(request.id);
        if (!this.registry.getType(entity.type).acceptsChildren) {
            throw new Error("Entity is not a group.");
        }
        for (const child of this.getChildren(entity.id)) {
            this.updateEntity(entities, child.id, {parentId: entity.parentId,
                transform: EntityTransforms.Multiply(entity.transform, child.transform)});
        }
        entities.delete(entity.id);
    }

    private applySetLayer(draft : IEntityDocumentDraft, request : ISetLayerRequest) : void {
        const layers = draft.layers;
        if (request.layer.name.trim() === "" || typeof request.layer.visible !== "boolean" ||
            typeof request.layer.locked !== "boolean") {
            throw new Error("Invalid layer.");
        }
        layers.set(request.layer.name, request.layer);
    }

    private moveEntitiesToLayer(draft : IEntityDocumentDraft, request : IMoveEntitiesToLayerRequest) : void {
        const entities = draft.entities;
        for (const id of this.roots(request.ids)) {
            this.assertEditableTree(id);
            this.updateEntity(entities, id, {layer: request.layer});
        }
    }

    private renameLayer(draft : IEntityDocumentDraft, request : IRenameLayerRequest) : void {
        const entities = draft.entities;
        const layers = draft.layers;
        const layer = layers.get(request.name);
        if (layer === undefined || request.name === "default" || !request.replacement.trim() ||
            layers.has(request.replacement)) {
            throw new Error("Layer cannot be renamed to this name.");
        }
        layers.delete(request.name);
        layers.set(request.replacement, {...layer, name: request.replacement});
        for (const entity of entities.values()) {
            if (entity.layer === request.name) {
                this.updateEntity(entities, entity.id, {layer: request.replacement});
            }
        }
    }

    private removeLayer(draft : IEntityDocumentDraft, request : IRemoveLayerRequest) : void {
        const entities = draft.entities;
        const layers = draft.layers;
        if (request.name === "default" || request.name === request.target ||
            !layers.has(request.name) || !layers.has(request.target)) {
            throw new Error("Choose an existing replacement layer; the default layer cannot be removed.");
        }
        for (const entity of entities.values()) {
            if (entity.layer === request.name) {
                this.updateEntity(entities, entity.id, {layer: request.target});
            }
        }
        layers.delete(request.name);
    }

    private importDocument(draft : IEntityDocumentDraft, request : IImportDocumentRequest) : void {
        const entities = draft.entities;
        const layers = draft.layers;
        const source = request.document;
        if ((<unknown>source.version) !== 1 || entities.has(request.id)) {
            throw new Error("Invalid imported document version or duplicate import id.");
        }
        const imported = new Map(source.entities.map((entity) => [entity.id, entity]));
        const importedLayers = new Map(source.layers.map((layer) => [layer.name, layer]));
        if (imported.size !== source.entities.length || importedLayers.size !== source.layers.length) {
            throw new Error("Duplicate imported identifiers.");
        }
        this.validate(imported, importedLayers);
        draft.reservedIds.add(request.id);
        const ids = new Map(source.entities.map((entity) => [entity.id, this.newEntityId(draft)]));
        for (const layer of source.layers) {
            if (!layers.has(layer.name)) {
                layers.set(layer.name, layer);
            }
        }
        entities.set(request.id, {id: request.id, name: request.name, type: EntityTypeId.MODEL, parentId: null,
            layer: "default", transform: request.transform ?? EntityTransforms.Identity(), data: {}});
        for (const original of source.entities) {
            const id = ids.get(original.id);
            const parentId = original.parentId === null ? request.id : ids.get(original.parentId);
            if (id === undefined || parentId === undefined) {
                throw new Error("Imported hierarchy contains an unknown parent.");
            }
            entities.set(id, {...original, id, parentId});
        }
    }

    private replaceDocument(draft : IEntityDocumentDraft, request : IReplaceDocumentRequest) : void {
        if ((<unknown>request.document.version) !== 1) {
            throw new Error("Unsupported document version.");
        }
        draft.entities = new Map(request.document.entities.map((entity) => [entity.id, entity]));
        draft.layers = new Map(request.document.layers.map((layer) => [layer.name, layer]));
        if (draft.entities.size !== request.document.entities.length ||
            draft.layers.size !== request.document.layers.length) {
            throw new Error("Duplicate document identifiers.");
        }
    }

    private validate(entities : ReadonlyMap<string, IEntity>, layers : ReadonlyMap<string, IEntityLayer>) : void {
        if (!layers.has("default")) {
            throw new Error("Document requires the default layer.");
        }
        for (const entity of entities.values()) {
            if (typeof entity.id !== "string" || entity.id === "" || typeof entity.name !== "string" ||
                !layers.has(entity.layer)) {
                throw new Error("Invalid entity identity or layer.");
            }
            if (this.entities.get(entity.id)?.data !== entity.data ||
                this.entities.get(entity.id)?.type !== entity.type) {
                this.registry.getType(entity.type).Validate(structuredClone(entity.data));
            }
            EntityTransforms.Validate(entity.transform);
            const seen = new Set([entity.id]);
            let parentId = entity.parentId;
            while (parentId !== null) {
                const parent = entities.get(parentId);
                if (parent === undefined || seen.has(parentId) || !this.registry.getType(parent.type).acceptsChildren) {
                    throw new Error("Invalid parent or cyclic entity hierarchy.");
                }
                seen.add(parentId);
                parentId = parent.parentId;
            }
        }
        for (const layer of layers.values()) {
            if (!layer.name || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") {
                throw new Error("Invalid layer state.");
            }
        }
    }

    private movePart(id : string, part : IEntityPart, delta : IVector3) : IEntityEdit {
        const entity = this.requireEntity(id);
        if (![delta.x, delta.y, delta.z].every(Number.isFinite)) {
            throw new RangeError("Component displacement must be finite.");
        }
        const local = EntityTransforms.TransformPoint(
            EntityTransforms.Inverse(this.getWorldTransform(id)), delta, true);
        return this.registry.getType(entity.type).Parse(entity.data).MovePart(part, local);
    }

    private requireEntity(id : string) : IEntity {
        const entity = this.entities.get(id);
        if (entity === undefined) {
            throw new Error(`Unknown entity: ${id}`);
        }
        return entity;
    }

    private ancestors(id : string) : readonly IEntity[] {
        const result : IEntity[] = [];
        let entity : IEntity | undefined = this.requireEntity(id);
        while (entity !== undefined) {
            result.push(entity);
            entity = entity.parentId === null ? undefined : this.entities.get(entity.parentId);
        }
        return result;
    }

    private roots(ids : readonly string[]) : readonly string[] {
        const selected = new Set(ids);
        return [...selected].filter((id) => !this.ancestors(id).slice(1).some((parent) => selected.has(parent.id)));
    }

    private subtree(id : string) : readonly string[] {
        return [id, ...(this.children.get(id) ?? []).flatMap((child) => this.subtree(child))];
    }

    private assertEditableTree(id : string) : void {
        if (!this.IsEditable(id) || this.subtree(id).some((child) =>
            this.layers.get(this.requireEntity(child).layer)?.locked)) {
            throw new Error("Entity or its descendants are locked or hidden by an ancestor.");
        }
    }

    private rebuildHierarchy() : void {
        this.children.clear();
        this.worldTransforms.clear();
        for (const entity of this.entities.values()) {
            let children = this.children.get(entity.parentId);
            if (children === undefined) {
                children = [];
                this.children.set(entity.parentId, children);
            }
            children.push(entity.id);
        }
    }

    private world(id : string, entities : ReadonlyMap<string, IEntity>,
        cache : Map<string, EntityTransform>) : EntityTransform {
        const cached = cache.get(id);
        if (cached !== undefined) {
            return cached;
        }
        const entity = entities.get(id);
        if (entity === undefined) {
            throw new Error(`Unknown entity: ${id}`);
        }
        const transform = entity.parentId === null ? entity.transform :
            EntityTransforms.Multiply(this.world(entity.parentId, entities, cache), entity.transform);
        cache.set(id, transform);
        return transform;
    }

    private travel(from : ITransaction[], to : ITransaction[], forward : boolean) : void {
        const entry = from.pop();
        if (entry === undefined) {
            return;
        }
        for (const change of entry.entities) {
            const value = forward ? change.after : change.before;
            if (value === undefined) {
                this.entities.delete(change.id);
            } else {
                this.entities.set(change.id, value);
            }
        }
        for (const change of entry.layers) {
            const value = forward ? change.after : change.before;
            if (value === undefined) {
                this.layers.delete(change.id);
            } else {
                this.layers.set(change.id, value);
            }
        }
        this.rebuildHierarchy();
        to.push(entry);
        this.revision++;
        this.select([...this.selected]);
        this.emit(EntityDocumentEventKind.DOCUMENT_CHANGED, entry.entities.map((change) => change.id));
    }

    private emit(kind : EntityDocumentEventKind, ids : readonly string[]) : void {
        const event : IEntityDocumentEvent = {kind, revision: this.revision, ids};
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error : unknown) {
                try {
                    this.options.OnError?.(error);
                } catch {
                    // Error reporting must not interrupt an already committed command.
                }
            }
        }
    }
}
