import * as THREE from 'three';

// All ornament and textures are generated locally; the gallery needs no asset CDN.
export function buildArchitecture(gallery, depth) {
  const stone = '#d8cdb6', walnut = '#35291f', gold = '#a78a4f';
  const length = depth + 10, centre = (10 - depth) / 2;
  const mat = (color, metalness = 0, roughness = .8) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  function box(w, h, d, color, x, y, z, parent = gallery) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function texture(draw, w = 1024, h = 1024) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; return map;
  }
  const floor = box(16, .16, length, '#ffffff', 0, -.08, centre);
  floor.material.map = texture((c, w, h) => {
    c.fillStyle = '#372a20'; c.fillRect(0, 0, w, h);
    // A seamless herringbone parquet repeat, with engraved seams and wood grain.
    const unit = 64, plank = 256;
    for (let row = -8; row < 24; row++) for (let col = -8; col < 24; col++) {
      const x = (col * 5 + row) * unit, y = (row - col) * unit;
      for (let side = 0; side < 2; side++) {
        c.save(); c.translate(x, y); if (side) { c.translate(plank, 0); c.rotate(Math.PI / 2); }
        const tone = 27 + ((col * 13 + row * 7 + side * 11) % 13 + 13) % 13;
        c.fillStyle = `hsl(30 28% ${tone}%)`; c.fillRect(1, 1, plank - 2, unit - 2);
        for (let grain = 0; grain < 7; grain++) {
          c.strokeStyle = grain % 2 ? '#d7b97c18' : '#130d0825'; c.lineWidth = .8;
          c.beginPath(); c.moveTo(3, 5 + grain * 8); c.bezierCurveTo(70, grain * 8, 140, grain * 8 + 13, plank - 3, grain * 8 + 5); c.stroke();
        }
        c.restore();
      }
    }
  });
  floor.material.map.wrapS = floor.material.map.wrapT = THREE.RepeatWrapping;
  floor.material.map.repeat.set(2, length / 8); floor.material.roughness = .58;
  for (const x of [-7.65, 7.65]) {
    box(.55, .015, length, '#b8a37b', x, .012, centre);
    box(.035, .02, length, gold, x + (x < 0 ? .32 : -.32), .018, centre);
  }
  box(.3, 5.5, length, '#29453b', -8.15, 2.75, centre);
  box(.3, 5.5, length, '#29453b', 8.15, 2.75, centre);
  box(16, 5.5, .3, '#243e35', 0, 2.75, -depth);
  box(16, 5.5, .3, '#243e35', 0, 2.75, 10);
  box(16, .2, length, '#cdc1a8', 0, 5.6, centre);
  // Walnut wainscoting, recessed panels, and layered stone cornices.
  for (const x of [-7.97, 7.97]) {
    box(.09, 1.08, length, walnut, x, .54, centre);
    for (const [y, h, width] of [[.12,.18,.18],[1.08,.08,.18],[1.16,.035,.2],[4.92,.12,.18],[5.08,.14,.28],[5.25,.12,.38]]) {
      box(width, h, length, y > 4 ? stone : gold, x, y, centre);
    }
    for (let z = 8; z > -depth + 1; z -= 1.7) {
      box(.1, .72, 1.48, '#45372a', x + (x < 0 ? .05 : -.05), .6, z);
      box(.12, .025, 1.48, '#8e7445', x + (x < 0 ? .06 : -.06), .95, z);
    }
  }
  function arch(z) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * Math.PI, x = Math.cos(a) * 8, y = 4.05 + Math.sin(a) * 1.45;
      if (!i) shape.moveTo(x,y); else shape.lineTo(x,y);
    }
    for (let i = 48; i >= 0; i--) { const a = i / 48 * Math.PI; shape.lineTo(Math.cos(a) * 7.73, 4.05 + Math.sin(a) * 1.18); }
    shape.closePath();
    const rib = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:false}), mat(stone));
    rib.position.z = z; rib.castShadow = true; gallery.add(rib);
  }
  // Structural bays alternate with the artwork, leaving the side aisles clear.
  for (let z = 1.4; z > -depth + 1; z -= 6.8) {
    arch(z);
    for (const x of [-7.73, 7.73]) {
      box(.44, 3.95, .44, stone, x, 2.02, z + .1);
      box(.64, .2, .65, '#b5a88f', x, .1, z + .1);
      box(.57, .15, .6, '#efe2c7', x, 3.94, z + .1);
      box(.7, .16, .68, '#b5a88f', x, 4.08, z + .1);
      for (const offset of [-.12, 0, .12]) box(.035, 3.35, .035, '#b6a88c', x + (x < 0 ? .235 : -.235), 2.04, z + .1 + offset);
    }
    // Coffered ceiling: inset panels surrounded by gilt ribs.
    for (const x of [-5.2, 0, 5.2]) {
      box(4.7, .08, 5.9, '#425145', x, 5.45, z - 3.1);
      for (const dx of [-2.36,2.36]) box(.09,.1,5.98,gold,x+dx,5.36,z-3.1);
      for (const dz of [-2.98,2.98]) box(4.8,.1,.09,gold,x,5.36,z-3.1+dz);
      box(3.9,.04,5.1,'#5a6351',x,5.37,z-3.1);
    }
    // Warm alabaster pendant, suspended on a fine bronze stem.
    box(.045,.55,.045,gold,0,5.02,z-2.5);
    const pendant = new THREE.Mesh(new THREE.CylinderGeometry(.28,.47,.23,12),new THREE.MeshStandardMaterial({color:'#efe0b1',emissive:'#e7c77a',emissiveIntensity:.45,roughness:.5}));
    pendant.position.set(0,4.67,z-2.5); gallery.add(pendant);
    const light = new THREE.PointLight('#ffdda0',32,18,2);light.position.set(0,4.35,z-2.5);gallery.add(light);
  }
  // An arched leaded-glass window closes the perspective at the far end.
  const windowMap = texture((c,w,h) => {
    c.clearRect(0,0,w,h); c.beginPath(); c.moveTo(90,h-25);c.lineTo(90,400);c.bezierCurveTo(90,10,w-90,10,w-90,400);c.lineTo(w-90,h-25);c.closePath();
    c.fillStyle='#e7d7a3';c.fill();c.save();c.clip();
    for(let y=0;y<h;y+=120)for(let x=0;x<w;x+=100){c.fillStyle=['#d3c18a','#b6bea0','#eee1b5','#a3b6a3'][(x/100+y/120)%4];c.fillRect(x+3,y+3,94,114);}
    c.strokeStyle='#6c725a';c.lineWidth=9;
    for(let x=190;x<w-90;x+=100){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
    for(let y=160;y<h;y+=120){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
    c.beginPath();c.arc(w/2,340,170,0,Math.PI*2);c.fillStyle='#e4ce8e';c.fill();c.stroke();
    for(let i=0;i<12;i++){const a=i*Math.PI/6;c.beginPath();c.moveTo(w/2+Math.cos(a)*60,340+Math.sin(a)*60);c.lineTo(w/2+Math.cos(a)*160,340+Math.sin(a)*160);c.stroke();}
    c.beginPath();c.arc(w/2,340,55,0,Math.PI*2);c.fillStyle='#9cae99';c.fill();c.stroke();c.restore();
    c.strokeStyle='#b6a67d';c.lineWidth=24;c.stroke();
  });
  const window = new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.65),new THREE.MeshBasicMaterial({map:windowMap,transparent:true,toneMapped:false}));
  window.position.set(0,2.8,-depth+.17);gallery.add(window);
  box(5.6,.16,.5,stone,0,.47,-depth+.4);
  const sunlight = new THREE.DirectionalLight('#ffe6b4',2.1);
  sunlight.position.set(-2,4,-depth+1); sunlight.target.position.set(0,0,-5);
  sunlight.castShadow=true; sunlight.shadow.mapSize.set(1024,1024);
  Object.assign(sunlight.shadow.camera,{left:-10,right:10,top:20,bottom:-20,near:.5,far:70});
  sunlight.shadow.normalBias=.035; gallery.add(sunlight,sunlight.target);
  // Bronze armillary sphere on a layered stone plinth.
  for(const [w,h,y] of [[1.65,.12,.06],[1.4,.68,.46],[1.6,.12,.86]])box(w,h,w,stone,0,y,-6.5);
  for(let i=0;i<3;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.62,.028,8,64),mat(gold,.72,.3));
    ring.position.set(0,1.72,-6.5);ring.rotation.set(i===0?Math.PI/2:.4,i*Math.PI/3,i*.5);ring.castShadow=true;gallery.add(ring);
  }
  const globe=new THREE.Mesh(new THREE.SphereGeometry(.25,24,16),mat('#586f60',.35,.45));globe.position.set(0,1.72,-6.5);gallery.add(globe);
  box(.07,.65,.07,gold,0,1.15,-6.5);
  // Tufted oxblood benches on walnut legs.
  for(const z of [-1,-13]){
    if(z < -depth+3)continue;
    box(2.6,.14,.85,walnut,0,.49,z);
    const seat=box(2.6,.18,.85,'#62382f',0,.64,z);seat.material.roughness=1;
    for(const x of [-.95,.95])box(.12,.44,.55,walnut,x,.24,z);
    for(let x=-1;x<=1;x+=.4){const button=new THREE.Mesh(new THREE.SphereGeometry(.025,6,4),mat('#b18a55'));button.scale.y=.3;button.position.set(x,.735,z);gallery.add(button);}
  }
  // Brass compass medallion set flush into the parquet at the entrance.
  const medallion = new THREE.Mesh(new THREE.RingGeometry(.94,1,64),mat(gold,.6,.45));medallion.rotation.x=-Math.PI/2;medallion.position.set(0,.018,3.3);gallery.add(medallion);
  for(let i=0;i<8;i++){const ray=box(.025,.012,1.65,gold,0,.02,3.3);ray.rotation.y=i*Math.PI/4;}
  return floor;
}

export function decorateFrame(group) {
  function rail(w,h,d,color,x,y,z,metalness=0){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,metalness,roughness:.4}));
    mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);
  }
  // Three stepped mouldings and fine beadwork surround each original image.
  for(const [w,h,thickness,z,color,metal] of [[3.64,2.89,.13,.08,'#423222',0],[3.51,2.76,.075,.16,'#a58b51',.65],[3.35,2.60,.045,.18,'#d2b879',.5]]){
    for(const sign of [-1,1]){rail(w,thickness,.09,color,0,sign*(h-thickness)/2,z,metal);rail(thickness,h,.09,color,sign*(w-thickness)/2,0,z,metal);}
  }
  for(const x of [-1.73,1.73])for(const y of [-1.36,1.36]){
    const rosette=new THREE.Mesh(new THREE.TorusGeometry(.055,.018,5,12),new THREE.MeshStandardMaterial({color:'#c5a25d',metalness:.6,roughness:.4}));rosette.position.set(x,y,.22);group.add(rosette);
  }
}
