// Lights and the void: a key light with shadows that follows KLP-2, a rim
// light in the deck's colour, dust rising from far below and the dim
// shapes of the tower falling away into the dark.
import * as THREE from 'three';
import { PLAYER_COLOUR } from '../config.js';
import { makeAbyssTexture, makeGlowTexture } from './textures.js';

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0x8090c0, 0x050508, 1.1);
    scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff2e6, 3.0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.03;
    scene.add(this.key);
    scene.add(this.key.target);
    this.rim = new THREE.DirectionalLight(0xff00ff, 1.1);
    scene.add(this.rim);
    scene.add(this.rim.target);
    this.playerLight = new THREE.PointLight(PLAYER_COLOUR, 6, 7, 1.6);
    scene.add(this.playerLight);
    // a second light that follows the action (hack target, explosions)
    this.fill = new THREE.PointLight(0xffffff, 0, 6, 2);
    scene.add(this.fill);

    // the abyss: a glow far below and drifting dust
    this.abyssMat = new THREE.MeshBasicMaterial({ map: makeAbyssTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x331144 });
    this.abyss = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), this.abyssMat);
    this.abyss.rotation.x = -Math.PI / 2;
    this.abyss.position.y = -42;
    scene.add(this.abyss);

    const N = 700;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = -2 - Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({ size: 0.18, map: makeGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x664488, sizeAttenuation: true });
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // pillars of the tower going down into the dark
    this.pillars = new THREE.Group();
    const pg = new THREE.BoxGeometry(1, 1, 1);
    this.pillarMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.9, metalness: 0.2, emissive: 0x220a2a, emissiveIntensity: 0.6 });
    this.pillarLightMat = new THREE.MeshBasicMaterial({ color: 0x552266 });
    for (let i = 0; i < 26; i++) {
      const w = 2 + Math.random() * 4;
      const h = 30 + Math.random() * 40;
      const m = new THREE.Mesh(pg, this.pillarMat);
      m.scale.set(w, h, w);
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40;
      m.position.set(Math.cos(a) * r, -8 - h / 2 - Math.random() * 10, Math.sin(a) * r);
      this.pillars.add(m);
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Mesh(pg, this.pillarLightMat);
        s.scale.set(w * 1.02, 0.15, w * 1.02);
        s.position.set(m.position.x, m.position.y + h / 2 - 2 - k * (4 + Math.random() * 6), m.position.z);
        this.pillars.add(s);
      }
    }
    scene.add(this.pillars);
    this.centre = new THREE.Vector3();
    this.t = 0;
  }

  setDeck(deck, centre) {
    const ink = new THREE.Color(deck.ink);
    const paper = new THREE.Color(deck.paper);
    this.scene.background = new THREE.Color(deck.fog);
    this.scene.fog = new THREE.Fog(deck.fog, 30, 95);
    this.hemi.color.copy(paper).lerp(new THREE.Color(0x9aa6d0), 0.55);
    this.hemi.groundColor.copy(paper).multiplyScalar(0.3);
    this.baseInk = ink;
    this.paper = paper;
    this.setMix(ink, 0);
    if (centre) {
      this.centre.copy(centre);
      this.pillars.position.set(centre.x, 0, centre.z);
      this.dust.position.set(centre.x, 0, centre.z);
    }
  }

  // The deck's light, lerped towards cyan as it's claimed.
  setMix(color, k) {
    this.rim.color.copy(color);
    this.abyssMat.color.copy(color).multiplyScalar(0.28);
    this.dustMat.color.copy(color).multiplyScalar(0.5);
    this.pillarMat.emissive.copy(color).multiplyScalar(0.08);
    this.pillarLightMat.color.copy(color).multiplyScalar(0.35);
  }

  update(dt, focus) {
    this.t += dt;
    // key light from the upper left of the screen, following the player
    this.key.position.set(focus.x - 9, focus.y + 18, focus.z + 5);
    this.key.target.position.copy(focus);
    this.rim.position.set(focus.x - 6, focus.y + 6, focus.z - 10);
    this.rim.target.position.copy(focus);
    this.abyss.position.x = focus.x; this.abyss.position.z = focus.z;
    const p = this.dust.geometry.attributes.position.array;
    for (let i = 1; i < p.length; i += 3) {
      p[i] += dt * 0.6;
      if (p[i] > -1) p[i] = -42;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
}
