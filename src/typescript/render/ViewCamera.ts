/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import {
    MathUtils, Plane, Quaternion, Raycaster, Vector3, type PerspectiveCamera, type Ray, type Vector2
} from "three";

const UP : Vector3 = new Vector3(0, 0, 1);
// Keeps the orbit from flipping over the pole.
const MIN_POLAR : number = 0.01;
const MIN_DISTANCE : number = 0.05;
const MAX_DISTANCE : number = 1e6;

export class ViewCamera {
    public readonly camera : PerspectiveCamera;
    private readonly target : Vector3 = new Vector3();
    private readonly raycaster : Raycaster = new Raycaster();

    constructor(camera : PerspectiveCamera) {
        this.camera = camera;
        this.camera.up.copy(UP);
    }

    public getTarget() : Vector3 {
        return this.target.clone();
    }

    public getDirection() : Vector3 {
        return this.target.clone().sub(this.camera.position).normalize();
    }

    // From the south-west and above.
    public LookAt(target : Vector3, distance : number) : void {
        const offset : number = distance / Math.sqrt(3);
        this.target.copy(target);
        this.camera.position.set(target.x - offset, target.y - offset, target.z + offset);
        this.update();
    }

    public getRay(ndc : Vector2) : Ray {
        this.raycaster.setFromCamera(ndc, this.camera);
        return this.raycaster.ray.clone();
    }

    public PointOnTargetPlane(ndc : Vector2) : Vector3 {
        const plane : Plane = new Plane().setFromNormalAndCoplanarPoint(this.getDirection(), this.target);
        return this.getRay(ndc).intersectPlane(plane, new Vector3()) ?? this.target.clone();
    }

    public Orbit(pivot : Vector3, yaw : number, pitch : number) : void {
        const yawRotation : Quaternion = new Quaternion().setFromAxisAngle(UP, yaw);
        const direction : Vector3 = this.getDirection().applyQuaternion(yawRotation);
        const polar : number = Math.acos(MathUtils.clamp(direction.z, -1, 1));
        // Rotating by +pitch around the right axis lowers the polar angle by pitch.
        const limited : number = MathUtils.clamp(pitch, polar - Math.PI + MIN_POLAR, polar - MIN_POLAR);
        const right : Vector3 = new Vector3().crossVectors(direction, UP).normalize();
        const rotation : Quaternion = new Quaternion().setFromAxisAngle(right, limited).multiply(yawRotation);
        this.camera.position.sub(pivot).applyQuaternion(rotation).add(pivot);
        this.target.sub(pivot).applyQuaternion(rotation).add(pivot);
        this.update();
    }

    public Pan(grab : Vector3, ndc : Vector2) : void {
        const plane : Plane = new Plane().setFromNormalAndCoplanarPoint(this.getDirection(), grab);
        const hit : Vector3 | null = this.getRay(ndc).intersectPlane(plane, new Vector3());
        if (hit === null) {
            return;
        }
        const shift : Vector3 = grab.clone().sub(hit);
        this.camera.position.add(shift);
        this.target.add(shift);
        this.update();
    }

    // A factor below 1 zooms in.
    public Zoom(point : Vector3, factor : number) : void {
        const distance : number = this.camera.position.distanceTo(point);
        if (distance === 0) {
            return;
        }
        const scale : number = MathUtils.clamp(factor, MIN_DISTANCE / distance, MAX_DISTANCE / distance);
        this.camera.position.sub(point).multiplyScalar(scale).add(point);
        this.target.sub(point).multiplyScalar(scale).add(point);
        this.update();
    }

    private update() : void {
        const distance : number = this.camera.position.distanceTo(this.target);
        this.camera.near = Math.max(distance / 1000, 0.001);
        this.camera.far = Math.max(distance * 10000, 1000);
        this.camera.lookAt(this.target);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
    }
}
