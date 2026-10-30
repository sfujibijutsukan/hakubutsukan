import * as THREE from 'three';

// Shared construction primitives keep all four rooms on the same walkable footprint.
function workshop(gallery, depth) {
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .75, ...options });
  function mesh(geometry, material, x, y, z) {
    const object = new THREE.Mesh(geometry, material); object.position.set(x,y,z);
    object.castShadow = object.receiveShadow = true; gallery.add(object); return object;
  }
  const box = (w,h,d,color,x,y,z,options) => mesh(new THREE.BoxGeometry(w,h,d), mat(color, options),x,y,z);
  const glow = (w,h,d,color,x,y,z) => mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color,toneMapped:false}),x,y,z);
  function texture(draw, w=1024,h=1024) {
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
  }
  function floor(draw, repeatX=2, repeatZ=(depth+10)/8) {
    const result=box(16,.16,depth+10,'#ffffff',0,-.08,(10-depth)/2);
    result.material.map=texture(draw);result.material.map.wrapS=result.material.map.wrapT=THREE.RepeatWrapping;result.material.map.repeat.set(repeatX,repeatZ);return result;
  }
  function shell(wall,ceiling) {
    for(const x of [-8.15,8.15])box(.3,5.5,depth+10,wall,x,2.75,(10-depth)/2);
    for(const z of [-depth,10])box(16,5.5,.3,wall,0,2.75,z);
    box(16,.2,depth+10,ceiling,0,5.6,(10-depth)/2);
  }
  function point(color,power,x,y,z,distance=18) {const light=new THREE.PointLight(color,power,distance,2);light.position.set(x,y,z);gallery.add(light);}
  function sun(color,power) {
    const light=new THREE.DirectionalLight(color,power);light.position.set(-2,4,-depth+1);light.target.position.set(0,0,-5);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
    Object.assign(light.shadow.camera,{left:-10,right:10,top:20,bottom:-20,near:.5,far:70});light.shadow.normalBias=.035;gallery.add(light,light.target);
  }
  function panel(map,w,h,x,y,z,unlit=false) {return mesh(new THREE.PlaneGeometry(w,h),unlit?new THREE.MeshBasicMaterial({map,transparent:true,toneMapped:false}):mat('#ffffff',{map,transparent:true}),x,y,z);}
  function benches(wood,seat) {
    for(const z of [-1,-13]){if(z < -depth+3)continue;box(2.6,.15,.85,wood,0,.49,z);box(2.6,.16,.85,seat,0,.64,z);for(const x of [-.95,.95])box(.12,.46,.55,wood,x,.24,z);}
  }
  const bays=[];for(let z=1.4;z > -depth+1;z-=6.8)bays.push(z);
  return {mat,mesh,box,glow,texture,floor,shell,point,sun,panel,benches,bays};
}

export function buildLouvre(gallery,depth) {
  const {mat,mesh,box,texture,floor,shell,point,sun,panel,benches,bays}=workshop(gallery,depth);
  const stone='#e2d5ba',gold='#b28b42';shell('#e5d9c4','#e7d9bb');
  const ground=floor((c,w,h)=>{
    const size=256;for(let y=0;y<h;y+=size)for(let x=0;x<w;x+=size){c.fillStyle=((x+y)/size)%2?'#635c52':'#e6dfce';c.fillRect(x,y,size,size);c.strokeStyle='#b8ab91';c.lineWidth=3;c.strokeRect(x,y,size,size);
      for(let i=0;i<9;i++){c.strokeStyle=((x+y)/size)%2?'#c4baa412':'#8d827215';c.beginPath();c.moveTo(x,y+i*37);c.bezierCurveTo(x+90,y+i*37-25,x+160,y+i*37+40,x+size,y+i*37+10);c.stroke();}}
  },2,(depth+10)/8);ground.material.roughness=.42;
  for(const x of [-7.97,7.97]){
    box(.12,.9,depth+10,'#cbbd9e',x,.45,(10-depth)/2);
    for(const y of [.1,.9,4.85,5.07,5.3])box(.24,.09,depth+10,gold,x,y,(10-depth)/2);
    for(let z=-2;z>-depth+2;z-=6.8)box(.1,3.65,5.5,'#773c36',x+(x<0?.04:-.04),2.8,z);
  }
  const fresco=texture((c,w,h)=>{
    c.fillStyle='#b1c9cd';c.fillRect(0,0,w,h);
    for(let i=0;i<18;i++){c.fillStyle=i%2?'#f0e4cd9c':'#ffffff70';c.beginPath();c.ellipse((i*193)%w,(i*137)%h,150,55,-.3,0,Math.PI*2);c.fill();}
    c.strokeStyle='#c2a25e';c.lineWidth=22;c.strokeRect(18,18,w-36,h-36);c.lineWidth=5;c.strokeRect(45,45,w-90,h-90);
    c.fillStyle='#eee0b7';c.beginPath();c.arc(w/2,h/2,110,0,Math.PI*2);c.fill();
    c.strokeStyle='#a58041';c.lineWidth=5;for(let i=0;i<24;i++){const a=i*Math.PI/12;c.beginPath();c.moveTo(w/2+Math.cos(a)*125,h/2+Math.sin(a)*125);c.lineTo(w/2+Math.cos(a)*180,h/2+Math.sin(a)*180);c.stroke();}
  });
  for(const z of bays){
    // Fluted palace columns and a broad gilded entablature.
    for(const x of [-7.7,7.7]){
      mesh(new THREE.CylinderGeometry(.23,.29,3.95,16),mat(stone),x,2.05,z);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;mesh(new THREE.CylinderGeometry(.015,.015,3.55,5),mat('#bfb08f'),x+Math.cos(a)*.25,2.05,z+Math.sin(a)*.25);}
      for(const [y,w,h]of[[.12,.75,.24],[4.05,.7,.2],[4.23,.9,.16]])box(w,h,w,stone,x,y,z);
    }
    box(16,.28,.42,stone,0,4.42,z);box(16,.05,.46,gold,0,4.6,z);
    for(const x of [-5.25,0,5.25]){
      const ceiling=panel(fresco.clone(),4.75,5.9,x,5.43,z-3.2);ceiling.rotation.x=Math.PI/2;
      for(const dx of [-2.45,2.45])box(.14,.12,6.35,gold,x+dx,5.3,z-3.2);
    }
    // A still chandelier: brass hoops, warm candles, and faceted crystal drops.
    box(.035,.55,.035,gold,0,5.08,z-2.6);
    const hoop=mesh(new THREE.TorusGeometry(.65,.035,8,40),mat(gold,{metalness:.65,roughness:.3}),0,4.66,z-2.6);hoop.rotation.x=Math.PI/2;
    for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.cos(a)*.65,zz=z-2.6+Math.sin(a)*.65;
      mesh(new THREE.CylinderGeometry(.025,.025,.28,6),mat(gold),x,4.8,zz);
      mesh(new THREE.SphereGeometry(.05,8,6),new THREE.MeshBasicMaterial({color:'#fff2c6',toneMapped:false}),x,4.98,zz);
      mesh(new THREE.OctahedronGeometry(.075),mat('#e1ecec',{metalness:.3,roughness:.13}),x,4.44,zz);
    }point('#fff0cf',38,0,4.2,z-2.6);
  }
  // Luminous palace windows; the central pyramid is an architectural homage.
  for(const x of [-4,0,4]){
    const window=texture((c,w,h)=>{c.fillStyle='#dbe4df';c.fillRect(0,0,w,h);c.strokeStyle='#b29c6b';c.lineWidth=18;c.strokeRect(12,12,w-24,h-24);for(let xx=170;xx<w;xx+=170){c.beginPath();c.moveTo(xx,0);c.lineTo(xx,h);c.stroke();}for(let y=250;y<h;y+=250){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}});
    panel(window,2.7,3.8,x,2.8,-depth+.17,true);box(3,.15,.4,stone,x,.8,-depth+.3);
  }
  box(1.6,.5,1.6,stone,0,.25,-6.5);
  const pyramid=mesh(new THREE.ConeGeometry(.91,1.5,4),mat('#b2d8db',{transparent:true,opacity:.55,metalness:.3,roughness:.15,depthWrite:false}),0,1.25,-6.5);pyramid.rotation.y=Math.PI/4;
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(pyramid.geometry),new THREE.LineBasicMaterial({color:'#916e35'}));edges.rotation.copy(pyramid.rotation);edges.position.copy(pyramid.position);gallery.add(edges);
  benches('#6b4b31','#8c3f38');sun('#fff3da',2.2);return ground;
}

export function buildJapanese(gallery,depth) {
  const {mat,mesh,box,texture,floor,shell,point,sun,panel,benches,bays}=workshop(gallery,depth);
  const wood='#443024',cedar='#8b5c39',paper='#ede3c7';shell(paper,'#4b3325');
  const ground=floor((c,w,h)=>{
    for(let row=0;row<2;row++)for(let col=0;col<4;col++){
      const x=col*256,y=row*512;c.save();c.translate(x+128,y+256);if((row+col)%2)c.rotate(Math.PI);c.fillStyle=(row+col)%2?'#a5a477':'#b5ad7f';c.fillRect(-128,-256,256,512);
      for(let i=-250;i<256;i+=4){c.strokeStyle=i%8?'#ded3a240':'#5f71402b';c.lineWidth=1;c.beginPath();c.moveTo(-120,i);c.lineTo(120,i);c.stroke();}
      c.fillStyle='#344a39';c.fillRect(-128,-256,12,512);c.fillRect(116,-256,12,512);c.strokeStyle='#647350';c.lineWidth=2;c.strokeRect(-121,-252,242,504);c.restore();
    }
  },2,(depth+10)/8);
  for(const x of [-6.9,6.9])box(2.15,.015,depth+10,cedar,x,.012,(10-depth)/2);
  for(const x of [-7.96,7.96]){
    box(.14,.75,depth+10,wood,x,.375,(10-depth)/2);
    for(const y of [.78,4.6,5.25])box(.22,.13,depth+10,wood,x,y,(10-depth)/2);
    for(let z=8;z>-depth;z-=.85)box(.12,3.8,.035,'#856544',x+(x<0?.035:-.035),2.7,z);
    for(const y of [1.45,2.1,2.75,3.4,4.05])box(.13,.025,depth+10,'#a28a60',x+(x<0?.04:-.04),y,(10-depth)/2);
  }
  for(const z of bays){
    for(const x of [-7.67,7.67]){box(.32,5.1,.35,wood,x,2.55,z);box(.55,.18,.6,cedar,x,4.6,z);}
    box(16,.3,.35,wood,0,4.87,z);box(15.8,.1,.54,cedar,0,4.65,z);
    for(const x of [-5.4,-2.7,0,2.7,5.4])box(.1,.15,6.8,cedar,x,5.35,z-3.4);
    for(let dz=.8;dz<6.8;dz+=1.2)box(16,.12,.08,'#735032',0,5.34,z-dz);
    // Suspended paper lanterns leave the walking aisles unobstructed.
    for(const x of [-5.7,5.7]){
      box(.03,.5,.03,wood,x,4.55,z-2.6);
      mesh(new THREE.CylinderGeometry(.28,.28,.62,16),mat('#f6dfaa',{emissive:'#d69b49',emissiveIntensity:.32}),x,4.03,z-2.6);
      for(const y of [3.7,3.85,4.02,4.19,4.35]){const ring=mesh(new THREE.TorusGeometry(.285,.009,4,24),mat(wood),x,y,z-2.6);ring.rotation.x=Math.PI/2;}
    }point('#ffe1a0',30,0,4.2,z-2.6);
  }
  // A vermilion torii frames a moonlit round window and an ink landscape.
  for(const x of [-2.8,2.8]){box(.3,4.1,.32,'#9e3021',x,2.05,-depth+.7);box(.46,.18,.5,'#30291f',x,.12,-depth+.7);}
  box(6.7,.25,.48,'#9e3021',0,4.4,-depth+.7);box(6.1,.2,.35,'#9e3021',0,3.75,-depth+.7);box(6.9,.12,.54,wood,0,4.58,-depth+.7);
  const moon=texture((c,w,h)=>{
    c.clearRect(0,0,w,h);c.beginPath();c.arc(w/2,h/2,w*.46,0,Math.PI*2);c.save();c.clip();c.fillStyle='#d7cbb1';c.fillRect(0,0,w,h);
    c.fillStyle='#eee3bd';c.beginPath();c.arc(660,300,160,0,Math.PI*2);c.fill();
    for(let i=0;i<4;i++){c.fillStyle=['#a2aaa0','#7f8f81','#5d7668','#3c594b'][i];c.beginPath();c.moveTo(0,h);for(let x=0;x<=w;x+=32)c.lineTo(x,500+i*95+Math.sin(x/160+i*2)*90);c.lineTo(w,h);c.fill();}
    c.restore();c.strokeStyle=wood;c.lineWidth=24;c.beginPath();c.arc(w/2,h/2,w*.46,0,Math.PI*2);c.stroke();
  });panel(moon,4.5,4.5,0,2.5,-depth+.2,true);
  // A compact bonsai and stone basin occupy the existing sculpture footprint.
  box(1.5,.35,1.5,'#79756a',0,.175,-6.5);
  mesh(new THREE.CylinderGeometry(.65,.52,.25,12),mat('#44372c'),0,.49,-6.5);
  const trunk=mesh(new THREE.CylinderGeometry(.07,.16,1.25,9),mat('#4e3a28'),0,1.2,-6.5);trunk.rotation.z=-.2;
  for(const [x,y,z,r]of[[.14,1.85,-6.5,.5],[-.35,1.55,-6.45,.35],[.4,1.48,-6.4,.3]]){const crown=mesh(new THREE.IcosahedronGeometry(r,1),mat('#4b6040'),x,y,z);crown.scale.y=.55;}
  benches(wood,'#756c46');sun('#ffe9bc',1.6);return ground;
}

export function buildCyberpunk(gallery,depth) {
  const {mat,mesh,box,glow,texture,floor,shell,point,panel,benches,bays}=workshop(gallery,depth);
  const cyan='#37e8ef',pink='#fc3fa4',steel='#121d30';shell('#101727','#090e1c');
  const ground=floor((c,w,h)=>{
    c.fillStyle='#111a2c';c.fillRect(0,0,w,h);c.strokeStyle='#2d4058';c.lineWidth=3;
    for(let i=0;i<=w;i+=128){c.beginPath();c.moveTo(i,0);c.lineTo(i,h);c.stroke();c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke();}
    for(let i=0;i<8;i++){c.fillStyle=i%2?'#d32c8225':'#2cbbcc25';c.fillRect(32+i*128,12,8,1000);}
  },2,(depth+10)/8);ground.material.metalness=.5;ground.material.roughness=.3;
  for(const x of [-6.6,6.6]){glow(.035,.012,depth+10,x<0?cyan:pink,x,.018,(10-depth)/2);box(.2,.04,depth+10,steel,x+(x<0?-.2:.2),.02,(10-depth)/2);}
  for(const x of [-7.96,7.96]){
    box(.12,1,depth+10,'#1c2840',x,.5,(10-depth)/2);
    for(const y of [.12,1.04,4.78])glow(.08,.025,depth+10,x<0?cyan:pink,x+(x<0?.04:-.04),y,(10-depth)/2);
    for(let z=8;z>-depth;z-=1.7){box(.11,3.4,1.55,'#17243a',x+(x<0?.035:-.035),2.9,z);}
  }
  for(const [index,z]of bays.entries()){
    const color=index%2?pink:cyan;
    for(const x of [-7.65,7.65]){box(.45,5.2,.45,steel,x,2.6,z);glow(.035,4.7,.03,color,x+(x<0?.24:-.24),2.7,z+.24);}
    box(16,.3,.35,steel,0,5,z);glow(15.2,.035,.03,color,0,4.82,z+.2);
    for(const x of [-4.5,4.5]){box(.9,.2,6.8,'#203047',x,5.35,z-3.4);glow(.06,.025,5.8,x<0?cyan:pink,x,5.23,z-3.4);}
    // Solid conduits and suspended data panels; no flicker or animated strobing.
    for(const x of [-7.4,7.4]){const pipe=mesh(new THREE.CylinderGeometry(.09,.09,6.8,8),mat('#2b3b50',{metalness:.6}),x,4.45,z-3.4);pipe.rotation.x=Math.PI/2;}
    point(index%2?'#f83db1':'#35cadf',24,0,4.3,z-2.5);
  }
  const skyline=texture((c,w,h)=>{
    c.fillStyle='#070d23';c.fillRect(0,0,w,h);c.fillStyle='#382751';c.beginPath();c.arc(680,280,170,0,Math.PI*2);c.fill();
    for(let i=0;i<18;i++){const x=i*65,y=280+(i*137)%400;c.fillStyle=i%2?'#152d45':'#231c3b';c.fillRect(x,y,60,h-y);for(let yy=y+18;yy<h;yy+=35){c.fillStyle=i%3?'#32dde4':'#f445b1';c.fillRect(x+8,yy,10,3);c.fillRect(x+30,yy,14,3);}}
    c.fillStyle=cyan;c.font='bold 42px monospace';c.fillText('ARCHIVE / 09',45,120);c.fillStyle=pink;c.font='22px monospace';c.fillText('MEMORY IS A PLACE',45,163);
  });panel(skyline,8,4.1,0,2.8,-depth+.18,true);
  for(const x of [-4.15,4.15])glow(.04,4.3,.03,cyan,x,2.8,-depth+.23);
  box(1.5,.48,1.5,steel,0,.24,-6.5);glow(1.48,.035,1.48,cyan,0,.5,-6.5);
  const core=mesh(new THREE.OctahedronGeometry(.6),new THREE.MeshBasicMaterial({color:cyan,wireframe:true,toneMapped:false}),0,1.45,-6.5);core.rotation.y=.4;
  for(const y of [.78,2.1]){const ring=mesh(new THREE.TorusGeometry(.7,.018,6,48),new THREE.MeshBasicMaterial({color:pink,toneMapped:false}),0,y,-6.5);ring.rotation.x=Math.PI/2;}
  benches(steel,'#25304a');return ground;
}

export function decorateThemedFrame(group,theme) {
  const rail=(w,h,color,x,y,z,emissive=false)=>{const m=emissive?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshStandardMaterial({color,roughness:.6,metalness:theme==='louvre'?.6:0});const object=new THREE.Mesh(new THREE.BoxGeometry(w,h,.07),m);object.position.set(x,y,z);group.add(object);};
  const color=theme==='louvre'?'#c6a05a':theme==='japanese'?'#493222':'#38e5ec';
  for(const sign of [-1,1]){rail(3.55,.08,color,0,sign*1.38,.16,theme==='cyberpunk');rail(.08,2.84,color,sign*1.74,0,.16,theme==='cyberpunk');}
  if(theme==='louvre')for(const sign of [-1,1]){rail(3.7,.06,'#926c32',0,sign*1.49,.13);rail(.06,3.04,'#926c32',sign*1.82,0,.13);}
  if(theme==='japanese')for(const sign of [-1,1])rail(.1,3.12,'#30271d',sign*1.81,0,.13);
  if(theme==='cyberpunk')for(const sign of [-1,1])rail(.36,.045,'#fb3e9e',sign*1.56,sign*1.5,.18,true);
}
