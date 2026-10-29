import * as THREE from 'three';
import { buildArchitecture, decorateFrame } from './architecture.js';

const $ = id => document.getElementById(id);
const stage = $('scene');
const clamp = THREE.MathUtils.clamp;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set();
let renderer, scene, camera, gallery, raycaster;
let items = [], artwork = [], labels = [], floor, depth = 26, current = -1;
let yaw = 0, pitch = -.025, walking = null, dragging = null, lastTime = 0, drawCount = 0;
let stale = false, active = true, lastCatalog = '', touchMove = '';
let roomVersion = 0;
const pointer = new THREE.Vector2(), projected = new THREE.Vector3();
const eye = new THREE.Vector3(0, 1.65, 7);
const palette = ['#a19cb8', '#ad7c5f', '#9a9e73', '#6d9595', '#8796ac'];

function safeURL(raw) {
  try { const u = new URL(raw); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
function material(color, roughness = .85) { return new THREE.MeshStandardMaterial({ color, roughness }); }
function canvasTexture(draw, w = 1024, h = 768) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
function circle(ctx, x, y, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
function artTexture(exhibit, index) {
  return canvasTexture((c, w, h) => {
    const kind = `${exhibit.id} ${exhibit.name}`.toLowerCase();
    c.fillStyle = '#ebe6d9'; c.fillRect(0, 0, w, h);
    if (/花|hana/.test(kind)) {
      c.fillStyle = '#252f2a'; c.fillRect(0, 0, w, h);
      circle(c, 680, 260, 166, '#c3644f');
      c.strokeStyle = '#b7b59b'; c.lineWidth = 5;
      for (let j = 0; j < 7; j++) { c.beginPath(); c.moveTo(80, 740); c.bezierCurveTo(160 + j * 24, 500, 380, 540, 590 + j * 46, 660); c.stroke(); }
      for (let j = 0; j < 10; j++) {
        const x = 190 + (j % 4) * 132, y = 190 + Math.floor(j / 4) * 150;
        for (let k = 0; k < 5; k++) circle(c, x + Math.cos(k * 1.257) * 27, y + Math.sin(k * 1.257) * 27, 24, j % 2 ? '#e0c7a0' : '#b45645');
        circle(c, x, y, 13, '#8d9a73');
      }
    } else if (/泳|aquarium|水族/.test(kind)) {
      const gradient = c.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#8aada6'); gradient.addColorStop(1, '#294b4e'); c.fillStyle = gradient; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) { const x = 90 + (i * 137) % 850, y = 90 + (i * 113) % 590; c.fillStyle = i % 3 ? '#cad7bd' : '#cfa269'; c.beginPath(); c.ellipse(x, y, 38, 13, -.2, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(x - 28, y); c.lineTo(x - 55, y - 17); c.lineTo(x - 55, y + 17); c.closePath(); c.fill(); }
      c.strokeStyle = '#c8d8c24d'; c.lineWidth = 2; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * 160, 0); c.lineTo(i * 160 - 200, 768); c.stroke(); }
    } else if (/gourmet|グルメ|食/.test(kind)) {
      c.fillStyle = '#c4bd9d'; c.fillRect(0, 0, w, h); circle(c, 510, 390, 280, '#ece7d5'); circle(c, 510, 390, 232, '#d8d1b9'); circle(c, 510, 390, 210, '#f4edd8');
      for (let i = 0; i < 12; i++) { const a = i * .52; circle(c, 510 + Math.cos(a) * 130, 390 + Math.sin(a) * 130, 43, i % 2 ? '#899376' : '#b77b53'); }
      circle(c, 510, 390, 85, '#ae9971'); c.fillStyle = '#59654c'; c.fillRect(120, 160, 9, 460); c.fillRect(149, 160, 9, 460); c.fillStyle = '#d9cfab'; c.fillRect(825, 150, 100, 470);
    } else if (/anime|アニメ|映/.test(kind)) {
      c.fillStyle = '#c7bfd3'; c.fillRect(0, 0, w, h); circle(c, 735, 220, 210, '#e9d4ba');
      c.fillStyle = '#777588'; c.beginPath(); c.moveTo(0, 560); c.lineTo(360, 210); c.lineTo(720, 768); c.lineTo(0, 768); c.fill();
      c.fillStyle = '#4a5969'; c.beginPath(); c.moveTo(300, 768); c.lineTo(700, 350); c.lineTo(1024, 650); c.lineTo(1024, 768); c.fill();
      c.fillStyle = '#ece2cf'; c.fillRect(430, 435, 85, 300); circle(c, 472, 412, 48, '#303f4c'); c.fillStyle = '#b36c5d'; c.fillRect(420, 475, 120, 25);
    } else if (/hedge|記|note/.test(kind)) {
      c.fillStyle = '#929fa6'; c.fillRect(0, 0, w, h); c.save(); c.translate(510, 380); c.rotate(-.13); c.fillStyle = '#d6d0bd'; c.fillRect(-245, -265, 490, 540); c.fillStyle = '#f1ecdc'; c.fillRect(-270, -285, 490, 540); c.fillStyle = '#61736c'; c.font = '130px Georgia'; c.fillText('M', -190, -110); c.fillStyle = '#9aa28b'; for (let i = 0; i < 7; i++) c.fillRect(-180, -25 + i * 37, i === 6 ? 180 : 300, 7); c.restore();
    } else {
      c.fillStyle = palette[index % palette.length]; c.fillRect(0, 0, w, h); circle(c, 540, 330, 235, '#e3d9bf'); circle(c, 420, 430, 160, '#5e746a'); c.strokeStyle = '#f2e9d7'; c.lineWidth = 3; for (let i = 0; i < 8; i++) c.strokeRect(180 + i * 35, 90 + i * 25, 480 - i * 20, 510 - i * 20);
    }
    // A little paper grain makes the artwork feel printed rather than luminous.
    let seed = index + 42;
    for (let i = 0; i < 6500; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; const x = seed % w; seed = (seed * 1664525 + 1013904223) >>> 0; c.fillStyle = i % 2 ? '#ffffff0b' : '#00000008'; c.fillRect(x, seed % h, 2, 2); }
  });
}

function disposeGallery() {
  roomVersion++;
  if (!gallery) return;
  gallery.traverse(object => { object.shadow?.dispose(); object.geometry?.dispose(); if (object.material) { for (const m of Array.isArray(object.material) ? object.material : [object.material]) { m.map?.dispose(); m.dispose(); } } });
  scene.remove(gallery); labels.forEach(label => label.remove()); labels = []; artwork = [];
}
function buildRoom() {
  disposeGallery(); gallery = new THREE.Group(); scene.add(gallery);
  depth = Math.max(24, Math.ceil(items.length / 2) * 6.8 + 9);
  floor = buildArchitecture(gallery, depth);
  items.forEach((item, index) => {
    const left = index % 2 === 0, x = left ? -7.9 : 7.9, z = -2 - Math.floor(index / 2) * 6.8;
    const group = new THREE.Group(); group.position.set(x, 2.45, z); group.rotation.y = left ? Math.PI / 2 : -Math.PI / 2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.45, 2.7, .13), material('#645e4b')); frame.castShadow = true; group.add(frame); decorateFrame(group);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.55, .02), material('#efecdf')); mat.position.z = .08; group.add(mat);
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(2.91, 2.18), new THREE.MeshStandardMaterial({ map: artTexture(item, index), roughness: 1, side: THREE.FrontSide }));
    painting.position.z = .1; painting.userData.index = index; group.add(painting); artwork.push(painting);
    // Keep the illustration on missing/failed images and ignore loads from an old room.
    if (/^\/previews\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.(png|jpg|jpeg|webp)$/.test(item.preview || '')) {
      const version = roomVersion;
      new THREE.ImageLoader().load(item.preview, image => {
        if (version !== roomVersion) return;
        const texture = canvasTexture((c, w, h) => {
          c.fillStyle = '#f5f3ed'; c.fillRect(0, 0, w, h);
          const scale = Math.min(w / image.width, h / image.height);
          const width = image.width * scale, height = image.height * scale;
          c.drawImage(image, (w - width) / 2, (h - height) / 2, width, height);
        });
        painting.material.map.dispose(); painting.material.dispose();
        // UI screenshots should retain their original colours under the gallery lights.
        painting.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
      }, undefined, () => {});
    }
    gallery.add(group);
    const spot = new THREE.SpotLight('#fff2d4', 22, 12, .57, .85, 1.6); spot.position.set(left ? -4.8 : 4.8, 4.9, z + .5); spot.target = group; gallery.add(spot);
    const label = document.createElement('button'); label.className = 'wall-label'; label.setAttribute('aria-label', `${item.name}の展示へ移動`);
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0'); label.append(number, document.createTextNode(item.name)); label.onclick = () => visit(index); $('labels').append(label); labels.push(label);
    item.anchor = new THREE.Vector3(left ? -7.6 : 7.6, .95, z);
    item.approach = new THREE.Vector3(left ? -4.15 : 4.15, 1.65, z + .25);
    item.yaw = left ? Math.PI / 2 : -Math.PI / 2;
  });
  buildMap(); eye.x = clamp(eye.x, -7, 7); eye.z = clamp(eye.z, -depth + 1.5, 8);
}

function buildMap() {
  $('map-list').replaceChildren(); $('map-room').querySelectorAll('button').forEach(b => b.remove());
  items.forEach((item, index) => {
    const number = String(index + 1).padStart(2, '0');
    const dot = document.createElement('button'); dot.className = 'map-dot'; dot.textContent = number; dot.setAttribute('aria-label', `${item.name}へ`); dot.style.left = index % 2 === 0 ? '8%' : '92%'; dot.style.top = `${10 + (-2 - Math.floor(index / 2) * 6.8 + depth) / (depth + 8) * 76}%`; dot.onclick = () => visit(index); $('map-room').append(dot);
    const button = document.createElement('button'); button.className = 'map-item'; const span = document.createElement('span'); span.textContent = number; button.append(span, document.createTextNode(item.name)); button.onclick = () => visit(index); $('map-list').append(button);
  });
  $('next').disabled = $('previous').disabled = items.length === 0;
}
function showExhibit(index) {
  const e = items[index]; if (!e) return;
  current = index; $('room-title').hidden = true; $('exhibit').hidden = false; $('exhibit-no').textContent = String(index + 1).padStart(2, '0'); $('exhibit-name').textContent = e.name;
  $('exhibit-description').textContent = e.description; $('exhibit-description').hidden = !e.description;
  $('exhibit-status').textContent = stale ? '状態未確認' : e.state !== 'running' ? '停止中' : e.health === 'healthy' ? '正常' : e.health === 'unhealthy' ? '要確認' : e.health === 'starting' ? '準備中' : '起動中';
  const url = safeURL(e.url); $('exhibit-open').hidden = !url; $('exhibit-unset').hidden = !!url; if (url) $('exhibit-open').href = url; else $('exhibit-open').removeAttribute('href');
  $('position').textContent = `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
  [...$('map-room').querySelectorAll('button')].forEach((button, i) => button.classList.toggle('active', i === index));
}
function closeExhibit() { $('exhibit').hidden = true; }
function setMap(open) { $('map').hidden = !open; $('map-toggle').setAttribute('aria-expanded', String(open)); }
function visit(index) {
  if (!items.length) return; index = (index + items.length) % items.length;
  const item = items[index]; walking = { position: item.approach.clone(), yaw: item.yaw, pitch: .08 };
  if (reduced) { eye.copy(walking.position); yaw = walking.yaw; pitch = walking.pitch; walking = null; }
  showExhibit(index); setMap(false); keys.clear(); stage.focus({preventScroll:true});
}
function returnHome() { walking = {position:new THREE.Vector3(0,1.65,7),yaw:0,pitch:-.025}; current = -1; $('room-title').hidden = false; closeExhibit(); $('position').textContent = '入口'; setMap(false); if (reduced) { eye.copy(walking.position); yaw=0; pitch=-.025; walking=null; } }

function pointAt(event) { const rect=stage.getBoundingClientRect(); pointer.set((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1); raycaster.setFromCamera(pointer,camera); }
function clickScene(event) {
  pointAt(event);
  const hits = raycaster.intersectObjects(artwork);
  if (hits.length) { visit(hits[0].object.userData.index); return; }
  const hitsFloor = raycaster.intersectObject(floor);
  if (hitsFloor.length) {
    const point = hitsFloor[0].point; point.y = 1.65; point.x=clamp(point.x,-6.9,6.9); point.z=clamp(point.z,-depth+1.5,8);
    walking = {position:point,yaw,pitch}; $('room-title').hidden = true; closeExhibit();
  }
}
function blocked(x,z) {
  if (Math.abs(x) < .95 && Math.abs(z+6.5)<.95) return true;
  return [-1,-13].some(b => Math.abs(x)<1.65 && Math.abs(z-b)<.8);
}
function move(dx,dz) {
  const x=clamp(eye.x+dx,-7.1,7.1), z=clamp(eye.z+dz,-depth+1.5,8.5);
  if (!blocked(x,eye.z)) eye.x=x; if (!blocked(eye.x,z)) eye.z=z;
}
function resize() { if (!renderer) return; camera.aspect=innerWidth/innerHeight; camera.fov=innerWidth<700?72:62; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); }
function animate(time) {
  const dt = Math.min((time-lastTime)/1000 || 0,.05); lastTime=time;
  if (!active) return;
  let forward=(keys.has('KeyW')||keys.has('ArrowUp')||touchMove==='forward'?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')||touchMove==='back'?1:0);
  let strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  const turn=(keys.has('ArrowLeft')||touchMove==='left'?1:0)-(keys.has('ArrowRight')||touchMove==='right'?1:0);
  if (forward||strafe||turn) { $('room-title').hidden=true; walking=null; yaw+=turn*dt*1.35; const length=Math.max(1,Math.hypot(forward,strafe)); forward/=length; strafe/=length; move((-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*dt*2.7,(-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*dt*2.7); }
  if (walking) {
    const alpha=1-Math.exp(-dt*3.6); const next=eye.clone().lerp(walking.position,alpha);
    // Automated paths travel through the clear side aisle rather than through the benches.
    if (blocked(next.x,next.z)) { move((walking.position.x>0?1:-1)*dt*2.7,0); } else eye.copy(next);
    const delta=Math.atan2(Math.sin(walking.yaw-yaw),Math.cos(walking.yaw-yaw)); yaw+=delta*alpha; pitch+=(walking.pitch-pitch)*alpha;
    if (eye.distanceTo(walking.position)<.025 && Math.abs(delta)<.005) walking=null;
  }
  camera.position.copy(eye); camera.rotation.set(pitch,yaw,0,'YXZ');
  if (++drawCount%2===0) {
    labels.forEach((label,i) => { const item=items[i]; projected.copy(item.anchor).project(camera); const visible=$('exhibit').hidden && projected.z<1 && projected.z>-1 && Math.abs(projected.x)<1.1 && Math.abs(projected.y)<1.1 && eye.distanceTo(item.anchor)<18; label.hidden=!visible; if(visible) label.style.transform=`translate(${(projected.x*.5+.5)*innerWidth}px,${(-projected.y*.5+.5)*innerHeight}px) translate(-50%,-50%)`; });
  }
  renderer.render(scene,camera);
}

async function refresh() {
  try {
    const response=await fetch('/api/catalog',{cache:'no-store',signal:AbortSignal.timeout(12000)}); if(!response.ok) throw new Error('catalog'); const catalog=await response.json();
    stale=!!catalog.stale; $('demo').hidden=!catalog.demo;
    const signature=JSON.stringify(catalog.exhibits);
    if(signature!==lastCatalog) {
      const selectedID=items[current]?.id; items=catalog.exhibits; lastCatalog=signature; buildRoom();
      if(selectedID) {const index=items.findIndex(e=>e.id===selectedID); if(index>=0)showExhibit(index);else{current=-1;closeExhibit();}}
    }
    if(current>=0 && !$('exhibit').hidden)showExhibit(current);
    $('message').textContent=stale?'展示情報の更新を待っています':items.length?'':'展示がありません';
  } catch { stale=true; $('message').textContent='展示情報に接続できません。再接続しています。'; if(current>=0&&!$('exhibit').hidden)showExhibit(current); }
}

function start() {
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); renderer.setClearColor('#e7e2d6'); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1; stage.append(renderer.domElement);
    scene=new THREE.Scene(); scene.background=new THREE.Color('#213b32'); scene.fog=new THREE.Fog('#213b32',26,75);
    camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,90); raycaster=new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight('#f5ead3','#493b29',1.5)); scene.add(new THREE.AmbientLight('#f2ead9',.5));
    buildRoom(); resize(); renderer.setAnimationLoop(animate);
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('message').textContent='描画が中断しました。再読み込みするか一覧を開いてください。';});
  } catch { $('message').textContent='この端末では館内を描画できません。右上の一覧を開いてください。'; return; }
  stage.addEventListener('pointerdown',event=>{if(event.button!==0)return; dragging={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false};stage.setPointerCapture(event.pointerId);stage.focus({preventScroll:true});});
  stage.addEventListener('pointermove',event=>{if(dragging){const dx=event.clientX-dragging.lastX,dy=event.clientY-dragging.lastY; if(Math.hypot(event.clientX-dragging.x,event.clientY-dragging.y)>5)dragging.moved=true; if(dragging.moved){$('room-title').hidden=true;walking=null;yaw-=dx*.004;pitch=clamp(pitch-dy*.003,-.55,.45);}dragging.lastX=event.clientX;dragging.lastY=event.clientY;}else if(event.pointerType==='mouse'){pointAt(event);stage.style.cursor=raycaster.intersectObjects(artwork).length?'pointer':'grab';}});
  stage.addEventListener('pointerup',event=>{if(dragging&&!dragging.moved)clickScene(event);dragging=null;});stage.addEventListener('pointercancel',()=>{dragging=null;});
  addEventListener('keydown',event=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(event.code==='Escape'){setMap(false);closeExhibit();walking=null;return;}if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();keys.add(event.code);}});
  addEventListener('keyup',event=>keys.delete(event.code));addEventListener('blur',()=>{keys.clear();touchMove='';dragging=null;});
  document.addEventListener('visibilitychange',()=>{active=!document.hidden;keys.clear();touchMove='';lastTime=0;});addEventListener('resize',resize);
  $('next').onclick=()=>visit(current+1);$('previous').onclick=()=>visit(current<0?items.length-1:current-1);$('home').onclick=returnHome;$('exhibit-close').onclick=closeExhibit;$('map-toggle').onclick=()=>setMap($('map').hidden);$('map-close').onclick=()=>{setMap(false);$('map-toggle').focus();};
  for(const button of document.querySelectorAll('[data-move]')){button.addEventListener('pointerdown',event=>{event.preventDefault();touchMove=button.dataset.move;button.setPointerCapture(event.pointerId);});for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>touchMove='');}
  refresh();setInterval(refresh,15000);
}
start();
