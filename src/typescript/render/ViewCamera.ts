/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { MathUtils, Plane, Quaternion, Raycaster, Vector3 } from "three";

import type { PerspectiveCamera, Ray, Vector2 } from "three";

export class ViewCamera {
    private static readonly ISOMETRIC_COMPONENT_COUNT : number = 3;
    private static readonly MIN_ORBIT_RIGHT_LENGTH_SQUARED : number = 1e-12;
    private static readonly POLE_ALIGNMENT_TOLERANCE : number = 1e-12;
    private static readonly NEAR_DISTANCE_DIVISOR : number = 1000;
    private static readonly MIN_NEAR_DISTANCE : number = 0.001;
    private static readonly FAR_DISTANCE_MULTIPLIER : number = 10000;
    private static readonly MIN_FAR_DISTANCE : number = 1000;
    private static readonly UP : Vector3 = new Vector3(0, 0, 1);
    // Keeps the orbit from flipping over the pole.
    private static readonly MIN_POLAR : number = 0.01;
    private static readonly MIN_DISTANCE : number = 0.05;
    private static readonly MAX_DISTANCE : number = 1e6;
    public readonly camera : PerspectiveCamera;
    private readonly target : Vector3 = new Vector3();
    private readonly raycaster : Raycaster = new Raycaster();

    constructor(camera : PerspectiveCamera) {
        this.camera = camera;
        this.camera.up.copy(ViewCamera.UP);
    }

    public getTarget() : Vector3 {
        return this.target.clone();
    }

    public getDirection() : Vector3 {
        return this.target.clone().sub(this.camera.position).normalize();
    }

    // From the south-west and above.
    public LookAt(target : Vector3, distance : number) : void {
        const offset : number = distance / Math.sqrt(ViewCamera.ISOMETRIC_COMPONENT_COUNT);
        this.target.copy(target);
        this.camera.position.set(target.x - offset, target.y - offset, target.z + offset);
        this.update();
    }

    public setDirection(direction : Vector3) : void {
        if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() === 0) {
            throw new RangeError("View direction must be finite and non-zero.");
        }
        const distance : number = this.camera.position.distanceTo(this.target);
        this.camera.position.copy(direction).normalize().multiplyScalar(distance).add(this.target);
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
        const yawRotation : Quaternion = new Quaternion().setFromAxisAngle(ViewCamera.UP, yaw);
        const direction : Vector3 = this.getDirection().applyQuaternion(yawRotation);
        const polar : number = Math.acos(MathUtils.clamp(direction.z, -1, 1));
        // Rotating by +pitch around the right axis lowers the polar angle by pitch.
        const limited : number = MathUtils.clamp(
            pitch, polar - Math.PI + ViewCamera.MIN_POLAR, polar - ViewCamera.MIN_POLAR);
        const right : Vector3 = new Vector3().crossVectors(direction, ViewCamera.UP);
        if (right.lengthSq() < ViewCamera.MIN_ORBIT_RIGHT_LENGTH_SQUARED) {
            right.set(1, 0, 0).applyQuaternion(this.camera.quaternion).applyQuaternion(yawRotation);
        }
        right.normalize();
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
        const scale : number = MathUtils.clamp(
            factor, ViewCamera.MIN_DISTANCE / distance, ViewCamera.MAX_DISTANCE / distance);
        this.camera.position.sub(point).multiplyScalar(scale).add(point);
        this.target.sub(point).multiplyScalar(scale).add(point);
        this.update();
    }

    private update() : void {
        const distance : number = this.camera.position.distanceTo(this.target);
        this.camera.near = Math.max(distance / ViewCamera.NEAR_DISTANCE_DIVISOR, ViewCamera.MIN_NEAR_DISTANCE);
        this.camera.far = Math.max(distance * ViewCamera.FAR_DISTANCE_MULTIPLIER, ViewCamera.MIN_FAR_DISTANCE);
        const direction : Vector3 = this.getDirection();
        this.camera.up.copy(Math.abs(direction.z) > 1 - ViewCamera.POLE_ALIGNMENT_TOLERANCE ?
            new Vector3(0, 1, 0) : ViewCamera.UP);
        this.camera.lookAt(this.target);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
    }
}
